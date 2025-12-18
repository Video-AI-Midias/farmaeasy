"""Pydantic schemas for storage operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ThumbnailUploadRequest(BaseModel):
    """Request model for thumbnail upload metadata."""

    entity_type: str = Field(
        ...,
        description="Type of entity (course, module, lesson)",
        pattern="^(course|module|lesson)$",
    )
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="ID of the entity this thumbnail belongs to",
    )


class StorageUploadResponse(BaseModel):
    """Response model for successful upload."""

    model_config = ConfigDict(from_attributes=True)

    success: bool = Field(default=True, description="Upload success status")
    file_url: str = Field(..., description="Public URL of uploaded file")
    storage_path: str = Field(..., description="Internal storage path")
    content_type: str = Field(..., description="Detected MIME type")
    file_size: int = Field(..., description="File size in bytes")
    filename: str = Field(..., description="Original filename")
    uploaded_at: datetime = Field(..., description="Upload timestamp")


class StorageErrorResponse(BaseModel):
    """Response model for upload errors."""

    success: bool = Field(default=False, description="Upload success status")
    error: str = Field(..., description="Error message")
    code: str = Field(..., description="Error code")


class StorageConfigResponse(BaseModel):
    """Response model for storage configuration status."""

    configured: bool = Field(..., description="Whether storage is configured")
    bucket: str | None = Field(default=None, description="Storage bucket name")
    max_file_size_mb: int = Field(..., description="Maximum file size in MB")
    allowed_types: list[str] = Field(..., description="Allowed MIME types")
