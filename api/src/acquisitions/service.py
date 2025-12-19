# ruff: noqa: S608 - All CQL queries use keyspace from config, not user input
"""Course acquisition service layer.

Business logic for:
- Granting/revoking course access
- Checking access permissions
- Listing acquisitions (user and admin views)
- Auto-enrollment for free courses
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from src.core.logging import get_logger

from .models import (
    AcquisitionStatus,
    CourseAcquisition,
    create_admin_grant,
    create_free_acquisition,
)
from .schemas import (
    AccessReason,
    AcquisitionListResponse,
    AcquisitionResponse,
    CheckAccessResponse,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session
    from redis.asyncio import Redis


logger = get_logger(__name__)


class AcquisitionService:
    """Service for course acquisition management."""

    def __init__(self, session: "Session", keyspace: str, redis: "Redis | None" = None):
        """Initialize with Cassandra session and optional Redis."""
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        # Insert acquisition
        self._insert_acquisition = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.course_acquisitions
            (user_id, course_id, acquisition_id, acquisition_type, status,
             granted_by, granted_at, expires_at, payment_id, payment_amount,
             payment_method, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Insert into by_course table
        self._insert_acquisition_by_course = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.acquisitions_by_course
            (course_id, user_id, acquisition_id, acquisition_type, status,
             granted_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """)

        # Get user's acquisition for a course
        self._get_user_course_acquisition = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.course_acquisitions
            WHERE user_id = ? AND course_id = ?
            LIMIT 1
        """)

        # Get all user's acquisitions
        self._get_user_acquisitions = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.course_acquisitions
            WHERE user_id = ?
        """)

        # Get all acquisitions for a course
        self._get_course_acquisitions = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.acquisitions_by_course
            WHERE course_id = ?
            LIMIT ?
        """)

        # Update acquisition status
        self._update_status = self.session.prepare(f"""
            UPDATE {self.keyspace}.course_acquisitions
            SET status = ?, updated_at = ?
            WHERE user_id = ? AND course_id = ? AND acquisition_id = ?
        """)

        # Update status in by_course table
        self._update_status_by_course = self.session.prepare(f"""
            UPDATE {self.keyspace}.acquisitions_by_course
            SET status = ?
            WHERE course_id = ? AND granted_at = ? AND user_id = ?
        """)

        # Delete acquisition
        self._delete_acquisition = self.session.prepare(f"""
            DELETE FROM {self.keyspace}.course_acquisitions
            WHERE user_id = ? AND course_id = ? AND acquisition_id = ?
        """)

        # Count active acquisitions for course
        self._count_course_acquisitions = self.session.prepare(f"""
            SELECT COUNT(*) FROM {self.keyspace}.acquisitions_by_course
            WHERE course_id = ?
        """)

    # ==========================================================================
    # Access Control
    # ==========================================================================

    async def has_active_access(
        self,
        user_id: UUID,
        course_id: UUID,
        user_role: str | None = None,
        course_creator_id: UUID | None = None,
    ) -> bool:
        """Check if user has active access to a course.

        Access hierarchy:
        1. ADMIN role: Always has access
        2. TEACHER role + course owner: Has access
        3. Active acquisition: Has access

        Args:
            user_id: User to check
            course_id: Course to check access for
            user_role: User's role (admin, teacher, student, user)
            course_creator_id: Course creator's user ID

        Returns:
            True if user has active access
        """
        # Admin always has access (bypass)
        if user_role == "admin":
            return True

        # Teacher has access to their own courses (bypass)
        if (
            user_role == "teacher"
            and course_creator_id
            and user_id == course_creator_id
        ):
            return True

        # Check Redis cache first (only for acquisition-based access)
        if self.redis:
            cache_key = f"access:{user_id}:{course_id}"
            cached = await self.redis.get(cache_key)
            if cached is not None:
                return cached == b"1"

        # Query database
        row = self.session.execute(
            self._get_user_course_acquisition,
            [user_id, course_id],
        ).one()

        has_access = False
        if row:
            acquisition = CourseAcquisition.from_row(row)
            has_access = acquisition.is_active()

        # Cache result (5 minutes)
        if self.redis:
            await self.redis.setex(cache_key, 300, "1" if has_access else "0")

        return has_access

    async def check_access(
        self,
        user_id: UUID,
        course_id: UUID,
        user_role: str | None = None,
        course_creator_id: UUID | None = None,
    ) -> CheckAccessResponse:
        """Check user's access to a course with details.

        Access hierarchy:
        1. ADMIN role: Always has access (preview mode)
        2. TEACHER role + course owner: Has access (preview mode)
        3. Active acquisition: Has access (normal mode)

        Args:
            user_id: User to check
            course_id: Course to check access for
            user_role: User's role (admin, teacher, student, user)
            course_creator_id: Course creator's user ID

        Returns:
            CheckAccessResponse with access details
        """
        # 1. Admin bypass - unlimited access (progress is saved normally)
        if user_role == "admin":
            return CheckAccessResponse(
                has_access=True,
                access_reason=AccessReason.ADMIN_ROLE,
                is_preview_mode=False,
                can_enroll=False,
            )

        # 2. Teacher bypass - only for their own courses (progress is saved normally)
        if (
            user_role == "teacher"
            and course_creator_id
            and user_id == course_creator_id
        ):
            return CheckAccessResponse(
                has_access=True,
                access_reason=AccessReason.COURSE_OWNER,
                is_preview_mode=False,
                can_enroll=False,
            )

        # 3. Check actual acquisition (students)
        row = self.session.execute(
            self._get_user_course_acquisition,
            [user_id, course_id],
        ).one()

        if not row:
            return CheckAccessResponse(has_access=False, can_enroll=True)

        acquisition = CourseAcquisition.from_row(row)
        is_active = acquisition.is_active()

        return CheckAccessResponse(
            has_access=is_active,
            access_reason=AccessReason.ACQUISITION if is_active else None,
            acquisition_type=acquisition.acquisition_type if is_active else None,
            expires_at=acquisition.expires_at if is_active else None,
            acquisition_id=acquisition.acquisition_id if is_active else None,
            can_enroll=not is_active,
            is_preview_mode=False,
        )

    # ==========================================================================
    # Enrollment / Access Grant
    # ==========================================================================

    async def enroll_free(self, user_id: UUID, course_id: UUID) -> CourseAcquisition:
        """Enroll user in a free course.

        Creates a FREE acquisition for self-enrollment.

        Args:
            user_id: User enrolling
            course_id: Course to enroll in

        Returns:
            Created acquisition

        Raises:
            ValueError: If user already has access
        """
        # Check if already has access
        existing = await self.check_access(user_id, course_id)
        if existing.has_access:
            raise ValueError("User already has access to this course")

        acquisition = create_free_acquisition(user_id=user_id, course_id=course_id)
        await self._save_acquisition(acquisition)

        logger.info(
            "free_enrollment_created",
            user_id=str(user_id),
            course_id=str(course_id),
        )

        return acquisition

    async def grant_access(
        self,
        user_id: UUID,
        course_id: UUID,
        granted_by: UUID,
        expires_in_days: int | None = None,
        notes: str | None = None,
    ) -> CourseAcquisition:
        """Grant access to a course (admin action).

        Args:
            user_id: User to grant access to
            course_id: Course to grant access to
            granted_by: Admin user ID
            expires_in_days: Days until access expires (None = permanent)
            notes: Optional admin notes

        Returns:
            Created acquisition

        Raises:
            ValueError: If user already has active access
        """
        # Check if already has active access by querying ALL acquisitions
        # and checking if ANY is active (prevents race conditions)
        rows = self.session.execute(
            self._get_user_acquisitions,
            [user_id],
        )

        for row in rows:
            acquisition = CourseAcquisition.from_row(row)
            if acquisition.course_id == course_id and acquisition.is_active():
                raise ValueError("User already has active access to this course")

        # Calculate expiration
        expires_at = None
        if expires_in_days is not None and expires_in_days > 0:
            expires_at = datetime.now(UTC) + timedelta(days=expires_in_days)

        acquisition = create_admin_grant(
            user_id=user_id,
            course_id=course_id,
            granted_by=granted_by,
            expires_at=expires_at,
            notes=notes,
        )

        await self._save_acquisition(acquisition)

        logger.info(
            "access_granted",
            user_id=str(user_id),
            course_id=str(course_id),
            granted_by=str(granted_by),
            expires_in_days=expires_in_days,
        )

        return acquisition

    async def batch_grant_access(
        self,
        user_ids: list[UUID],
        course_id: UUID,
        granted_by: UUID,
        expires_in_days: int | None = None,
        notes: str | None = None,
    ) -> tuple[int, int, list[str]]:
        """Grant access to multiple users.

        Args:
            user_ids: Users to grant access to
            course_id: Course to grant access to
            granted_by: Admin user ID
            expires_in_days: Days until access expires
            notes: Optional admin notes

        Returns:
            Tuple of (granted_count, skipped_count, errors)
        """
        granted = 0
        skipped = 0
        errors: list[str] = []

        for user_id in user_ids:
            try:
                existing = await self.check_access(user_id, course_id)
                if existing.has_access:
                    skipped += 1
                    continue

                await self.grant_access(
                    user_id=user_id,
                    course_id=course_id,
                    granted_by=granted_by,
                    expires_in_days=expires_in_days,
                    notes=notes,
                )
                granted += 1

            except Exception as e:
                errors.append(f"User {user_id}: {e!s}")

        logger.info(
            "batch_access_granted",
            course_id=str(course_id),
            granted=granted,
            skipped=skipped,
            errors_count=len(errors),
        )

        return granted, skipped, errors

    # ==========================================================================
    # Revocation
    # ==========================================================================

    async def revoke_access(
        self,
        user_id: UUID,
        course_id: UUID,
        reason: str | None = None,
    ) -> bool:
        """Revoke user's access to a course.

        Args:
            user_id: User whose access to revoke
            course_id: Course to revoke access from
            reason: Optional reason for revocation

        Returns:
            True if access was revoked, False if no active access found
        """
        # Query ALL acquisitions to avoid non-deterministic LIMIT 1
        rows = self.session.execute(
            self._get_user_acquisitions,
            [user_id],
        )

        # Find the active acquisition for this specific course
        acquisition = None
        for row in rows:
            acq = CourseAcquisition.from_row(row)
            if acq.course_id == course_id and acq.is_active():
                acquisition = acq
                break

        if not acquisition:
            return False

        # Update status to revoked
        now = datetime.now(UTC)
        self.session.execute(
            self._update_status,
            [
                AcquisitionStatus.REVOKED.value,
                now,
                user_id,
                course_id,
                acquisition.acquisition_id,
            ],
        )

        # Update by_course table
        self.session.execute(
            self._update_status_by_course,
            [
                AcquisitionStatus.REVOKED.value,
                course_id,
                acquisition.granted_at,
                user_id,
            ],
        )

        # Invalidate cache
        await self._invalidate_cache(user_id, course_id)

        logger.info(
            "access_revoked",
            user_id=str(user_id),
            course_id=str(course_id),
            reason=reason,
        )

        return True

    # ==========================================================================
    # Listing
    # ==========================================================================

    async def get_user_acquisitions(
        self,
        user_id: UUID,
        active_only: bool = False,
    ) -> AcquisitionListResponse:
        """Get all acquisitions for a user.

        Args:
            user_id: User to get acquisitions for
            active_only: If True, only return active acquisitions

        Returns:
            List of acquisitions
        """
        rows = self.session.execute(
            self._get_user_acquisitions,
            [user_id],
        )

        acquisitions = []
        for row in rows:
            acquisition = CourseAcquisition.from_row(row)
            if active_only and not acquisition.is_active():
                continue
            acquisitions.append(acquisition)

        items = [AcquisitionResponse.from_acquisition(a) for a in acquisitions]

        return AcquisitionListResponse(
            items=items,
            total=len(items),
            has_more=False,
        )

    async def get_course_students(
        self,
        course_id: UUID,
        limit: int = 100,
    ) -> list[CourseAcquisition]:
        """Get all students with access to a course (admin).

        Args:
            course_id: Course to get students for
            limit: Maximum number of results

        Returns:
            List of acquisitions (deduplicated, most recent per user)
        """
        rows = self.session.execute(
            self._get_course_acquisitions,
            [course_id, limit],
        )

        # Deduplicate by user_id - keep most recent acquisition per user
        # acquisitions_by_course is ordered by (granted_at DESC, user_id ASC)
        # so first occurrence is the most recent
        seen_users: set[UUID] = set()
        acquisitions = []

        for row in rows:
            # Skip if we already processed this user
            if row.user_id in seen_users:
                continue

            # Fetch ALL acquisitions for this user to avoid non-deterministic LIMIT 1
            user_rows = self.session.execute(
                self._get_user_acquisitions,
                [row.user_id],
            )

            # Find the most recent active acquisition for this course
            active_acquisition = None
            for user_row in user_rows:
                acq = CourseAcquisition.from_row(user_row)
                # Keep the most recent active acquisition
                if (
                    acq.course_id == course_id
                    and acq.is_active()
                    and (
                        active_acquisition is None
                        or acq.granted_at > active_acquisition.granted_at
                    )
                ):
                    active_acquisition = acq

            if active_acquisition:
                acquisitions.append(active_acquisition)
                seen_users.add(row.user_id)

        return acquisitions

    async def count_course_students(self, course_id: UUID) -> int:
        """Count students with access to a course.

        Args:
            course_id: Course to count students for

        Returns:
            Number of students with access
        """
        row = self.session.execute(
            self._count_course_acquisitions,
            [course_id],
        ).one()

        return row.count if row else 0

    # ==========================================================================
    # Private Helpers
    # ==========================================================================

    async def _save_acquisition(self, acquisition: CourseAcquisition) -> None:
        """Save acquisition to both tables (dual-write pattern)."""
        # Main table
        self.session.execute(
            self._insert_acquisition,
            [
                acquisition.user_id,
                acquisition.course_id,
                acquisition.acquisition_id,
                acquisition.acquisition_type.value,
                acquisition.status.value,
                acquisition.granted_by,
                acquisition.granted_at,
                acquisition.expires_at,
                acquisition.payment_id,
                acquisition.payment_amount,
                acquisition.payment_method,
                acquisition.notes,
                acquisition.created_at,
                acquisition.updated_at,
            ],
        )

        # By-course lookup table
        self.session.execute(
            self._insert_acquisition_by_course,
            [
                acquisition.course_id,
                acquisition.user_id,
                acquisition.acquisition_id,
                acquisition.acquisition_type.value,
                acquisition.status.value,
                acquisition.granted_at,
                acquisition.expires_at,
            ],
        )

        # Invalidate cache
        await self._invalidate_cache(acquisition.user_id, acquisition.course_id)

    async def _invalidate_cache(self, user_id: UUID, course_id: UUID) -> None:
        """Invalidate access cache for user/course pair."""
        if self.redis:
            cache_key = f"access:{user_id}:{course_id}"
            await self.redis.delete(cache_key)
