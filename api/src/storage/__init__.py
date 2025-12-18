"""Storage module for file uploads to Firebase Storage."""

from src.storage.dependencies import StorageServiceDep, get_storage_service
from src.storage.router import router
from src.storage.schemas import (
    StorageConfigResponse,
    StorageErrorResponse,
    StorageUploadResponse,
    ThumbnailUploadRequest,
)
from src.storage.service import (
    FileTooLargeError,
    FirebaseStorageService,
    InvalidContentTypeError,
    StorageError,
    StorageNotConfiguredError,
    StorageUploadError,
    StorageValidationError,
)


__all__ = [
    "FileTooLargeError",
    "FirebaseStorageService",
    "InvalidContentTypeError",
    "StorageConfigResponse",
    "StorageError",
    "StorageErrorResponse",
    "StorageNotConfiguredError",
    "StorageServiceDep",
    "StorageUploadError",
    "StorageUploadResponse",
    "StorageValidationError",
    "ThumbnailUploadRequest",
    "get_storage_service",
    "router",
]
