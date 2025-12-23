"""Student progress tracking service layer.

Business logic for:
- Video progress updates with auto-completion
- Manual lesson completion
- Course enrollment management
- Progress aggregation and calculation
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from .models import (
    Enrollment,
    EnrollmentStatus,
    LessonProgress,
    LessonProgressStatus,
    ModuleProgress,
)
from .schemas import (
    CourseProgressResponse,
    EnrollmentResponse,
    LessonProgressCheckResponse,
    LessonProgressSummary,
    ModuleProgressResponse,
    ModuleProgressSummary,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session

logger = structlog.get_logger(__name__)

# Completion threshold: 90% watched = complete
COMPLETION_THRESHOLD = Decimal(90)


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class ProgressError(Exception):
    """Base progress error."""

    def __init__(self, message: str, code: str = "progress_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class NotEnrolledError(ProgressError):
    """User not enrolled in course."""

    def __init__(self, message: str = "Usuario nao inscrito no curso"):
        super().__init__(message, "not_enrolled")


class AlreadyEnrolledError(ProgressError):
    """User already enrolled."""

    def __init__(self, message: str = "Usuario ja inscrito no curso"):
        super().__init__(message, "already_enrolled")


class LessonProgressNotFoundError(ProgressError):
    """Lesson progress not found."""

    def __init__(self, message: str = "Progresso da aula nao encontrado"):
        super().__init__(message, "progress_not_found")


# ==============================================================================
# Progress Service
# ==============================================================================


class ProgressService:
    """Service for student progress tracking."""

    def __init__(self, session: "Session", keyspace: str):
        """Initialize with Cassandra session."""
        self.session = session
        self.keyspace = keyspace
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient execution."""
        # Lesson Progress
        self._get_lesson_progress = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.lesson_progress
            WHERE user_id = ? AND course_id = ? AND module_id = ? AND lesson_id = ?
        """)

        self._get_course_lesson_progress = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.lesson_progress
            WHERE user_id = ? AND course_id = ?
        """)

        self._upsert_lesson_progress = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.lesson_progress
            (user_id, course_id, module_id, lesson_id, status, progress_percent,
             last_position_seconds, duration_seconds, duration_watched_seconds,
             started_at, completed_at, last_accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Module Progress
        self._get_module_progress = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.module_progress
            WHERE user_id = ? AND course_id = ? AND module_id = ?
        """)

        self._get_course_module_progress = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.module_progress
            WHERE user_id = ? AND course_id = ?
        """)

        self._upsert_module_progress = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.module_progress
            (user_id, course_id, module_id, status, progress_percent,
             lessons_completed, lessons_total, last_accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Enrollments
        self._get_enrollment = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.enrollments
            WHERE course_id = ? AND user_id = ?
        """)

        self._upsert_enrollment = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.enrollments
            (course_id, user_id, status, enrolled_at, started_at, completed_at,
             progress_percent, lessons_completed, lessons_total, last_accessed_at,
             last_lesson_id, last_module_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Enrollments by user (lookup)
        self._get_user_enrollments = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.enrollments_by_user
            WHERE user_id = ?
        """)

        self._upsert_enrollment_by_user = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.enrollments_by_user
            (user_id, enrolled_at, course_id, status, progress_percent,
             lessons_completed, lessons_total, last_accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """)

        self._delete_enrollment_by_user = self.session.prepare(f"""
            DELETE FROM {self.keyspace}.enrollments_by_user
            WHERE user_id = ? AND enrolled_at = ? AND course_id = ?
        """)

    # ==========================================================================
    # Enrollment Operations
    # ==========================================================================

    async def enroll_user(
        self,
        user_id: UUID,
        course_id: UUID,
        lessons_total: int = 0,
    ) -> Enrollment:
        """Enroll user in a course.

        Args:
            user_id: User UUID
            course_id: Course UUID
            lessons_total: Total lessons in course (for progress calculation)

        Returns:
            Enrollment entity

        Raises:
            AlreadyEnrolledError: If user already enrolled
        """
        # Check existing enrollment
        existing = await self.get_enrollment(user_id, course_id)
        if existing:
            raise AlreadyEnrolledError

        now = datetime.now(UTC)
        enrollment = Enrollment(
            course_id=course_id,
            user_id=user_id,
            status=EnrollmentStatus.ENROLLED.value,
            enrolled_at=now,
            lessons_total=lessons_total,
        )

        # Dual write: main table + lookup table
        await self.session.aexecute(
            self._upsert_enrollment,
            [
                enrollment.course_id,
                enrollment.user_id,
                enrollment.status,
                enrollment.enrolled_at,
                enrollment.started_at,
                enrollment.completed_at,
                enrollment.progress_percent,
                enrollment.lessons_completed,
                enrollment.lessons_total,
                enrollment.last_accessed_at,
                enrollment.last_lesson_id,
                enrollment.last_module_id,
            ],
        )

        await self.session.aexecute(
            self._upsert_enrollment_by_user,
            [
                enrollment.user_id,
                enrollment.enrolled_at,
                enrollment.course_id,
                enrollment.status,
                enrollment.progress_percent,
                enrollment.lessons_completed,
                enrollment.lessons_total,
                enrollment.last_accessed_at,
            ],
        )

        logger.info(
            "user_enrolled",
            user_id=str(user_id),
            course_id=str(course_id),
        )

        return enrollment

    async def get_enrollment(self, user_id: UUID, course_id: UUID) -> Enrollment | None:
        """Get enrollment by user and course."""
        result = await self.session.aexecute(self._get_enrollment, [course_id, user_id])
        row = result.one()
        return Enrollment.from_row(row) if row else None

    async def get_user_enrollments(self, user_id: UUID) -> list[Enrollment]:
        """Get all enrollments for a user."""
        rows = await self.session.aexecute(self._get_user_enrollments, [user_id])
        # Build from lookup table (has same essential fields)
        return [
            Enrollment(
                course_id=row.course_id,
                user_id=row.user_id,
                status=row.status,
                enrolled_at=row.enrolled_at,
                progress_percent=row.progress_percent or Decimal(0),
                lessons_completed=row.lessons_completed or 0,
                lessons_total=row.lessons_total or 0,
                last_accessed_at=row.last_accessed_at,
            )
            for row in rows
        ]

    async def _update_enrollment(self, enrollment: Enrollment) -> None:
        """Update enrollment in both tables (dual-write)."""
        await self.session.aexecute(
            self._upsert_enrollment,
            [
                enrollment.course_id,
                enrollment.user_id,
                enrollment.status,
                enrollment.enrolled_at,
                enrollment.started_at,
                enrollment.completed_at,
                enrollment.progress_percent,
                enrollment.lessons_completed,
                enrollment.lessons_total,
                enrollment.last_accessed_at,
                enrollment.last_lesson_id,
                enrollment.last_module_id,
            ],
        )

        await self.session.aexecute(
            self._upsert_enrollment_by_user,
            [
                enrollment.user_id,
                enrollment.enrolled_at,
                enrollment.course_id,
                enrollment.status,
                enrollment.progress_percent,
                enrollment.lessons_completed,
                enrollment.lessons_total,
                enrollment.last_accessed_at,
            ],
        )

    # ==========================================================================
    # Video Progress Operations
    # ==========================================================================

    async def update_video_progress(
        self,
        user_id: UUID,
        lesson_id: UUID,
        course_id: UUID,
        module_id: UUID,
        position_seconds: float,
        duration_seconds: float,
    ) -> LessonProgress:
        """Update video progress (called every 5s from frontend).

        Calculates progress percentage and auto-completes at 90%.
        Propagates changes to module and enrollment.

        Args:
            user_id: User UUID
            lesson_id: Lesson UUID
            course_id: Course UUID
            module_id: Module UUID
            position_seconds: Current video position
            duration_seconds: Total video duration

        Returns:
            Updated LessonProgress entity
        """
        now = datetime.now(UTC)

        # Convert float to int for Cassandra storage (INT columns)
        position_seconds = int(position_seconds)
        duration_seconds = int(duration_seconds)

        # Get existing progress or create new
        existing = await self.get_lesson_progress(
            user_id, course_id, module_id, lesson_id
        )

        if existing:
            # Update only if position advanced (prevent backward updates)
            max_position = max(existing.last_position_seconds, position_seconds)
            watched = existing.duration_watched_seconds + abs(
                position_seconds - existing.last_position_seconds
            )

            # Calculate progress based on max position reached
            progress_percent = Decimal(
                str(min(100, (max_position / duration_seconds) * 100))
            )

            # Auto-complete at 90%
            status = existing.status
            completed_at = existing.completed_at
            if progress_percent >= COMPLETION_THRESHOLD and not existing.is_completed:
                status = LessonProgressStatus.COMPLETED.value
                completed_at = now
                logger.info(
                    "lesson_auto_completed",
                    user_id=str(user_id),
                    lesson_id=str(lesson_id),
                    progress=str(progress_percent),
                )
            elif existing.status == LessonProgressStatus.NOT_STARTED.value:
                status = LessonProgressStatus.IN_PROGRESS.value

            progress = LessonProgress(
                user_id=user_id,
                course_id=course_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=status,
                progress_percent=progress_percent,
                last_position_seconds=position_seconds,
                duration_seconds=duration_seconds,
                duration_watched_seconds=watched,
                started_at=existing.started_at,
                completed_at=completed_at,
                last_accessed_at=now,
            )
        else:
            # First access
            progress_percent = Decimal(
                str(min(100, (position_seconds / duration_seconds) * 100))
            )

            # Auto-complete if started past 90%
            status = LessonProgressStatus.IN_PROGRESS.value
            completed_at = None
            if progress_percent >= COMPLETION_THRESHOLD:
                status = LessonProgressStatus.COMPLETED.value
                completed_at = now

            progress = LessonProgress(
                user_id=user_id,
                course_id=course_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=status,
                progress_percent=progress_percent,
                last_position_seconds=position_seconds,
                duration_seconds=duration_seconds,
                duration_watched_seconds=position_seconds,
                started_at=now,
                completed_at=completed_at,
                last_accessed_at=now,
            )

            # Ensure user is enrolled (auto-enroll on first progress)
            enrollment = await self.get_enrollment(user_id, course_id)
            if not enrollment:
                await self.enroll_user(user_id, course_id)

        # Save lesson progress
        await self._save_lesson_progress(progress)

        # Propagate to module and enrollment
        await self._propagate_progress(user_id, course_id, module_id, lesson_id)

        return progress

    async def get_lesson_progress(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress | None:
        """Get progress for a specific lesson."""
        result = await self.session.aexecute(
            self._get_lesson_progress,
            [user_id, course_id, module_id, lesson_id],
        )
        row = result.one()
        return LessonProgress.from_row(row) if row else None

    async def get_lesson_progress_check(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgressCheckResponse:
        """Quick progress check for lesson load (UI resume feature)."""
        progress = await self.get_lesson_progress(
            user_id, course_id, module_id, lesson_id
        )

        if progress:
            return LessonProgressCheckResponse(
                lesson_id=lesson_id,
                completed=progress.is_completed,
                progress_percent=progress.progress_percent,
                resume_position_seconds=progress.last_position_seconds,
                status=LessonProgressStatus(progress.status),
            )

        return LessonProgressCheckResponse(
            lesson_id=lesson_id,
            completed=False,
            progress_percent=Decimal(0),
            resume_position_seconds=0,
            status=LessonProgressStatus.NOT_STARTED,
        )

    async def _save_lesson_progress(self, progress: LessonProgress) -> None:
        """Save lesson progress to database."""
        await self.session.aexecute(
            self._upsert_lesson_progress,
            [
                progress.user_id,
                progress.course_id,
                progress.module_id,
                progress.lesson_id,
                progress.status,
                progress.progress_percent,
                progress.last_position_seconds,
                progress.duration_seconds,
                progress.duration_watched_seconds,
                progress.started_at,
                progress.completed_at,
                progress.last_accessed_at,
            ],
        )

    # ==========================================================================
    # Manual Completion Operations
    # ==========================================================================

    async def mark_lesson_complete(
        self,
        user_id: UUID,
        lesson_id: UUID,
        course_id: UUID,
        module_id: UUID,
    ) -> LessonProgress:
        """Manually mark a lesson as complete (for non-video content)."""
        now = datetime.now(UTC)

        existing = await self.get_lesson_progress(
            user_id, course_id, module_id, lesson_id
        )

        if existing:
            progress = LessonProgress(
                user_id=user_id,
                course_id=course_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=LessonProgressStatus.COMPLETED.value,
                progress_percent=Decimal(100),
                last_position_seconds=existing.last_position_seconds,
                duration_seconds=existing.duration_seconds,
                duration_watched_seconds=existing.duration_watched_seconds,
                started_at=existing.started_at,
                completed_at=now,
                last_accessed_at=now,
            )
        else:
            # Ensure enrolled
            enrollment = await self.get_enrollment(user_id, course_id)
            if not enrollment:
                await self.enroll_user(user_id, course_id)

            progress = LessonProgress(
                user_id=user_id,
                course_id=course_id,
                module_id=module_id,
                lesson_id=lesson_id,
                status=LessonProgressStatus.COMPLETED.value,
                progress_percent=Decimal(100),
                last_position_seconds=0,
                duration_seconds=None,
                duration_watched_seconds=0,
                started_at=now,
                completed_at=now,
                last_accessed_at=now,
            )

        await self._save_lesson_progress(progress)
        await self._propagate_progress(user_id, course_id, module_id, lesson_id)

        logger.info(
            "lesson_marked_complete",
            user_id=str(user_id),
            lesson_id=str(lesson_id),
        )

        return progress

    async def mark_lesson_incomplete(
        self,
        user_id: UUID,
        lesson_id: UUID,
        course_id: UUID,
        module_id: UUID,
    ) -> LessonProgress:
        """Reset lesson progress (for rewatching)."""
        now = datetime.now(UTC)

        progress = LessonProgress(
            user_id=user_id,
            course_id=course_id,
            module_id=module_id,
            lesson_id=lesson_id,
            status=LessonProgressStatus.NOT_STARTED.value,
            progress_percent=Decimal(0),
            last_position_seconds=0,
            duration_seconds=None,
            duration_watched_seconds=0,
            started_at=None,
            completed_at=None,
            last_accessed_at=now,
        )

        await self._save_lesson_progress(progress)
        await self._propagate_progress(user_id, course_id, module_id, lesson_id)

        logger.info(
            "lesson_marked_incomplete",
            user_id=str(user_id),
            lesson_id=str(lesson_id),
        )

        return progress

    # ==========================================================================
    # Progress Aggregation
    # ==========================================================================

    async def _propagate_progress(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> None:
        """Propagate lesson progress changes to module and enrollment.

        Recalculates module completion and overall course progress.
        """
        # Get all lesson progress for the course
        all_progress = await self._get_all_lesson_progress(user_id, course_id)

        # Group by module
        module_lessons: dict[UUID, list[LessonProgress]] = {}
        for lp in all_progress:
            mid = lp.module_id
            if mid not in module_lessons:
                module_lessons[mid] = []
            module_lessons[mid].append(lp)

        # Update module progress
        total_completed = 0
        total_lessons = 0
        now = datetime.now(UTC)

        for mid, lessons in module_lessons.items():
            completed = sum(1 for lp in lessons if lp.is_completed)
            total = len(lessons)
            total_completed += completed
            total_lessons += total

            # Calculate module progress
            mod_progress_percent = (
                Decimal(str((completed / total) * 100)) if total > 0 else Decimal(0)
            )

            if completed == total and total > 0:
                mod_status = LessonProgressStatus.COMPLETED.value
            elif completed > 0:
                mod_status = LessonProgressStatus.IN_PROGRESS.value
            else:
                mod_status = LessonProgressStatus.NOT_STARTED.value

            await self.session.aexecute(
                self._upsert_module_progress,
                [
                    user_id,
                    course_id,
                    mid,
                    mod_status,
                    mod_progress_percent,
                    completed,
                    total,
                    now,
                ],
            )

        # Update enrollment
        enrollment = await self.get_enrollment(user_id, course_id)
        if enrollment:
            course_progress = (
                Decimal(str((total_completed / total_lessons) * 100))
                if total_lessons > 0
                else Decimal(0)
            )

            if total_completed == total_lessons and total_lessons > 0:
                enroll_status = EnrollmentStatus.COMPLETED.value
                completed_at = now
            elif total_completed > 0:
                enroll_status = EnrollmentStatus.IN_PROGRESS.value
                completed_at = enrollment.completed_at
            else:
                enroll_status = enrollment.status
                completed_at = enrollment.completed_at

            enrollment.status = enroll_status
            enrollment.progress_percent = course_progress
            enrollment.lessons_completed = total_completed
            enrollment.lessons_total = total_lessons
            enrollment.last_accessed_at = now
            enrollment.last_lesson_id = lesson_id
            enrollment.last_module_id = module_id
            enrollment.completed_at = completed_at

            if enrollment.started_at is None:
                enrollment.started_at = now

            await self._update_enrollment(enrollment)

    async def _get_all_lesson_progress(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> list[LessonProgress]:
        """Get all lesson progress for a course."""
        rows = await self.session.aexecute(
            self._get_course_lesson_progress,
            [user_id, course_id],
        )
        return [LessonProgress.from_row(row) for row in rows]

    # ==========================================================================
    # Course Progress Queries
    # ==========================================================================

    async def get_course_progress(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> CourseProgressResponse | None:
        """Get complete course progress with modules and lessons.

        Returns None if user is not enrolled.
        """
        enrollment = await self.get_enrollment(user_id, course_id)
        if not enrollment:
            return None

        # Get all lesson progress
        lesson_progress = await self._get_all_lesson_progress(user_id, course_id)

        # Get module progress
        module_progress = await self._get_all_module_progress(user_id, course_id)

        # Build response
        modules_map: dict[UUID, ModuleProgressSummary] = {}

        # Initialize modules from module_progress
        for mp in module_progress:
            modules_map[mp.module_id] = ModuleProgressSummary(
                module_id=mp.module_id,
                status=LessonProgressStatus(mp.status),
                progress_percent=mp.progress_percent,
                lessons_completed=mp.lessons_completed,
                lessons_total=mp.lessons_total,
                lessons=[],
            )

        # Add lessons to modules
        for lp in lesson_progress:
            if lp.module_id not in modules_map:
                modules_map[lp.module_id] = ModuleProgressSummary(
                    module_id=lp.module_id,
                    status=LessonProgressStatus.NOT_STARTED,
                    progress_percent=Decimal(0),
                    lessons_completed=0,
                    lessons_total=0,
                    lessons=[],
                )

            modules_map[lp.module_id].lessons.append(
                LessonProgressSummary(
                    lesson_id=lp.lesson_id,
                    status=LessonProgressStatus(lp.status),
                    progress_percent=lp.progress_percent,
                    completed=lp.is_completed,
                    last_position_seconds=lp.last_position_seconds,
                )
            )

        # Find resume position
        resume_lesson_id = enrollment.last_lesson_id
        resume_module_id = enrollment.last_module_id
        resume_position = 0

        if resume_lesson_id:
            for lp in lesson_progress:
                if lp.lesson_id == resume_lesson_id:
                    resume_position = lp.last_position_seconds
                    break

        # Build flat lessons list for quick lookup
        all_lessons = [
            LessonProgressSummary(
                lesson_id=lp.lesson_id,
                status=LessonProgressStatus(lp.status),
                progress_percent=lp.progress_percent,
                completed=lp.is_completed,
                last_position_seconds=lp.last_position_seconds,
            )
            for lp in lesson_progress
        ]

        return CourseProgressResponse(
            course_id=course_id,
            enrollment=EnrollmentResponse(
                course_id=enrollment.course_id,
                user_id=enrollment.user_id,
                status=EnrollmentStatus(enrollment.status),
                enrolled_at=enrollment.enrolled_at,
                started_at=enrollment.started_at,
                completed_at=enrollment.completed_at,
                progress_percent=enrollment.progress_percent,
                lessons_completed=enrollment.lessons_completed,
                lessons_total=enrollment.lessons_total,
                last_accessed_at=enrollment.last_accessed_at,
                last_lesson_id=enrollment.last_lesson_id,
                last_module_id=enrollment.last_module_id,
            ),
            modules=list(modules_map.values()),
            lessons=all_lessons,
            resume_lesson_id=resume_lesson_id,
            resume_module_id=resume_module_id,
            resume_position_seconds=resume_position,
        )

    async def _get_all_module_progress(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> list[ModuleProgress]:
        """Get all module progress for a course."""
        rows = await self.session.aexecute(
            self._get_course_module_progress,
            [user_id, course_id],
        )
        return [ModuleProgress.from_row(row) for row in rows]

    async def get_module_progress(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
    ) -> ModuleProgressResponse | None:
        """Get progress for a specific module."""
        result = await self.session.aexecute(
            self._get_module_progress,
            [user_id, course_id, module_id],
        )
        row = result.one()
        return (
            ModuleProgressResponse.from_entity(ModuleProgress.from_row(row))
            if row
            else None
        )

    async def get_user_progress_summary(
        self,
        user_id: UUID,
    ) -> dict:
        """Get aggregated progress summary for a user across all courses.

        Returns:
            Dictionary with:
            - total_courses_enrolled: Number of courses enrolled
            - total_lessons_completed: Sum of completed lessons
            - total_lessons_total: Sum of total lessons
            - total_watch_time_seconds: Sum of watch time
            - last_lesson: Info about last accessed lesson
        """
        # Get all enrollments
        enrollments = await self.get_user_enrollments(user_id)

        total_courses = len(enrollments)
        total_completed = 0
        total_lessons = 0
        total_watch_time = 0
        last_lesson_info = None
        last_accessed_at = None

        for enrollment in enrollments:
            total_completed += enrollment.lessons_completed
            total_lessons += enrollment.lessons_total

            # Track last accessed lesson
            if enrollment.last_accessed_at and (
                last_accessed_at is None
                or enrollment.last_accessed_at > last_accessed_at
            ):
                last_accessed_at = enrollment.last_accessed_at
                # Get full enrollment to get last_lesson_id and last_module_id
                full_enrollment = await self.get_enrollment(
                    user_id, enrollment.course_id
                )
                if full_enrollment:
                    last_lesson_info = {
                        "course_id": enrollment.course_id,
                        "module_id": full_enrollment.last_module_id,
                        "lesson_id": full_enrollment.last_lesson_id,
                        "last_accessed_at": enrollment.last_accessed_at,
                    }

            # Sum watch time from lesson progress
            all_lessons = await self._get_all_lesson_progress(
                user_id, enrollment.course_id
            )
            for lesson in all_lessons:
                total_watch_time += lesson.duration_watched_seconds or 0

        return {
            "total_courses_enrolled": total_courses,
            "total_lessons_completed": total_completed,
            "total_lessons_total": total_lessons,
            "total_watch_time_seconds": total_watch_time,
            "last_lesson": last_lesson_info,
        }
