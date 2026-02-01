# ruff: noqa: S608 - All CQL queries use keyspace from config, not user input
"""Registration link service layer.

Business logic for:
- Creating registration links
- Validating links
- Completing registrations
- Listing and revoking links
"""

import contextlib
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from src.auth.models import User
from src.auth.permissions import UserRole
from src.core.logging import get_logger

from .models import LinkSource, LinkStatus, RegistrationLink
from .schemas import CompleteRegistrationRequest, CoursePreview
from .security import generate_shortcode, generate_token, hash_token, verify_token


if TYPE_CHECKING:
    from cassandra.cluster import Session
    from redis.asyncio import Redis


logger = get_logger(__name__)


# ==============================================================================
# Constants
# ==============================================================================

# Number of digits to show in CPF suffix for logging (last N digits)
CPF_SUFFIX_DISPLAY_LENGTH = 4


# ==============================================================================
# Exceptions
# ==============================================================================


class DatabaseError(Exception):
    """Raised when a database operation fails.

    Wraps underlying database exceptions (Cassandra, etc.) with a user-friendly
    message while preserving the original error for logging.
    """

    def __init__(self, message: str, original_error: Exception | None = None):
        super().__init__(message)
        self.original_error = original_error


class LinkNotFoundError(Exception):
    """Raised when a registration link is not found."""


class LinkExpiredError(Exception):
    """Raised when a registration link has expired."""


class LinkAlreadyUsedError(Exception):
    """Raised when a registration link has already been used."""


class LinkRevokedError(Exception):
    """Raised when a registration link has been revoked."""


class DuplicateUserError(Exception):
    """Raised when user data conflicts with existing user (different user).

    This is raised when email belongs to one user and CPF belongs to another,
    or when only one field matches but the other doesn't.

    Note: For security, the public message should be generic to prevent
    user enumeration. The field is stored for internal logging only.
    """

    # Generic message to prevent user enumeration (in Portuguese)
    GENERIC_MESSAGE = (
        "Os dados informados estão em conflito com uma conta existente. "
        "Se você já possui uma conta, faça login com seu e-mail cadastrado."
    )

    def __init__(self, internal_message: str, field: str | None = None):
        # Always use generic message for external consumption
        super().__init__(self.GENERIC_MESSAGE)
        # Store details for internal logging (not exposed to user)
        self._internal_message = internal_message
        self._field = field

    @property
    def internal_message(self) -> str:
        """Get internal message for logging."""
        return self._internal_message

    @property
    def field(self) -> str | None:
        """Get field that caused conflict for logging."""
        return self._field


class ExistingUserFoundError(Exception):
    """Raised when user already exists and can receive course access.

    This is NOT an error - it signals that instead of creating a new user,
    we should grant course access to the existing user.
    """

    def __init__(self, user: User):
        self.user = user
        super().__init__(f"User {user.id} already exists")


class CourseGrantError(Exception):
    """Raised when course access grant fails.

    Attributes:
        failed_courses: List of course IDs that failed to grant
        granted_courses: List of course IDs that were successfully granted
    """

    def __init__(
        self,
        message: str,
        failed_courses: list[UUID] | None = None,
        granted_courses: list[UUID] | None = None,
    ):
        super().__init__(message)
        self.failed_courses = failed_courses or []
        self.granted_courses = granted_courses or []


class InvalidCourseError(Exception):
    """Raised when one or more course IDs are invalid.

    Attributes:
        invalid_ids: List of course IDs that were not found
    """

    # Maximum number of course IDs to display in error message
    MAX_DISPLAY_IDS = 3

    def __init__(self, invalid_ids: list[UUID]):
        self.invalid_ids = invalid_ids
        ids_str = ", ".join(str(cid) for cid in invalid_ids[: self.MAX_DISPLAY_IDS])
        if len(invalid_ids) > self.MAX_DISPLAY_IDS:
            ids_str += f" (and {len(invalid_ids) - self.MAX_DISPLAY_IDS} more)"
        super().__init__(f"Invalid course IDs: {ids_str}")


class RegistrationLinkService:
    """Service for registration link management."""

    def __init__(
        self,
        session: "Session",
        keyspace: str,
        redis: "Redis | None" = None,
        auth_service=None,
        acquisition_service=None,
        course_service=None,
    ):
        """Initialize with Cassandra session and optional dependencies.

        Args:
            session: Cassandra session with aexecute support
            keyspace: Target keyspace
            redis: Optional Redis for rate limiting
            auth_service: AuthService for user creation
            acquisition_service: AcquisitionService for granting course access
            course_service: CourseService for course validation and info retrieval
        """
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self.auth_service = auth_service
        self.acquisition_service = acquisition_service
        self.course_service = course_service
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        # Insert link
        self._insert_link = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.registration_links
            (id, shortcode, token_hash, status, expires_at, created_at, created_by,
             source, notes, prefill_phone, course_ids, user_id, used_at, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Insert into lookup table
        self._insert_lookup = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.registration_links_by_shortcode
            (shortcode, link_id, token_hash, status, expires_at, course_ids, prefill_phone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """)

        # Get link by ID
        self._get_by_id = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.registration_links
            WHERE id = ?
        """)

        # Get link by shortcode (from lookup table)
        self._get_by_shortcode = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.registration_links_by_shortcode
            WHERE shortcode = ?
        """)

        # Get full link by shortcode (main table with index)
        self._get_full_by_shortcode = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.registration_links
            WHERE shortcode = ?
            ALLOW FILTERING
        """)

        # Update link status (main table)
        self._update_status = self.session.prepare(f"""
            UPDATE {self.keyspace}.registration_links
            SET status = ?
            WHERE id = ?
        """)

        # Update lookup table status
        self._update_lookup_status = self.session.prepare(f"""
            UPDATE {self.keyspace}.registration_links_by_shortcode
            SET status = ?
            WHERE shortcode = ?
        """)

        # Update link with user metadata (status already changed by atomic reservation)
        self._mark_used = self.session.prepare(f"""
            UPDATE {self.keyspace}.registration_links
            SET user_id = ?, used_at = ?, ip_address = ?, user_agent = ?
            WHERE id = ?
        """)

        # List links (all for now, can add pagination later)
        self._list_links = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.registration_links
            LIMIT ?
        """)

        # Check shortcode exists
        self._check_shortcode = self.session.prepare(f"""
            SELECT shortcode FROM {self.keyspace}.registration_links_by_shortcode
            WHERE shortcode = ?
        """)

        # Atomic link reservation using LWT (Lightweight Transaction)
        # This uses IF clause to ensure atomic compare-and-swap
        self._reserve_link_atomic = self.session.prepare(f"""
            UPDATE {self.keyspace}.registration_links
            SET status = ?
            WHERE id = ?
            IF status = ?
        """)

    # ==========================================================================
    # Link Creation
    # ==========================================================================

    async def create_link(
        self,
        course_ids: list[UUID],
        created_by: UUID | None = None,
        expires_in_days: int = 7,
        prefill_phone: str | None = None,
        notes: str | None = None,
        source: LinkSource = LinkSource.API,
    ) -> tuple[RegistrationLink, str]:
        """Create a new registration link.

        Args:
            course_ids: Courses to grant access to upon registration
            created_by: User ID who created the link
            expires_in_days: Days until expiration
            prefill_phone: Phone number to pre-fill
            notes: Internal notes
            source: Source of the link

        Returns:
            Tuple of (RegistrationLink, raw_token)

        Raises:
            ValueError: If course_ids is empty
            InvalidCourseError: If any course_id does not exist
        """
        if not course_ids:
            raise ValueError("At least one course ID is required")

        # Validate that all courses exist
        await self._validate_course_ids(course_ids)

        # Generate unique shortcode
        shortcode = await self._generate_unique_shortcode()

        # Generate token and hash
        token = generate_token()
        token_hash = hash_token(token)

        # Calculate expiration
        expires_at = datetime.now(UTC) + timedelta(days=expires_in_days)

        # Create link entity
        link = RegistrationLink(
            shortcode=shortcode,
            token_hash=token_hash,
            course_ids=set(course_ids),
            expires_at=expires_at,
            created_by=created_by,
            source=source,
            notes=notes,
            prefill_phone=prefill_phone,
        )

        # Save to both tables
        await self._save_link(link)

        logger.info(
            "registration_link_created",
            link_id=str(link.id),
            shortcode=shortcode,
            course_count=len(course_ids),
            expires_in_days=expires_in_days,
            source=source.value,
        )

        return link, token

    async def _validate_course_ids(self, course_ids: list[UUID]) -> None:
        """Validate that all course IDs exist.

        Args:
            course_ids: List of course IDs to validate

        Raises:
            InvalidCourseError: If any course ID does not exist
        """
        if not self.course_service:
            # If CourseService is not configured, skip validation
            # This allows backward compatibility in development/testing
            logger.warning(
                "course_validation_skipped",
                reason="CourseService not configured",
                course_count=len(course_ids),
            )
            return

        invalid_ids: list[UUID] = []
        for course_id in course_ids:
            course = await self.course_service.get_course(course_id)
            if not course:
                invalid_ids.append(course_id)

        if invalid_ids:
            logger.warning(
                "invalid_course_ids_detected",
                invalid_count=len(invalid_ids),
                invalid_ids=[str(cid) for cid in invalid_ids],
            )
            raise InvalidCourseError(invalid_ids)

    async def _generate_unique_shortcode(self, max_attempts: int = 10) -> str:
        """Generate a unique shortcode.

        Args:
            max_attempts: Maximum generation attempts

        Returns:
            Unique shortcode

        Raises:
            RuntimeError: If unable to generate unique shortcode
        """
        for _ in range(max_attempts):
            shortcode = generate_shortcode()
            result = await self.session.aexecute(
                self._check_shortcode,
                [shortcode],
            )
            if not result:
                return shortcode

        msg = "Unable to generate unique shortcode after multiple attempts"
        raise RuntimeError(msg)

    async def _save_link(self, link: RegistrationLink) -> None:
        """Save link to both tables (dual-write pattern).

        Raises:
            DatabaseError: If database operation fails
        """
        try:
            # Main table
            await self.session.aexecute(
                self._insert_link,
                [
                    link.id,
                    link.shortcode,
                    link.token_hash,
                    link.status.value,
                    link.expires_at,
                    link.created_at,
                    link.created_by,
                    link.source.value,
                    link.notes,
                    link.prefill_phone,
                    link.course_ids,
                    link.user_id,
                    link.used_at,
                    link.ip_address,
                    link.user_agent,
                ],
            )

            # Lookup table
            await self.session.aexecute(
                self._insert_lookup,
                [
                    link.shortcode,
                    link.id,
                    link.token_hash,
                    link.status.value,
                    link.expires_at,
                    link.course_ids,
                    link.prefill_phone,
                ],
            )
        except Exception as e:
            logger.exception(
                "database_error_save_link",
                link_id=str(link.id),
                shortcode=link.shortcode,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise DatabaseError(
                "Erro ao salvar link de cadastro. Por favor, tente novamente.",
                original_error=e,
            ) from e

    # ==========================================================================
    # Link Validation
    # ==========================================================================

    async def validate_link(
        self,
        shortcode: str,
        token: str,
    ) -> RegistrationLink:
        """Validate a registration link.

        Args:
            shortcode: Link shortcode
            token: Link token

        Returns:
            RegistrationLink if valid

        Raises:
            LinkNotFoundError: If link doesn't exist
            LinkExpiredError: If link has expired
            LinkAlreadyUsedError: If link was already used
            LinkRevokedError: If link was revoked
            ValueError: If token is invalid
        """
        # Get from lookup table first (faster)
        result = await self.session.aexecute(
            self._get_by_shortcode,
            [shortcode],
        )

        if not result:
            raise LinkNotFoundError(f"Link not found: {shortcode}")

        link = RegistrationLink.from_lookup_row(result[0])

        # Check status
        if link.status == LinkStatus.USED:
            raise LinkAlreadyUsedError("This link has already been used")
        if link.status == LinkStatus.REVOKED:
            raise LinkRevokedError("This link has been revoked")
        if link.status == LinkStatus.EXPIRED or link.is_expired():
            raise LinkExpiredError("This link has expired")

        # Verify token
        if not verify_token(token, link.token_hash):
            raise ValueError("Invalid token")

        return link

    async def get_link_for_display(
        self,
        shortcode: str,
        token: str,
    ) -> tuple[RegistrationLink, list[CoursePreview]]:
        """Get link info for display (with course previews).

        Args:
            shortcode: Link shortcode
            token: Link token

        Returns:
            Tuple of (RegistrationLink, list of CoursePreview)
        """
        link = await self.validate_link(shortcode, token)

        # Get course previews
        courses = await self._get_course_previews(link.course_ids)

        return link, courses

    async def _get_course_previews(self, course_ids: set[UUID]) -> list[CoursePreview]:
        """Get course previews for display.

        Args:
            course_ids: Set of course IDs

        Returns:
            List of CoursePreview objects with titles from CourseService
        """
        courses = []
        for course_id in course_ids:
            title = "Curso"  # Default fallback
            thumbnail_url = None

            # Query CourseService if available
            if self.course_service:
                try:
                    course = await self.course_service.get_course(course_id)
                    if course:
                        title = course.title
                        thumbnail_url = getattr(course, "thumbnail_url", None)
                except Exception as e:
                    logger.warning(
                        "course_preview_fetch_failed",
                        course_id=str(course_id),
                        error=str(e),
                    )

            courses.append(
                CoursePreview(
                    id=course_id,
                    title=title,
                    thumbnail_url=thumbnail_url,
                )
            )

        return courses

    # ==========================================================================
    # Registration Completion
    # ==========================================================================

    async def complete_registration(
        self,
        shortcode: str,
        request: CompleteRegistrationRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, list[CoursePreview], str, bool]:
        """Complete registration using a link.

        Args:
            shortcode: Link shortcode
            request: Registration data
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            Tuple of (User, granted courses, access_token, is_existing_user)

        Raises:
            LinkNotFoundError: If link doesn't exist
            LinkExpiredError: If link has expired
            LinkAlreadyUsedError: If link was already used
            LinkRevokedError: If link was revoked
            ValueError: If token is invalid
            DuplicateUserError: If email/CPF/CNPJ conflict (different users)
        """
        if not self.auth_service:
            msg = "AuthService not configured"
            raise RuntimeError(msg)

        # Validate link
        link = await self.validate_link(shortcode, request.token)

        # Validate passwords match
        if request.password != request.confirm_password:
            raise ValueError("Passwords do not match")

        # CRITICAL: Atomically reserve the link BEFORE any user operations
        # This uses Cassandra LWT to prevent race conditions where multiple
        # concurrent requests could use the same link
        reserved = await self._reserve_link_atomically(
            link_id=link.id,
            shortcode=link.shortcode,
        )
        if not reserved:
            # Link was already used by another concurrent request
            raise LinkAlreadyUsedError

        # Check for existing users - may raise ExistingUserFoundError
        is_existing_user = False
        user: User | None = None

        try:
            await self._check_user_uniqueness(
                email=request.email,
                cpf=request.cpf,
                _cnpj=request.cnpj,
            )
            # No existing user - create new one
            user = await self._create_user(request, link.id)

        except ExistingUserFoundError as e:
            # Same user found by email AND cpf - grant course access to existing user
            user = e.user
            is_existing_user = True
            logger.info(
                "existing_user_course_grant",
                link_id=str(link.id),
                shortcode=shortcode,
                user_id=str(user.id),
                email=user.email,
            )

        # Update link with user metadata (status already changed by atomic reservation)
        await self._mark_link_used(
            link_id=link.id,
            shortcode=link.shortcode,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Generate access token BEFORE course grant
        # This ensures user can login even if course grant fails
        access_token = self.auth_service.create_access_token(user)

        # Grant course access (may fail partially - CourseGrantError)
        # Even if this fails, the user is created, link is used, and token is ready
        try:
            courses_granted = await self._grant_course_access(
                user_id=user.id,
                course_ids=link.course_ids,
            )

            log_event = (
                "existing_user_courses_granted"
                if is_existing_user
                else "registration_completed"
            )
            logger.info(
                log_event,
                link_id=str(link.id),
                shortcode=shortcode,
                user_id=str(user.id),
                email=user.email,
                courses_granted=len(courses_granted),
                is_existing_user=is_existing_user,
            )

            return user, courses_granted, access_token, is_existing_user

        except CourseGrantError as e:
            # Log the partial failure
            logger.error(
                "registration_partial_failure",
                link_id=str(link.id),
                shortcode=shortcode,
                user_id=str(user.id),
                email=user.email,
                failed_courses=len(e.failed_courses),
                granted_courses=len(e.granted_courses),
                error=str(e),
                is_existing_user=is_existing_user,
            )
            # Re-raise with access_token attached for router to use
            e.access_token = access_token  # type: ignore[attr-defined]
            e.user = user  # type: ignore[attr-defined]
            e.is_existing_user = is_existing_user  # type: ignore[attr-defined]
            raise

    async def _check_user_uniqueness(
        self,
        email: str,
        cpf: str,
        _cnpj: str,  # Reserved for future duplicate check
    ) -> User | None:
        """Check if user data conflicts with existing users.

        Security note: This method raises a generic error message to prevent
        user enumeration. The specific field is logged for internal monitoring.

        Args:
            email: User email
            cpf: User CPF
            _cnpj: User CNPJ (reserved for future validation)

        Returns:
            User if same user exists (email AND cpf match), None if new user

        Raises:
            DuplicateUserError: If email and cpf belong to DIFFERENT users
            ExistingUserFoundError: If same user found (email AND cpf match)
        """
        user_by_email = await self.auth_service.get_user_by_email(email)
        user_by_cpf = await self.auth_service.get_user_by_cpf(cpf)

        # Case 1: Neither exists - new user, proceed with registration
        if not user_by_email and not user_by_cpf:
            return None

        # Case 2: Same user found by both email AND cpf
        if user_by_email and user_by_cpf and user_by_email.id == user_by_cpf.id:
            logger.info(
                "existing_user_found",
                user_id=str(user_by_email.id),
                email_domain=email.split("@")[-1] if "@" in email else "invalid",
            )
            raise ExistingUserFoundError(user_by_email)

        # Case 3: Email exists but CPF doesn't - conflict (different user scenario)
        if user_by_email and not user_by_cpf:
            logger.warning(
                "duplicate_user_conflict",
                conflict_type="email_only",
                email_domain=email.split("@")[-1] if "@" in email else "invalid",
            )
            raise DuplicateUserError(
                "Email registered with different CPF",
                "email_cpf_mismatch",
            )

        # Case 4: CPF exists but email doesn't - conflict (different user scenario)
        if user_by_cpf and not user_by_email:
            logger.warning(
                "duplicate_user_conflict",
                conflict_type="cpf_only",
                cpf_suffix=cpf[-CPF_SUFFIX_DISPLAY_LENGTH:]
                if len(cpf) >= CPF_SUFFIX_DISPLAY_LENGTH
                else "****",
            )
            raise DuplicateUserError(
                "CPF registered with different email",
                "cpf_email_mismatch",
            )

        # Case 5: Both exist but are DIFFERENT users - conflict
        if user_by_email and user_by_cpf and user_by_email.id != user_by_cpf.id:
            logger.warning(
                "duplicate_user_conflict",
                conflict_type="different_users",
                email_user_id=str(user_by_email.id),
                cpf_user_id=str(user_by_cpf.id),
            )
            raise DuplicateUserError(
                "Email and CPF belong to different users",
                "different_users",
            )

        return None  # Should never reach here, but satisfy type checker

    async def _create_user(
        self,
        request: CompleteRegistrationRequest,
        registration_link_id: UUID,
    ) -> User:
        """Create a new user from registration request.

        Args:
            request: Registration data
            registration_link_id: ID of the registration link used

        Returns:
            Created User
        """
        return await self.auth_service.create_user(
            email=request.email,
            password=request.password,
            name=request.full_name,
            phone=request.whatsapp,
            cpf=request.cpf,
            role=UserRole.STUDENT.value,
            # Address
            address_street=request.street,
            address_number=request.number,
            address_complement=request.complement,
            address_neighborhood=request.neighborhood,
            address_city=request.city,
            address_state=request.state,
            address_zip_code=request.zip_code,
            # Company fields
            cnpj=request.cnpj,
            store_type=request.store_type.value,
            business_model=request.business_model.value,
            units_count=request.units_count,
            erp_system=request.erp_system,
            instagram=request.instagram,
            monthly_revenue=request.monthly_revenue.value,
            birth_date=request.birth_date,
            registration_link_id=registration_link_id,
        )

    async def _get_course_title(self, course_id: UUID) -> str:
        """Get course title by ID.

        Args:
            course_id: Course ID to get title for

        Returns:
            Course title, or "Curso" as fallback if not found
        """
        if not self.course_service:
            return "Curso"

        try:
            course = await self.course_service.get_course(course_id)
            return course.title if course else "Curso"
        except Exception as e:
            logger.warning(
                "course_title_fetch_failed",
                course_id=str(course_id),
                error=str(e),
            )
            return "Curso"

    async def _grant_course_access(
        self,
        user_id: UUID,
        course_ids: set[UUID],
    ) -> list[CoursePreview]:
        """Grant course access to user.

        Args:
            user_id: User ID
            course_ids: Course IDs to grant

        Returns:
            List of CoursePreview for granted courses

        Raises:
            CourseGrantError: If any course grant fails (with details of partial success)
        """
        granted_courses: list[CoursePreview] = []
        failed_course_ids: list[UUID] = []
        errors: list[str] = []

        if self.acquisition_service:
            for course_id in course_ids:
                try:
                    await self.acquisition_service.grant_access(
                        user_id=user_id,
                        course_id=course_id,
                        granted_by=None,  # System grant via registration link
                        notes="Granted via registration link",
                    )

                    # Get course title for user-friendly response
                    course_title = await self._get_course_title(course_id)

                    granted_courses.append(
                        CoursePreview(
                            id=course_id,
                            title=course_title,
                        )
                    )
                    logger.info(
                        "course_access_granted",
                        user_id=str(user_id),
                        course_id=str(course_id),
                        course_title=course_title,
                    )
                except ValueError as e:
                    # Check if this is "already has access" - treat as success
                    error_msg = str(e).lower()
                    if (
                        "already has access" in error_msg
                        or "already has active access" in error_msg
                    ):
                        # User already has access - this is fine, not an error
                        logger.info(
                            "course_access_already_exists",
                            user_id=str(user_id),
                            course_id=str(course_id),
                            note="User already has access, treating as success",
                        )
                        # Get course title and add to granted list
                        course_title = await self._get_course_title(course_id)
                        granted_courses.append(
                            CoursePreview(
                                id=course_id,
                                title=course_title,
                            )
                        )
                    else:
                        # Other ValueError - actual failure
                        failed_course_ids.append(course_id)
                        errors.append(str(e))
                        logger.error(
                            "course_grant_failed",
                            user_id=str(user_id),
                            course_id=str(course_id),
                            error=str(e),
                            error_type=type(e).__name__,
                        )
                except (RuntimeError, KeyError) as e:
                    # Specific expected exceptions from acquisition service
                    failed_course_ids.append(course_id)
                    errors.append(str(e))
                    logger.error(
                        "course_grant_failed",
                        user_id=str(user_id),
                        course_id=str(course_id),
                        error=str(e),
                        error_type=type(e).__name__,
                    )
                except Exception as e:
                    # Unexpected exception - log full details for debugging
                    failed_course_ids.append(course_id)
                    errors.append(str(e))
                    logger.exception(
                        "course_grant_unexpected_error",
                        user_id=str(user_id),
                        course_id=str(course_id),
                        error=str(e),
                        error_type=type(e).__name__,
                    )

            # Check if any grants failed
            if failed_course_ids:
                error_msg = (
                    f"Failed to grant access to {len(failed_course_ids)} course(s). "
                    f"Granted: {len(granted_courses)}, Failed: {len(failed_course_ids)}. "
                    f"Errors: {'; '.join(errors[:3])}"  # Limit error message size
                )
                raise CourseGrantError(
                    message=error_msg,
                    failed_courses=failed_course_ids,
                    granted_courses=[c.id for c in granted_courses],
                )
        else:
            # No acquisition service configured - log warning and return course previews
            # This allows registration to work in development/testing without full setup
            logger.warning(
                "course_grant_no_service",
                user_id=str(user_id),
                course_count=len(course_ids),
                note="Acquisition service not configured - courses not actually granted",
            )
            # Still try to get course titles for better UX
            for cid in course_ids:
                title = await self._get_course_title(cid)
                granted_courses.append(
                    CoursePreview(id=cid, title=f"{title} (pendente)")
                )

        return granted_courses

    async def _reserve_link_atomically(
        self,
        link_id: UUID,
        shortcode: str,
    ) -> bool:
        """Atomically reserve a link for use using LWT.

        Uses Cassandra's Lightweight Transaction (LWT) to atomically
        change status from PENDING to USED, preventing race conditions
        where multiple concurrent requests could use the same link.

        Args:
            link_id: Link ID to reserve
            shortcode: Link shortcode (for lookup table update)

        Returns:
            True if reservation succeeded, False if link was already used

        Raises:
            DatabaseError: If database operation fails
        """
        try:
            # Atomic compare-and-swap: set status to USED only if currently PENDING
            result = await self.session.aexecute(
                self._reserve_link_atomic,
                [
                    LinkStatus.USED.value,  # new status
                    link_id,  # WHERE id = ?
                    LinkStatus.PENDING.value,  # IF status = ?
                ],
            )

            # LWT returns [applied] column - True if update was applied
            # The cassandra-driver returns this as the first element of the row
            # or as an attribute named 'applied' (without brackets)
            row = result[0] if result else None

            # Try multiple ways to access the [applied] field
            # The field name varies by driver version and row factory
            was_applied = False
            if row is not None:
                # Method 1: Try accessing as first element (index 0)
                # LWT results have [applied] as the first column
                with contextlib.suppress(IndexError, TypeError):
                    was_applied = bool(row[0])

                # Method 2: Try as 'applied' attribute (some drivers normalize the name)
                if not was_applied:
                    was_applied = bool(getattr(row, "applied", False))

            # Log the raw result for debugging
            logger.debug(
                "lwt_result_debug",
                link_id=str(link_id),
                row_type=type(row).__name__ if row else "None",
                row_repr=repr(row)[:200] if row else "None",
                was_applied=was_applied,
            )

            if was_applied:
                # Update lookup table (best effort - main table is source of truth)
                try:
                    await self.session.aexecute(
                        self._update_lookup_status,
                        [LinkStatus.USED.value, shortcode],
                    )
                    logger.debug(
                        "lookup_table_updated",
                        link_id=str(link_id),
                        shortcode=shortcode,
                    )
                except Exception as e:
                    # Log but don't fail - main table update succeeded
                    logger.warning(
                        "lookup_table_update_failed",
                        link_id=str(link_id),
                        shortcode=shortcode,
                        error=str(e),
                    )

                logger.info(
                    "link_reserved_atomically",
                    link_id=str(link_id),
                    shortcode=shortcode,
                )
                return True

            # Link was not in PENDING status - someone else got it first
            # Determine the actual current status for better debugging
            current_status = "unknown"
            if row is None:
                current_status = "database_returned_empty"
            else:
                # Try to get the current status from the LWT response
                # When LWT fails, Cassandra returns the current values
                try:
                    # Try index 1 (status is second column after [applied])
                    current_status = str(row[1]) if len(row) > 1 else "no_status_in_row"
                except (IndexError, TypeError):
                    # Try as attribute
                    current_status = getattr(row, "status", "status_field_missing")

            logger.warning(
                "link_reservation_failed_not_pending",
                link_id=str(link_id),
                shortcode=shortcode,
                current_status=current_status,
                row_returned=row is not None,
                row_length=len(row) if row and hasattr(row, "__len__") else 0,
            )
            return False

        except Exception as e:
            logger.exception(
                "database_error_reserve_link",
                link_id=str(link_id),
                shortcode=shortcode,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise DatabaseError(
                "Erro ao processar link de cadastro. Por favor, tente novamente.",
                original_error=e,
            ) from e

    async def _mark_link_used(
        self,
        link_id: UUID,
        shortcode: str,
        user_id: UUID,
        ip_address: str | None,
        user_agent: str | None,
    ) -> None:
        """Update link with user metadata after atomic reservation.

        Note: The link status was already changed to USED by _reserve_link_atomically().
        This method only updates the additional metadata (user_id, used_at, ip, user_agent).

        Args:
            link_id: Link ID
            shortcode: Link shortcode (for logging)
            user_id: User who used the link
            ip_address: Client IP
            user_agent: Client user agent

        Raises:
            DatabaseError: If database operation fails
        """
        now = datetime.now(UTC)

        try:
            # Update main table with user metadata
            # Note: status was already changed by _reserve_link_atomically()
            await self.session.aexecute(
                self._mark_used,
                [
                    user_id,
                    now,
                    ip_address,
                    user_agent,
                    link_id,
                ],
            )

            logger.info(
                "link_metadata_updated",
                link_id=str(link_id),
                shortcode=shortcode,
                user_id=str(user_id),
            )
        except Exception as e:
            logger.exception(
                "database_error_mark_link_used",
                link_id=str(link_id),
                shortcode=shortcode,
                user_id=str(user_id),
                error=str(e),
                error_type=type(e).__name__,
            )
            raise DatabaseError(
                "Erro ao atualizar link de cadastro. Por favor, tente novamente.",
                original_error=e,
            ) from e

    # ==========================================================================
    # Link Management
    # ==========================================================================

    async def get_link_by_id(self, link_id: UUID) -> RegistrationLink | None:
        """Get a link by ID.

        Args:
            link_id: Link ID

        Returns:
            RegistrationLink or None
        """
        result = await self.session.aexecute(
            self._get_by_id,
            [link_id],
        )

        if not result:
            return None

        return RegistrationLink.from_row(result[0])

    async def revoke_link(self, link_id: UUID) -> bool:
        """Revoke a registration link.

        Args:
            link_id: Link ID to revoke

        Returns:
            True if revoked, False if not found or already used
        """
        link = await self.get_link_by_id(link_id)

        if not link:
            return False

        if link.status != LinkStatus.PENDING:
            return False

        # Update both tables
        await self.session.aexecute(
            self._update_status,
            [LinkStatus.REVOKED.value, link_id],
        )

        await self.session.aexecute(
            self._update_lookup_status,
            [LinkStatus.REVOKED.value, link.shortcode],
        )

        logger.info(
            "registration_link_revoked",
            link_id=str(link_id),
            shortcode=link.shortcode,
        )

        return True

    async def list_links(
        self,
        created_by: UUID | None = None,
        status: LinkStatus | None = None,
        limit: int = 100,
    ) -> list[RegistrationLink]:
        """List registration links.

        Args:
            created_by: Filter by creator (optional)
            status: Filter by status (optional)
            limit: Maximum results

        Returns:
            List of RegistrationLink objects
        """
        result = await self.session.aexecute(
            self._list_links,
            [limit],
        )

        links = []
        for row in result:
            link = RegistrationLink.from_row(row)

            # Apply filters
            if created_by and link.created_by != created_by:
                continue
            if status and link.status != status:
                continue

            links.append(link)

        return links
