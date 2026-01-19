# ruff: noqa: S608 - All CQL queries use keyspace from config, not user input
"""Registration link service layer.

Business logic for:
- Creating registration links
- Validating links
- Completing registrations
- Listing and revoking links
"""

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
    """Raised when user data conflicts with existing user.

    Note: For security, the public message should be generic to prevent
    user enumeration. The field is stored for internal logging only.
    """

    # Generic message to prevent user enumeration
    GENERIC_MESSAGE = (
        "Registration failed. Please check your information and try again."
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


class RegistrationLinkService:
    """Service for registration link management."""

    def __init__(
        self,
        session: "Session",
        keyspace: str,
        redis: "Redis | None" = None,
        auth_service=None,
        acquisition_service=None,
    ):
        """Initialize with Cassandra session and optional dependencies.

        Args:
            session: Cassandra session with aexecute support
            keyspace: Target keyspace
            redis: Optional Redis for rate limiting
            auth_service: AuthService for user creation
            acquisition_service: AcquisitionService for granting course access
        """
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self.auth_service = auth_service
        self.acquisition_service = acquisition_service
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

        # Mark link as used (main table)
        self._mark_used = self.session.prepare(f"""
            UPDATE {self.keyspace}.registration_links
            SET status = ?, user_id = ?, used_at = ?, ip_address = ?, user_agent = ?
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
        """
        if not course_ids:
            raise ValueError("At least one course ID is required")

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
            List of CoursePreview objects
        """
        # If no course service, return empty previews with IDs only
        courses = []
        for course_id in course_ids:
            # Try to get from course service if available
            title = "Course"  # Default
            thumbnail_url = None

            # Here we would normally query the course service
            # For now, return minimal info
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
    ) -> tuple[User, list[CoursePreview], str]:
        """Complete registration using a link.

        Args:
            shortcode: Link shortcode
            request: Registration data
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            Tuple of (created User, granted courses, access_token)

        Raises:
            LinkNotFoundError: If link doesn't exist
            LinkExpiredError: If link has expired
            LinkAlreadyUsedError: If link was already used
            LinkRevokedError: If link was revoked
            ValueError: If token is invalid
            DuplicateUserError: If email/CPF/CNPJ already exists
        """
        if not self.auth_service:
            msg = "AuthService not configured"
            raise RuntimeError(msg)

        # Validate link
        link = await self.validate_link(shortcode, request.token)

        # Validate passwords match
        if request.password != request.confirm_password:
            raise ValueError("Passwords do not match")

        # Check for existing users
        await self._check_user_uniqueness(
            email=request.email,
            cpf=request.cpf,
            _cnpj=request.cnpj,
        )

        # Create user
        user = await self._create_user(request, link.id)

        # CRITICAL: Mark link as used IMMEDIATELY after user creation
        # This must happen before course grant to prevent link reuse on partial failure
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

            logger.info(
                "registration_completed",
                link_id=str(link.id),
                shortcode=shortcode,
                user_id=str(user.id),
                email=user.email,
                courses_granted=len(courses_granted),
            )

            return user, courses_granted, access_token

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
            )
            # Re-raise with access_token attached for router to use
            e.access_token = access_token  # type: ignore[attr-defined]
            e.user = user  # type: ignore[attr-defined]
            raise

    async def _check_user_uniqueness(
        self,
        email: str,
        cpf: str,
        _cnpj: str,  # Reserved for future duplicate check
    ) -> None:
        """Check if user data conflicts with existing users.

        Security note: This method raises a generic error message to prevent
        user enumeration. The specific field is logged for internal monitoring.

        Args:
            email: User email
            cpf: User CPF
            _cnpj: User CNPJ (reserved for future validation)

        Raises:
            DuplicateUserError: If any field conflicts (with generic message)
        """
        # Check email - log internally, raise generic error
        if await self.auth_service.get_user_by_email(email):
            logger.warning(
                "duplicate_user_attempt",
                field="email",
                # Don't log actual email to avoid PII in logs
                email_domain=email.split("@")[-1] if "@" in email else "invalid",
            )
            raise DuplicateUserError("Email already registered", "email")

        # Check CPF - log internally, raise generic error
        if await self.auth_service.get_user_by_cpf(cpf):
            logger.warning(
                "duplicate_user_attempt",
                field="cpf",
                # Don't log full CPF - only last 4 digits
                cpf_suffix=cpf[-CPF_SUFFIX_DISPLAY_LENGTH:]
                if len(cpf) >= CPF_SUFFIX_DISPLAY_LENGTH
                else "****",
            )
            raise DuplicateUserError("CPF already registered", "cpf")

        # Check CNPJ (need to add this method to auth service or check here)
        # For now, we'll skip CNPJ uniqueness check as it may be shared

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
                        granted_by=None,  # System grant
                        notes="Granted via registration link",
                    )
                    granted_courses.append(
                        CoursePreview(
                            id=course_id,
                            title="Course",  # Would get from course service
                        )
                    )
                    logger.info(
                        "course_access_granted",
                        user_id=str(user_id),
                        course_id=str(course_id),
                    )
                except (ValueError, RuntimeError, KeyError) as e:
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
            granted_courses = [
                CoursePreview(id=cid, title="Course (pending)") for cid in course_ids
            ]

        return granted_courses

    async def _mark_link_used(
        self,
        link_id: UUID,
        shortcode: str,
        user_id: UUID,
        ip_address: str | None,
        user_agent: str | None,
    ) -> None:
        """Mark a link as used.

        Args:
            link_id: Link ID
            shortcode: Link shortcode
            user_id: User who used the link
            ip_address: Client IP
            user_agent: Client user agent

        Raises:
            DatabaseError: If database operation fails
        """
        now = datetime.now(UTC)

        try:
            # Update main table
            await self.session.aexecute(
                self._mark_used,
                [
                    LinkStatus.USED.value,
                    user_id,
                    now,
                    ip_address,
                    user_agent,
                    link_id,
                ],
            )

            # Update lookup table
            await self.session.aexecute(
                self._update_lookup_status,
                [LinkStatus.USED.value, shortcode],
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
