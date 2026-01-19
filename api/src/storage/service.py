"""Firebase Storage service for file uploads.

Handles secure file uploads to Firebase Storage with:
- Magic bytes validation for content type verification
- Size limits and rate limiting support
- Automatic path generation and URL creation
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

import structlog


if TYPE_CHECKING:
    from google.cloud.storage import Blob, Bucket

from src.config.settings import Settings
from src.utils.magic_bytes import validate_content_type


logger = structlog.get_logger(__name__)


class StorageError(Exception):
    """Base error for storage operations."""

    def __init__(self, message: str, code: str = "storage_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class StorageNotConfiguredError(StorageError):
    """Error when Firebase Storage is not configured."""

    def __init__(self, message: str = "Firebase Storage is not configured") -> None:
        super().__init__(message, "storage_not_configured")


class StorageUploadError(StorageError):
    """Error during file upload."""

    def __init__(self, message: str) -> None:
        super().__init__(message, "upload_error")


class StorageValidationError(StorageError):
    """Error during file validation."""

    def __init__(self, message: str) -> None:
        super().__init__(message, "validation_error")


class FileTooLargeError(StorageError):
    """Error when file exceeds size limit."""

    def __init__(self, size: int, max_size: int) -> None:
        message = (
            f"File size ({size / 1024 / 1024:.2f} MB) exceeds "
            f"maximum allowed ({max_size / 1024 / 1024:.2f} MB)"
        )
        super().__init__(message, "file_too_large")


class InvalidContentTypeError(StorageError):
    """Error when content type is not allowed."""

    def __init__(self, content_type: str, allowed: list[str]) -> None:
        message = f"Content type '{content_type}' is not allowed. Allowed: {', '.join(allowed)}"
        super().__init__(message, "invalid_content_type")


# Firebase app singleton
_firebase_app = None
_storage_bucket: "Bucket | None" = None


def _init_firebase(settings: Settings) -> "Bucket":
    """Initialize Firebase Admin SDK and get storage bucket.

    Args:
        settings: Application settings.

    Returns:
        Firebase Storage bucket.

    Raises:
        StorageNotConfiguredError: If Firebase is not configured.
    """
    global _firebase_app, _storage_bucket  # noqa: PLW0603

    if _storage_bucket is not None:
        return _storage_bucket

    if not settings.firebase_configured:
        raise StorageNotConfiguredError

    # Lazy import to avoid loading Firebase SDK unless needed
    import firebase_admin  # noqa: PLC0415
    from firebase_admin import credentials, storage  # noqa: PLC0415

    # Resolve credentials path
    creds_path = settings.firebase_credentials_path
    if creds_path and not Path(creds_path).is_absolute():
        # Try relative to API root
        api_root = Path(__file__).parent.parent.parent
        creds_path = str(api_root / creds_path)

    if not creds_path or not Path(creds_path).exists():
        raise StorageNotConfiguredError(
            f"Firebase credentials file not found: {creds_path}"
        )

    try:
        # Check if already initialized
        if _firebase_app is None:
            cred = credentials.Certificate(creds_path)
            _firebase_app = firebase_admin.initialize_app(
                cred,
                {
                    "storageBucket": settings.firebase_storage_bucket,
                    "projectId": settings.firebase_project_id,
                },
            )
            logger.info(
                "firebase_initialized",
                project_id=settings.firebase_project_id,
                bucket=settings.firebase_storage_bucket,
            )

        _storage_bucket = storage.bucket()
        return _storage_bucket

    except Exception as e:
        logger.exception("firebase_init_failed", error=str(e))
        raise StorageNotConfiguredError(f"Failed to initialize Firebase: {e}") from e


class FirebaseStorageService:
    """Service for uploading files to Firebase Storage."""

    # Extension mapping for content types
    EXTENSION_MAP: dict[str, str] = {
        # Images
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
        "image/avif": ".avif",
        "image/heic": ".heic",
        "image/svg+xml": ".svg",
        # Documents
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.oasis.opendocument.text": ".odt",
        "text/plain": ".txt",
        "text/markdown": ".md",
        "application/rtf": ".rtf",
        # Spreadsheets
        "application/vnd.ms-excel": ".xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.oasis.opendocument.spreadsheet": ".ods",
        "text/csv": ".csv",
        # Presentations
        "application/vnd.ms-powerpoint": ".ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "application/vnd.oasis.opendocument.presentation": ".odp",
        # Archives
        "application/zip": ".zip",
        "application/x-rar-compressed": ".rar",
        "application/x-7z-compressed": ".7z",
        "application/gzip": ".gz",
        # Audio
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/webm": ".weba",
        # Video
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/x-msvideo": ".avi",
    }

    def __init__(self, settings: Settings) -> None:
        """Initialize storage service.

        Args:
            settings: Application settings.
        """
        self.settings = settings
        self._bucket: Bucket | None = None

    @property
    def is_configured(self) -> bool:
        """Check if Firebase Storage is configured."""
        return self.settings.firebase_configured

    @property
    def max_file_size(self) -> int:
        """Maximum file size in bytes."""
        return self.settings.upload_max_file_size_mb * 1024 * 1024

    @property
    def allowed_types(self) -> list[str]:
        """Allowed MIME types for thumbnails."""
        return self.settings.upload_allowed_image_types

    @property
    def attachment_max_file_size(self) -> int:
        """Maximum file size for attachments in bytes."""
        return self.settings.attachment_max_file_size_mb * 1024 * 1024

    @property
    def attachment_allowed_types(self) -> list[str]:
        """Allowed MIME types for attachments."""
        return self.settings.attachment_allowed_types

    def _ensure_configured(self) -> None:
        """Ensure Firebase is configured.

        Raises:
            StorageNotConfiguredError: If not configured.
        """
        if not self.is_configured:
            raise StorageNotConfiguredError

    def _get_bucket(self) -> "Bucket":
        """Get Firebase Storage bucket (lazy initialization).

        Returns:
            Firebase Storage bucket.
        """
        if self._bucket is None:
            self._bucket = _init_firebase(self.settings)
        return self._bucket

    def _build_storage_path(
        self,
        entity_type: str,
        entity_id: str,
        content_type: str,
        original_filename: str | None = None,
    ) -> str:
        """Build storage path for a file.

        Format: farmaeasy/thumbnails/{entity_type}/{entity_id}_{timestamp}{ext}

        Args:
            entity_type: Type of entity (course, module, lesson).
            entity_id: ID of the entity.
            content_type: MIME type of the file.
            original_filename: Original filename (optional, for extension fallback).

        Returns:
            Storage path string.
        """
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")

        # Determine extension
        ext = self.EXTENSION_MAP.get(content_type, "")
        if not ext and original_filename:
            ext = Path(original_filename).suffix.lower()

        filename = f"{entity_id}_{timestamp}{ext}"
        return f"farmaeasy/thumbnails/{entity_type}/{filename}"

    def _generate_public_url(self, storage_path: str) -> str:
        """Generate public URL for a stored file.

        Args:
            storage_path: Path in Firebase Storage.

        Returns:
            Public URL string.
        """
        bucket_name = self.settings.firebase_storage_bucket
        # URL encode path parts
        encoded_path = "/".join(
            quote(part, safe="") for part in storage_path.split("/")
        )
        return f"https://storage.googleapis.com/{bucket_name}/{encoded_path}"

    async def upload_thumbnail(
        self,
        content: bytes,
        content_type: str,
        entity_type: str,
        entity_id: str,
        filename: str | None = None,
    ) -> dict[str, str | int | datetime]:
        """Upload a thumbnail image to Firebase Storage.

        Args:
            content: File content as bytes.
            content_type: Declared Content-Type.
            entity_type: Type of entity (course, module, lesson).
            entity_id: ID of the entity.
            filename: Original filename (optional).

        Returns:
            Dict with file_url, storage_path, content_type, file_size, filename, uploaded_at.

        Raises:
            StorageNotConfiguredError: If Firebase is not configured.
            FileTooLargeError: If file exceeds size limit.
            InvalidContentTypeError: If content type is not allowed.
            StorageValidationError: If magic bytes validation fails.
            StorageUploadError: If upload fails.
        """
        self._ensure_configured()

        # Validate file size
        file_size = len(content)
        if file_size > self.max_file_size:
            raise FileTooLargeError(file_size, self.max_file_size)

        # Validate content type header
        if content_type not in self.allowed_types:
            raise InvalidContentTypeError(content_type, self.allowed_types)

        # Validate magic bytes (OWASP security)
        is_valid, detected_type, error_msg = validate_content_type(
            content[:64],
            content_type,
            strict=False,
            allowed_types=frozenset(self.allowed_types),
        )

        if not is_valid:
            logger.warning(
                "magic_bytes_validation_failed",
                declared_type=content_type,
                detected_type=detected_type,
                error=error_msg,
            )
            raise StorageValidationError(error_msg or "Invalid file content")

        # Use detected type (more accurate than declared)
        actual_type = detected_type or content_type

        # Build storage path
        storage_path = self._build_storage_path(
            entity_type=entity_type,
            entity_id=entity_id,
            content_type=actual_type,
            original_filename=filename,
        )

        try:
            bucket = self._get_bucket()
            blob: Blob = bucket.blob(storage_path)

            # Set cache control for immutable content (1 year)
            blob.cache_control = "public, max-age=31536000, immutable"

            # Upload content
            blob.upload_from_string(content, content_type=actual_type)

            # Make publicly accessible
            blob.make_public()

            logger.info(
                "thumbnail_uploaded",
                storage_path=storage_path,
                content_type=actual_type,
                file_size=file_size,
                entity_type=entity_type,
                entity_id=entity_id,
            )

            return {
                "file_url": self._generate_public_url(storage_path),
                "storage_path": storage_path,
                "content_type": actual_type,
                "file_size": file_size,
                "filename": filename or Path(storage_path).name,
                "uploaded_at": datetime.now(UTC),
            }

        except Exception as e:
            logger.exception(
                "upload_failed",
                storage_path=storage_path,
                error=str(e),
            )
            raise StorageUploadError(f"Failed to upload file: {e}") from e

    async def delete_file(self, storage_path: str) -> bool:
        """Delete a file from Firebase Storage.

        Args:
            storage_path: Path of file to delete.

        Returns:
            True if deleted, False if not found.

        Raises:
            StorageNotConfiguredError: If Firebase is not configured.
        """
        self._ensure_configured()

        try:
            bucket = self._get_bucket()
            blob = bucket.blob(storage_path)

            if not blob.exists():
                logger.warning("delete_file_not_found", storage_path=storage_path)
                return False

            blob.delete()
            logger.info("file_deleted", storage_path=storage_path)
            return True

        except Exception as e:
            logger.exception("delete_failed", storage_path=storage_path, error=str(e))
            raise StorageUploadError(f"Failed to delete file: {e}") from e

    def _build_attachment_storage_path(
        self,
        attachment_id: str,
        entity_type: str,
        content_type: str,
        original_filename: str | None = None,
    ) -> str:
        """Build storage path for an attachment.

        Uses UUID for uniqueness, preserves extension for proper content handling.
        Format: farmaeasy/attachments/{entity_type}/{uuid}{ext}

        Args:
            attachment_id: UUID of the attachment.
            entity_type: Type of entity (course, module, lesson).
            content_type: MIME type of the file.
            original_filename: Original filename (for extension fallback).

        Returns:
            Storage path string.
        """
        # Determine extension
        ext = self.EXTENSION_MAP.get(content_type, "")
        if not ext and original_filename:
            ext = Path(original_filename).suffix.lower()

        filename = f"{attachment_id}{ext}"
        return f"farmaeasy/attachments/{entity_type}/{filename}"

    async def upload_attachment(
        self,
        content: bytes,
        content_type: str,
        attachment_id: str,
        entity_type: str,
        original_filename: str,
    ) -> dict[str, str | int | datetime]:
        """Upload an attachment file to Firebase Storage.

        Uses UUID as filename for uniqueness, preserves original_filename
        for download purposes.

        Args:
            content: File content as bytes.
            content_type: Declared Content-Type.
            attachment_id: UUID for the attachment (used as filename).
            entity_type: Type of entity (lesson, module, course).
            original_filename: Original name of the file (preserved for downloads).

        Returns:
            Dict with file_url, storage_path, content_type, file_size,
            original_filename, uploaded_at.

        Raises:
            StorageNotConfiguredError: If Firebase is not configured.
            FileTooLargeError: If file exceeds size limit.
            InvalidContentTypeError: If content type is not allowed.
            StorageUploadError: If upload fails.
        """
        self._ensure_configured()

        # Validate file size
        file_size = len(content)
        if file_size > self.attachment_max_file_size:
            raise FileTooLargeError(file_size, self.attachment_max_file_size)

        # Validate content type
        if content_type not in self.attachment_allowed_types:
            raise InvalidContentTypeError(content_type, self.attachment_allowed_types)

        # Build storage path using UUID
        storage_path = self._build_attachment_storage_path(
            attachment_id=attachment_id,
            entity_type=entity_type,
            content_type=content_type,
            original_filename=original_filename,
        )

        try:
            bucket = self._get_bucket()
            blob: Blob = bucket.blob(storage_path)

            # Set cache control - attachments can be cached but should validate
            blob.cache_control = "public, max-age=86400"  # 1 day

            # Set content disposition to preserve original filename on download
            safe_filename = quote(original_filename, safe="")
            blob.content_disposition = f"attachment; filename*=UTF-8''{safe_filename}"

            # Upload content
            blob.upload_from_string(content, content_type=content_type)

            # Make publicly accessible
            blob.make_public()

            logger.info(
                "attachment_uploaded",
                storage_path=storage_path,
                content_type=content_type,
                file_size=file_size,
                entity_type=entity_type,
                attachment_id=attachment_id,
                original_filename=original_filename,
            )

            return {
                "file_url": self._generate_public_url(storage_path),
                "storage_path": storage_path,
                "content_type": content_type,
                "file_size": file_size,
                "original_filename": original_filename,
                "uploaded_at": datetime.now(UTC),
            }

        except Exception as e:
            logger.exception(
                "attachment_upload_failed",
                storage_path=storage_path,
                error=str(e),
            )
            raise StorageUploadError(f"Failed to upload attachment: {e}") from e
