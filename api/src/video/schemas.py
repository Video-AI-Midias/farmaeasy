"""Pydantic schemas for video API.

Request and response models for video URL signing.
"""

from pydantic import BaseModel, Field


class SignedUrlRequest(BaseModel):
    """Request for generating signed video URL."""

    content_url: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Video URL or video ID",
    )
    prefer_hls: bool = Field(
        default=False,
        description="Prefer HLS streaming over iframe embed",
    )
    autoplay: bool = Field(
        default=False,
        description="Auto-start video playback",
    )
    start_time: int | None = Field(
        default=None,
        ge=0,
        description="Start time in seconds",
    )


class SignedUrlResponse(BaseModel):
    """Response with signed video URLs."""

    video_id: str = Field(..., description="Extracted video ID")
    embed_url: str | None = Field(
        default=None,
        description="Signed iframe embed URL",
    )
    hls_url: str | None = Field(
        default=None,
        description="Signed HLS streaming URL",
    )
    thumbnail_url: str | None = Field(
        default=None,
        description="Static thumbnail URL (JPEG)",
    )
    thumbnail_animated_url: str | None = Field(
        default=None,
        description="Animated thumbnail URL (WebP)",
    )
    type: str = Field(..., description="Detected URL type")


class VideoConfigResponse(BaseModel):
    """Response with video configuration status."""

    configured: bool = Field(..., description="Whether Bunny.net is configured")
    library_id: str | None = Field(
        default=None,
        description="Configured library ID (if available)",
    )
    cdn_hostname: str | None = Field(
        default=None,
        description="CDN hostname for thumbnail URLs (e.g., vz-xxx.b-cdn.net)",
    )


class ThumbnailRequest(BaseModel):
    """Request for generating thumbnail URL from video content."""

    content_url: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Video URL or video ID",
    )
    animated: bool = Field(
        default=False,
        description="Return animated WebP preview instead of static JPEG",
    )


class ThumbnailResponse(BaseModel):
    """Response with thumbnail URL."""

    video_id: str = Field(..., description="Extracted video ID")
    thumbnail_url: str = Field(..., description="Thumbnail URL")
    animated: bool = Field(..., description="Whether this is an animated preview")
