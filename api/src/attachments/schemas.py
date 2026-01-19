"""Pydantic schemas for attachment operations.

Request/Response models for:
- CRUD operations on attachments
- Upload metadata
- Download tracking
- Aggregated materials listings
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AttachmentType(str, Enum):
    """Attachment file type categories."""

    PDF = "pdf"
    DOCUMENT = "document"
    SPREADSHEET = "spreadsheet"
    PRESENTATION = "presentation"
    IMAGE = "image"
    ARCHIVE = "archive"
    VIDEO = "video"
    AUDIO = "audio"
    OTHER = "other"


class EntityType(str, Enum):
    """Entity types that can have attachments."""

    LESSON = "lesson"
    MODULE = "module"
    COURSE = "course"


# ==============================================================================
# Request Schemas
# ==============================================================================


class CreateAttachmentRequest(BaseModel):
    """Request to create an attachment after file upload."""

    title: str | None = Field(
        default=None,
        max_length=255,
        description="Display title (defaults to filename if not provided)",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="Optional description of the attachment",
    )
    entity_type: EntityType = Field(
        ...,
        description="Type of parent entity",
    )
    entity_id: UUID = Field(
        ...,
        description="ID of the parent entity",
    )
    position: int | None = Field(
        default=None,
        ge=0,
        description="Order position (auto-assigned if not provided)",
    )


class UpdateAttachmentRequest(BaseModel):
    """Request to update attachment metadata."""

    title: str | None = Field(
        default=None,
        max_length=255,
        description="New display title",
    )
    description: str | None = Field(
        default=None,
        max_length=1000,
        description="New description",
    )


class ReorderAttachmentsRequest(BaseModel):
    """Request to reorder attachments within an entity."""

    items: list[UUID] = Field(
        ...,
        min_length=1,
        description="Attachment IDs in desired order",
    )


# ==============================================================================
# Response Schemas
# ==============================================================================


class AttachmentResponse(BaseModel):
    """Response model for a single attachment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    original_filename: str
    file_url: str
    file_size: int = Field(..., description="Size in bytes")
    mime_type: str
    attachment_type: AttachmentType
    entity_type: EntityType
    entity_id: UUID
    position: int
    creator_id: UUID | None
    download_count: int
    created_at: datetime
    updated_at: datetime | None

    # Computed fields for UI
    @property
    def file_size_formatted(self) -> str:
        """Human-readable file size."""
        size = self.file_size
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"


class AttachmentWithDownloadStatus(AttachmentResponse):
    """Attachment response with user-specific download status."""

    has_downloaded: bool = Field(
        default=False,
        description="Whether current user has downloaded this attachment",
    )
    last_downloaded_at: datetime | None = Field(
        default=None,
        description="When user last downloaded this attachment",
    )


class AttachmentListResponse(BaseModel):
    """Paginated list of attachments."""

    items: list[AttachmentResponse]
    total: int
    has_more: bool = False


class AttachmentListWithDownloadStatus(BaseModel):
    """List of attachments with download status for authenticated users."""

    items: list[AttachmentWithDownloadStatus]
    total: int
    has_more: bool = False


# ==============================================================================
# Aggregated Materials Schemas (for student view)
# ==============================================================================


class MaterialSource(BaseModel):
    """Source information for a material in aggregated view."""

    entity_type: EntityType
    entity_id: UUID
    entity_title: str


class AggregatedMaterial(BaseModel):
    """Material with source information for aggregated listings."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    original_filename: str
    file_url: str
    file_size: int
    mime_type: str
    attachment_type: AttachmentType
    download_count: int
    created_at: datetime
    source: MaterialSource
    has_downloaded: bool = False
    last_downloaded_at: datetime | None = None


class CourseMaterialsResponse(BaseModel):
    """All materials for a course, aggregated from course/modules/lessons."""

    course_id: UUID
    course_title: str
    # Direct course attachments
    course_materials: list[AggregatedMaterial]
    # Materials grouped by module
    modules: list["ModuleMaterialsGroup"]
    # Total counts
    total_materials: int
    total_downloaded: int


class ModuleMaterialsGroup(BaseModel):
    """Materials grouped by module."""

    module_id: UUID
    module_title: str
    module_position: int
    # Direct module attachments
    module_materials: list[AggregatedMaterial]
    # Materials grouped by lesson
    lessons: list["LessonMaterialsGroup"]


class LessonMaterialsGroup(BaseModel):
    """Materials grouped by lesson."""

    lesson_id: UUID
    lesson_title: str
    lesson_position: int
    materials: list[AggregatedMaterial]


# Rebuild models for forward references
CourseMaterialsResponse.model_rebuild()
ModuleMaterialsGroup.model_rebuild()


# ==============================================================================
# Download Tracking Schemas
# ==============================================================================


class RecordDownloadRequest(BaseModel):
    """Request to record a download event."""

    attachment_id: UUID


class DownloadStatsResponse(BaseModel):
    """Download statistics for an attachment."""

    attachment_id: UUID
    total_downloads: int
    unique_users: int


class UserDownloadHistoryResponse(BaseModel):
    """User's download history for an entity."""

    entity_type: EntityType
    entity_id: UUID
    downloads: list["UserDownloadEntry"]
    total_downloaded: int
    total_available: int


class UserDownloadEntry(BaseModel):
    """Single entry in user's download history."""

    attachment_id: UUID
    attachment_title: str
    first_downloaded_at: datetime
    last_downloaded_at: datetime
    download_count: int


UserDownloadHistoryResponse.model_rebuild()


# ==============================================================================
# Upload Schemas
# ==============================================================================


class AttachmentUploadResponse(BaseModel):
    """Response after successful file upload."""

    success: bool = True
    attachment: AttachmentResponse
    message: str = "Attachment uploaded successfully"


class AttachmentUploadErrorResponse(BaseModel):
    """Response for upload errors."""

    success: bool = False
    error: str
    code: str


# ==============================================================================
# Message Response
# ==============================================================================


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
