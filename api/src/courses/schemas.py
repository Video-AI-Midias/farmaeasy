"""Pydantic schemas for course management.

Request and response models for:
- Courses: CRUD operations
- Modules: CRUD and linking operations
- Lessons: CRUD and linking operations
- Reordering and linking operations
"""

from datetime import datetime
from decimal import Decimal
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.courses.models import ContentStatus, ContentType


# ==============================================================================
# Course Schemas
# ==============================================================================


class CreateCourseRequest(BaseModel):
    """Course creation request."""

    title: str = Field(..., min_length=3, max_length=200, description="Course title")
    description: str | None = Field(
        None, max_length=5000, description="Course description"
    )
    thumbnail_url: str | None = Field(
        None, max_length=500, description="Thumbnail image URL"
    )
    price: Decimal | None = Field(
        None, ge=0, description="Course price in BRL (None = free)"
    )
    is_free: bool = Field(True, description="Whether course is free")


class UpdateCourseRequest(BaseModel):
    """Course update request."""

    title: str | None = Field(
        None, min_length=3, max_length=200, description="Course title"
    )
    description: str | None = Field(
        None, max_length=5000, description="Course description"
    )
    thumbnail_url: str | None = Field(
        None, max_length=500, description="Thumbnail image URL"
    )
    status: ContentStatus | None = Field(None, description="Publication status")
    price: Decimal | None = Field(None, ge=0, description="Course price in BRL")
    is_free: bool | None = Field(None, description="Whether course is free")


class CourseResponse(BaseModel):
    """Course response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None = None
    thumbnail_url: str | None = None
    status: ContentStatus
    creator_id: UUID
    price: Decimal | None = None
    is_free: bool = True
    requires_enrollment: bool = True
    created_at: datetime
    updated_at: datetime | None = None
    module_count: int = 0


class CourseListResponse(BaseModel):
    """Paginated course list response."""

    items: list[CourseResponse]
    total: int
    has_more: bool


# ==============================================================================
# Module Schemas
# ==============================================================================


class CreateModuleRequest(BaseModel):
    """Module creation request."""

    title: str = Field(..., min_length=3, max_length=200, description="Module title")
    description: str | None = Field(
        None, max_length=5000, description="Module description"
    )
    thumbnail_url: str | None = Field(
        None, max_length=500, description="Thumbnail image URL"
    )


class UpdateModuleRequest(BaseModel):
    """Module update request."""

    title: str | None = Field(
        None, min_length=3, max_length=200, description="Module title"
    )
    description: str | None = Field(
        None, max_length=5000, description="Module description"
    )
    thumbnail_url: str | None = Field(
        None, max_length=500, description="Thumbnail image URL"
    )
    status: ContentStatus | None = Field(None, description="Publication status")


class ModuleResponse(BaseModel):
    """Module response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None = None
    thumbnail_url: str | None = None
    status: ContentStatus
    creator_id: UUID
    created_at: datetime
    updated_at: datetime | None = None
    lesson_count: int = 0


class ModuleInCourseResponse(ModuleResponse):
    """Module response within a course (includes position)."""

    position: int
    lessons: list["LessonInModuleResponse"] = []


class ModuleListResponse(BaseModel):
    """Paginated module list response."""

    items: list[ModuleResponse]
    total: int
    has_more: bool


# ==============================================================================
# Lesson Schemas
# ==============================================================================


class CreateLessonRequest(BaseModel):
    """Lesson creation request.

    Validation rules by content_type:
    - VIDEO: content_url is required
    - PDF: content_url is required
    - TEXT: description is required (content_url optional)
    - QUIZ: no additional requirements (future implementation)
    """

    title: str = Field(..., min_length=3, max_length=200, description="Lesson title")
    description: str | None = Field(
        None, max_length=5000, description="Lesson description"
    )
    content_type: ContentType = Field(..., description="Type of content")
    content_url: str | None = Field(None, max_length=1000, description="Content URL")
    duration_seconds: int | None = Field(None, ge=0, description="Duration in seconds")

    @model_validator(mode="after")
    def validate_content_by_type(self) -> Self:
        """Validate that required content is present based on content_type."""
        if self.content_type == ContentType.VIDEO and not self.content_url:
            raise ValueError("URL do vídeo é obrigatória para aulas do tipo VIDEO")
        if self.content_type == ContentType.PDF and not self.content_url:
            raise ValueError("URL do PDF é obrigatória para aulas do tipo PDF")
        if self.content_type == ContentType.TEXT and not self.description:
            raise ValueError("Descrição/conteúdo é obrigatório para aulas do tipo TEXT")
        # QUIZ: no additional validation (future implementation)
        return self


class UpdateLessonRequest(BaseModel):
    """Lesson update request.

    Note: Content validation happens in the service layer since we need
    to check against existing lesson data for partial updates.
    """

    title: str | None = Field(
        None, min_length=3, max_length=200, description="Lesson title"
    )
    description: str | None = Field(
        None, max_length=5000, description="Lesson description"
    )
    content_type: ContentType | None = Field(None, description="Type of content")
    content_url: str | None = Field(None, max_length=1000, description="Content URL")
    duration_seconds: int | None = Field(None, ge=0, description="Duration in seconds")
    status: ContentStatus | None = Field(None, description="Publication status")


class LessonResponse(BaseModel):
    """Lesson response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None = None
    content_type: ContentType
    content_url: str | None = None
    duration_seconds: int | None = None
    status: ContentStatus
    creator_id: UUID
    created_at: datetime
    updated_at: datetime | None = None
    is_valid: bool = True  # Computed from content_type and content


class LessonInModuleResponse(LessonResponse):
    """Lesson response within a module (includes position).

    Inherits is_valid from LessonResponse for content validation status.
    """

    position: int


class LessonListResponse(BaseModel):
    """Paginated lesson list response."""

    items: list[LessonResponse]
    total: int
    has_more: bool


# ==============================================================================
# Link/Unlink Schemas
# ==============================================================================


class LinkModuleRequest(BaseModel):
    """Request to link a module to a course."""

    module_id: UUID = Field(..., description="Module ID to link")
    position: int | None = Field(
        None, ge=0, description="Position (auto-calculated if None)"
    )


class LinkLessonRequest(BaseModel):
    """Request to link a lesson to a module."""

    lesson_id: UUID = Field(..., description="Lesson ID to link")
    position: int | None = Field(
        None, ge=0, description="Position (auto-calculated if None)"
    )


class ReorderRequest(BaseModel):
    """Request to reorder items."""

    items: list[UUID] = Field(..., min_length=1, description="Ordered list of IDs")


# ==============================================================================
# Detail Response (Nested)
# ==============================================================================


class CourseDetailResponse(CourseResponse):
    """Course detail response with nested modules and lessons.

    Includes user-specific access information when authenticated.
    """

    modules: list[ModuleInCourseResponse] = []
    has_access: bool | None = None  # User has active acquisition (None if anonymous)
    acquisition_type: str | None = None  # How user acquired (if has_access)


class ModuleDetailResponse(ModuleResponse):
    """Module detail response with nested lessons."""

    lessons: list[LessonInModuleResponse] = []


# ==============================================================================
# Usage/Reference Schemas
# ==============================================================================


class CourseReferenceResponse(BaseModel):
    """Minimal course reference (for usage queries)."""

    id: UUID
    title: str
    slug: str
    status: ContentStatus


class ModuleReferenceResponse(BaseModel):
    """Minimal module reference (for usage queries)."""

    id: UUID
    title: str
    slug: str
    status: ContentStatus


class ModuleUsageResponse(BaseModel):
    """Response showing where a module is used."""

    module: ModuleResponse
    courses: list[CourseReferenceResponse]
    course_count: int


class LessonUsageResponse(BaseModel):
    """Response showing where a lesson is used."""

    lesson: LessonResponse
    modules: list[ModuleReferenceResponse]
    module_count: int


# ==============================================================================
# Message Response
# ==============================================================================


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


# Fix forward references
ModuleInCourseResponse.model_rebuild()
CourseDetailResponse.model_rebuild()
