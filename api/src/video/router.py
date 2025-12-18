"""Video API endpoints.

Provides routes for:
- Generating signed video URLs
- Checking video configuration status
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth.dependencies import CurrentUser
from src.config.settings import Settings, get_settings
from src.video.schemas import (
    SignedUrlRequest,
    SignedUrlResponse,
    ThumbnailRequest,
    ThumbnailResponse,
    VideoConfigResponse,
)
from src.video.service import (
    BunnyService,
    InvalidVideoUrlError,
    VideoNotConfiguredError,
)


router = APIRouter(prefix="/v1/video", tags=["video"])


def get_bunny_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> BunnyService:
    """Get Bunny service instance."""
    return BunnyService(settings)


BunnyServiceDep = Annotated[BunnyService, Depends(get_bunny_service)]


@router.get(
    "/config",
    response_model=VideoConfigResponse,
    summary="Get video configuration status",
)
async def get_video_config(
    bunny_service: BunnyServiceDep,
) -> VideoConfigResponse:
    """Get video streaming configuration status (public).

    Returns whether Bunny.net Stream is configured, the library ID,
    and the CDN hostname for thumbnail URL construction.
    Does NOT expose sensitive information like token keys.
    """
    settings = bunny_service.settings
    return VideoConfigResponse(
        configured=bunny_service.is_configured,
        library_id=settings.bunny_library_id if bunny_service.is_configured else None,
        cdn_hostname=settings.bunny_cdn_hostname
        if bunny_service.is_configured
        else None,
    )


@router.post(
    "/signed-url",
    response_model=SignedUrlResponse,
    summary="Generate signed video URL",
)
async def generate_signed_url(
    data: SignedUrlRequest,
    bunny_service: BunnyServiceDep,
    _user: CurrentUser,  # Required for auth, not used in logic
) -> SignedUrlResponse:
    """Generate signed URLs for video playback (authenticated users only).

    This endpoint generates secure, time-limited URLs for video playback.
    The URLs include authentication tokens that expire after the configured time.

    Requires authentication to prevent unauthorized URL generation.
    """
    try:
        result = bunny_service.get_signed_url(
            content_url=data.content_url,
            prefer_hls=data.prefer_hls,
            autoplay=data.autoplay,
            start_time=data.start_time,
        )

        video_id = result["video_id"] or ""

        # Generate thumbnail URLs
        thumbnail_url = None
        thumbnail_animated_url = None
        if video_id:
            thumbnail_url = bunny_service.get_thumbnail_url_from_content(
                video_id, animated=False
            )
            thumbnail_animated_url = bunny_service.get_thumbnail_url_from_content(
                video_id, animated=True
            )

        return SignedUrlResponse(
            video_id=video_id,
            embed_url=result["embed_url"],
            hls_url=result["hls_url"],
            thumbnail_url=thumbnail_url,
            thumbnail_animated_url=thumbnail_animated_url,
            type=result["type"] or "unknown",
        )

    except VideoNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e

    except InvalidVideoUrlError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.post(
    "/thumbnail",
    response_model=ThumbnailResponse,
    summary="Generate thumbnail URL from video content",
)
async def generate_thumbnail_url(
    data: ThumbnailRequest,
    bunny_service: BunnyServiceDep,
) -> ThumbnailResponse:
    """Generate thumbnail URL from video content URL or ID (public).

    This endpoint extracts the video ID from a content URL and returns
    the corresponding Bunny.net thumbnail URL.

    Bunny.net automatically generates thumbnails for all uploaded videos.
    - Static thumbnails: thumbnail.jpg
    - Animated previews: preview.webp
    """
    try:
        parsed = bunny_service.parse_video_url(data.content_url)
        thumbnail_url = bunny_service.generate_thumbnail_url(
            parsed.video_id, animated=data.animated
        )

        return ThumbnailResponse(
            video_id=parsed.video_id,
            thumbnail_url=thumbnail_url,
            animated=data.animated,
        )

    except VideoNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e

    except InvalidVideoUrlError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
