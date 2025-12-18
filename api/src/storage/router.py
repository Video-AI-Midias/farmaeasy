"""Router for storage endpoints."""

from typing import Annotated

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from src.storage.dependencies import StorageServiceDep
from src.storage.schemas import (
    StorageConfigResponse,
    StorageErrorResponse,
    StorageUploadResponse,
)
from src.storage.service import (
    FileTooLargeError,
    InvalidContentTypeError,
    StorageNotConfiguredError,
    StorageUploadError,
    StorageValidationError,
)


logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/storage", tags=["storage"])


@router.get(
    "/config",
    response_model=StorageConfigResponse,
    summary="Get storage configuration",
    description="Returns current storage configuration status and limits.",
)
async def get_storage_config(storage: StorageServiceDep) -> StorageConfigResponse:
    """Get storage configuration and status."""
    return StorageConfigResponse(
        configured=storage.is_configured,
        bucket=storage.settings.firebase_storage_bucket
        if storage.is_configured
        else None,
        max_file_size_mb=storage.settings.upload_max_file_size_mb,
        allowed_types=storage.allowed_types,
    )


@router.post(
    "/thumbnails",
    response_model=StorageUploadResponse,
    responses={
        400: {"model": StorageErrorResponse, "description": "Validation error"},
        413: {"model": StorageErrorResponse, "description": "File too large"},
        415: {"model": StorageErrorResponse, "description": "Unsupported media type"},
        500: {"model": StorageErrorResponse, "description": "Upload failed"},
        503: {"model": StorageErrorResponse, "description": "Storage not configured"},
    },
    summary="Upload thumbnail image",
    description="Upload a thumbnail image for a course, module, or lesson.",
)
async def upload_thumbnail(
    storage: StorageServiceDep,
    file: Annotated[UploadFile, File(description="Image file to upload")],
    entity_type: Annotated[
        str,
        Form(
            description="Type of entity (course, module, lesson, user)",
            pattern="^(course|module|lesson|user)$",
        ),
    ],
    entity_id: Annotated[
        str,
        Form(description="ID of the entity", min_length=1, max_length=100),
    ],
) -> StorageUploadResponse:
    """Upload a thumbnail image to Firebase Storage.

    Args:
        storage: Storage service instance.
        file: Image file to upload.
        entity_type: Type of entity (course, module, lesson).
        entity_id: ID of the entity.

    Returns:
        StorageUploadResponse with file URL and metadata.

    Raises:
        HTTPException: On validation or upload errors.
    """
    logger.info(
        "thumbnail_upload_request",
        entity_type=entity_type,
        entity_id=entity_id,
        filename=file.filename,
        content_type=file.content_type,
    )

    # Validate entity_type (FastAPI Form validation should catch this, but double-check)
    if entity_type not in ("course", "module", "lesson", "user"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "Invalid entity_type. Must be: course, module, lesson, or user",
                "code": "invalid_entity_type",
            },
        )

    try:
        # Read file content
        content = await file.read()

        # Upload to Firebase
        result = await storage.upload_thumbnail(
            content=content,
            content_type=file.content_type or "application/octet-stream",
            entity_type=entity_type,
            entity_id=entity_id,
            filename=file.filename,
        )

        return StorageUploadResponse(
            success=True,
            file_url=str(result["file_url"]),
            storage_path=str(result["storage_path"]),
            content_type=str(result["content_type"]),
            file_size=int(result["file_size"]),
            filename=str(result["filename"]),
            uploaded_at=result["uploaded_at"],
        )

    except StorageNotConfiguredError as e:
        logger.warning("storage_not_configured", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "error": e.message,
                "code": e.code,
            },
        ) from e

    except FileTooLargeError as e:
        logger.warning(
            "file_too_large",
            entity_type=entity_type,
            entity_id=entity_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "success": False,
                "error": e.message,
                "code": e.code,
            },
        ) from e

    except InvalidContentTypeError as e:
        logger.warning(
            "invalid_content_type",
            entity_type=entity_type,
            entity_id=entity_id,
            content_type=file.content_type,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "success": False,
                "error": e.message,
                "code": e.code,
            },
        ) from e

    except StorageValidationError as e:
        logger.warning(
            "storage_validation_failed",
            entity_type=entity_type,
            entity_id=entity_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": e.message,
                "code": e.code,
            },
        ) from e

    except StorageUploadError as e:
        logger.exception(
            "upload_failed",
            entity_type=entity_type,
            entity_id=entity_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": "Failed to upload file",
                "code": e.code,
            },
        ) from e

    except Exception as e:
        logger.exception(
            "unexpected_upload_error",
            entity_type=entity_type,
            entity_id=entity_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": "An unexpected error occurred",
                "code": "internal_error",
            },
        ) from e


@router.delete(
    "/thumbnails/{storage_path:path}",
    response_model=dict,
    responses={
        404: {"model": StorageErrorResponse, "description": "File not found"},
        500: {"model": StorageErrorResponse, "description": "Delete failed"},
        503: {"model": StorageErrorResponse, "description": "Storage not configured"},
    },
    summary="Delete thumbnail",
    description="Delete a thumbnail from Firebase Storage.",
)
async def delete_thumbnail(
    storage: StorageServiceDep,
    storage_path: str,
) -> dict:
    """Delete a thumbnail from Firebase Storage.

    Args:
        storage: Storage service instance.
        storage_path: Path of the file in storage.

    Returns:
        Success status.

    Raises:
        HTTPException: On deletion errors.
    """
    logger.info("thumbnail_delete_request", storage_path=storage_path)

    try:
        deleted = await storage.delete_file(storage_path)

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "success": False,
                    "error": "File not found",
                    "code": "not_found",
                },
            )

        return {"success": True, "message": "File deleted successfully"}

    except StorageNotConfiguredError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "error": e.message,
                "code": e.code,
            },
        ) from e

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("delete_failed", storage_path=storage_path, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": "Failed to delete file",
                "code": "delete_error",
            },
        ) from e
