"""Pydantic schemas for student progress tracking.

Request and response models for:
- Video progress updates
- Lesson completion (manual and automatic)
- Course enrollment
- Progress queries
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .models import (
    EnrollmentStatus,
    LessonProgress,
    LessonProgressStatus,
    ModuleProgress,
)


# ==============================================================================
# Video Progress Schemas
# ==============================================================================


class UpdateVideoProgressRequest(BaseModel):
    """Request to update video progress (throttled frontend sends every 5s)."""

    lesson_id: UUID = Field(..., description="Lesson UUID")
    course_id: UUID = Field(..., description="Course UUID")
    module_id: UUID = Field(..., description="Module UUID")
    position_seconds: float = Field(
        ..., ge=0, description="Current video position in seconds"
    )
    duration_seconds: float = Field(
        ..., gt=0, description="Total video duration in seconds"
    )


class LessonProgressResponse(BaseModel):
    """Lesson progress response."""

    model_config = ConfigDict(from_attributes=True)

    lesson_id: UUID
    course_id: UUID
    module_id: UUID
    status: LessonProgressStatus
    progress_percent: Decimal = Field(description="0-100 percentage")
    last_position_seconds: int = Field(description="Resume position")
    duration_seconds: int | None = None
    duration_watched_seconds: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    last_accessed_at: datetime | None = None

    @classmethod
    def from_entity(cls, entity: LessonProgress) -> "LessonProgressResponse":
        """Create response from entity."""
        return cls(
            lesson_id=entity.lesson_id,
            course_id=entity.course_id,
            module_id=entity.module_id,
            status=LessonProgressStatus(entity.status),
            progress_percent=entity.progress_percent,
            last_position_seconds=entity.last_position_seconds,
            duration_seconds=entity.duration_seconds,
            duration_watched_seconds=entity.duration_watched_seconds,
            started_at=entity.started_at,
            completed_at=entity.completed_at,
            last_accessed_at=entity.last_accessed_at,
        )


# ==============================================================================
# Lesson Completion Schemas
# ==============================================================================


class MarkLessonCompleteRequest(BaseModel):
    """Request to manually mark a lesson as complete (non-video content)."""

    lesson_id: UUID = Field(..., description="Lesson UUID")
    course_id: UUID = Field(..., description="Course UUID")
    module_id: UUID = Field(..., description="Module UUID")


class MarkLessonIncompleteRequest(BaseModel):
    """Request to mark a lesson as incomplete (reset progress)."""

    lesson_id: UUID = Field(..., description="Lesson UUID")
    course_id: UUID = Field(..., description="Course UUID")
    module_id: UUID = Field(..., description="Module UUID")


# ==============================================================================
# Module Progress Schemas
# ==============================================================================


class ModuleProgressResponse(BaseModel):
    """Module progress response (aggregated)."""

    model_config = ConfigDict(from_attributes=True)

    module_id: UUID
    course_id: UUID
    status: LessonProgressStatus
    progress_percent: Decimal
    lessons_completed: int
    lessons_total: int
    last_accessed_at: datetime | None = None

    @classmethod
    def from_entity(cls, entity: ModuleProgress) -> "ModuleProgressResponse":
        """Create response from entity."""
        return cls(
            module_id=entity.module_id,
            course_id=entity.course_id,
            status=LessonProgressStatus(entity.status),
            progress_percent=entity.progress_percent,
            lessons_completed=entity.lessons_completed,
            lessons_total=entity.lessons_total,
            last_accessed_at=entity.last_accessed_at,
        )


# ==============================================================================
# Enrollment Schemas
# ==============================================================================


class EnrollRequest(BaseModel):
    """Request to enroll in a course."""

    course_id: UUID = Field(..., description="Course UUID to enroll in")


class EnrollmentResponse(BaseModel):
    """Enrollment response."""

    model_config = ConfigDict(from_attributes=True)

    course_id: UUID
    user_id: UUID
    status: EnrollmentStatus
    enrolled_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    progress_percent: Decimal
    lessons_completed: int
    lessons_total: int
    last_accessed_at: datetime | None = None
    last_lesson_id: UUID | None = None
    last_module_id: UUID | None = None


class EnrollmentListResponse(BaseModel):
    """List of user enrollments."""

    items: list[EnrollmentResponse]
    total: int


# ==============================================================================
# Course Progress Schemas (Complete View)
# ==============================================================================


class LessonProgressSummary(BaseModel):
    """Compact lesson progress for listing."""

    lesson_id: UUID
    status: LessonProgressStatus
    progress_percent: Decimal
    completed: bool
    last_position_seconds: int = 0


class ModuleProgressSummary(BaseModel):
    """Module progress with nested lesson progress."""

    module_id: UUID
    status: LessonProgressStatus
    progress_percent: Decimal
    lessons_completed: int
    lessons_total: int
    lessons: list[LessonProgressSummary] = []


class CourseProgressResponse(BaseModel):
    """Complete course progress with all modules and lessons."""

    course_id: UUID
    enrollment: EnrollmentResponse
    modules: list[ModuleProgressSummary] = []
    lessons: list[LessonProgressSummary] = Field(
        default_factory=list,
        description="Flat list of all lesson progress (for quick lookup)",
    )
    resume_lesson_id: UUID | None = Field(None, description="Lesson to resume from")
    resume_module_id: UUID | None = Field(
        None, description="Module containing resume lesson"
    )
    resume_position_seconds: int = Field(0, description="Video position to resume from")


# ==============================================================================
# Progress Check Schemas (Efficient Single Lesson Query)
# ==============================================================================


class LessonProgressCheckResponse(BaseModel):
    """Quick progress check for a single lesson (used on lesson load)."""

    lesson_id: UUID
    completed: bool
    progress_percent: Decimal
    resume_position_seconds: int = Field(description="Position to resume video from")
    status: LessonProgressStatus


class NextLessonResponse(BaseModel):
    """Next lesson information for autoplay."""

    lesson_id: UUID
    module_id: UUID
    title: str
    content_type: str
    position: int  # Position in module


# ==============================================================================
# Generic Response
# ==============================================================================


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str
    success: bool = True
