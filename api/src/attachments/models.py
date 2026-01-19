"""Database models for course attachments/materials.

Cassandra table definitions for:
- Attachments: Main attachment table
- Lookup tables: By lesson, module, course
- Download tracking: For analytics

Architecture: Attachments can be linked to lessons, modules, or courses.
Files are stored in Firebase Storage with UUID naming for uniqueness,
but original filename is preserved for download purposes.
"""

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class AttachmentType(str, Enum):
    """Attachment file type categories."""

    PDF = "pdf"
    DOCUMENT = "document"  # DOC, DOCX, ODT
    SPREADSHEET = "spreadsheet"  # XLS, XLSX, ODS
    PRESENTATION = "presentation"  # PPT, PPTX, ODP
    IMAGE = "image"  # JPG, PNG, GIF, WEBP
    ARCHIVE = "archive"  # ZIP, RAR, 7Z
    VIDEO = "video"  # MP4, WEBM, MOV
    AUDIO = "audio"  # MP3, WAV, OGG
    OTHER = "other"


class EntityType(str, Enum):
    """Entity types that can have attachments."""

    LESSON = "lesson"
    MODULE = "module"
    COURSE = "course"


# MIME type to attachment type mapping
MIME_TO_ATTACHMENT_TYPE: dict[str, AttachmentType] = {
    # PDF
    "application/pdf": AttachmentType.PDF,
    # Documents
    "application/msword": AttachmentType.DOCUMENT,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": AttachmentType.DOCUMENT,
    "application/vnd.oasis.opendocument.text": AttachmentType.DOCUMENT,
    "text/plain": AttachmentType.DOCUMENT,
    "text/markdown": AttachmentType.DOCUMENT,
    "application/rtf": AttachmentType.DOCUMENT,
    # Spreadsheets
    "application/vnd.ms-excel": AttachmentType.SPREADSHEET,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": AttachmentType.SPREADSHEET,
    "application/vnd.oasis.opendocument.spreadsheet": AttachmentType.SPREADSHEET,
    "text/csv": AttachmentType.SPREADSHEET,
    # Presentations
    "application/vnd.ms-powerpoint": AttachmentType.PRESENTATION,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": AttachmentType.PRESENTATION,
    "application/vnd.oasis.opendocument.presentation": AttachmentType.PRESENTATION,
    # Images
    "image/jpeg": AttachmentType.IMAGE,
    "image/png": AttachmentType.IMAGE,
    "image/gif": AttachmentType.IMAGE,
    "image/webp": AttachmentType.IMAGE,
    "image/svg+xml": AttachmentType.IMAGE,
    "image/bmp": AttachmentType.IMAGE,
    # Archives
    "application/zip": AttachmentType.ARCHIVE,
    "application/x-rar-compressed": AttachmentType.ARCHIVE,
    "application/x-7z-compressed": AttachmentType.ARCHIVE,
    "application/gzip": AttachmentType.ARCHIVE,
    # Video
    "video/mp4": AttachmentType.VIDEO,
    "video/webm": AttachmentType.VIDEO,
    "video/quicktime": AttachmentType.VIDEO,
    "video/x-msvideo": AttachmentType.VIDEO,
    # Audio
    "audio/mpeg": AttachmentType.AUDIO,
    "audio/wav": AttachmentType.AUDIO,
    "audio/ogg": AttachmentType.AUDIO,
    "audio/webm": AttachmentType.AUDIO,
}


def get_attachment_type(mime_type: str) -> AttachmentType:
    """Get AttachmentType from MIME type."""
    return MIME_TO_ATTACHMENT_TYPE.get(mime_type, AttachmentType.OTHER)


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

# Main attachments table
ATTACHMENT_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.attachments (
    id UUID PRIMARY KEY,
    title TEXT,
    description TEXT,
    original_filename TEXT,
    storage_path TEXT,
    file_url TEXT,
    file_size BIGINT,
    mime_type TEXT,
    attachment_type TEXT,
    entity_type TEXT,
    entity_id UUID,
    position INT,
    creator_id UUID,
    download_count INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

# Lookup table: attachments by lesson
ATTACHMENTS_BY_LESSON_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.attachments_by_lesson (
    lesson_id UUID,
    position INT,
    attachment_id UUID,
    title TEXT,
    original_filename TEXT,
    file_url TEXT,
    file_size BIGINT,
    mime_type TEXT,
    attachment_type TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY (lesson_id, position, attachment_id)
) WITH CLUSTERING ORDER BY (position ASC, attachment_id ASC)
"""

# Lookup table: attachments by module
ATTACHMENTS_BY_MODULE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.attachments_by_module (
    module_id UUID,
    position INT,
    attachment_id UUID,
    title TEXT,
    original_filename TEXT,
    file_url TEXT,
    file_size BIGINT,
    mime_type TEXT,
    attachment_type TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY (module_id, position, attachment_id)
) WITH CLUSTERING ORDER BY (position ASC, attachment_id ASC)
"""

# Lookup table: attachments by course
ATTACHMENTS_BY_COURSE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.attachments_by_course (
    course_id UUID,
    position INT,
    attachment_id UUID,
    title TEXT,
    original_filename TEXT,
    file_url TEXT,
    file_size BIGINT,
    mime_type TEXT,
    attachment_type TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY (course_id, position, attachment_id)
) WITH CLUSTERING ORDER BY (position ASC, attachment_id ASC)
"""

# Download tracking table
ATTACHMENT_DOWNLOADS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.attachment_downloads (
    attachment_id UUID,
    user_id UUID,
    downloaded_at TIMESTAMP,
    PRIMARY KEY (attachment_id, user_id, downloaded_at)
) WITH CLUSTERING ORDER BY (user_id ASC, downloaded_at DESC)
"""

# User downloads lookup (to check if user already downloaded)
USER_ATTACHMENT_DOWNLOADS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.user_attachment_downloads (
    user_id UUID,
    attachment_id UUID,
    first_downloaded_at TIMESTAMP,
    last_downloaded_at TIMESTAMP,
    download_count INT,
    PRIMARY KEY (user_id, attachment_id)
)
"""

# Indexes
ATTACHMENT_ENTITY_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS attachments_entity_idx
ON {keyspace}.attachments (entity_type)
"""

ATTACHMENT_CREATOR_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS attachments_creator_idx
ON {keyspace}.attachments (creator_id)
"""

# All CQL statements for table setup
ATTACHMENTS_TABLES_CQL = [
    ATTACHMENT_TABLE_CQL,
    ATTACHMENTS_BY_LESSON_TABLE_CQL,
    ATTACHMENTS_BY_MODULE_TABLE_CQL,
    ATTACHMENTS_BY_COURSE_TABLE_CQL,
    ATTACHMENT_DOWNLOADS_TABLE_CQL,
    USER_ATTACHMENT_DOWNLOADS_TABLE_CQL,
    ATTACHMENT_ENTITY_INDEX_CQL,
    ATTACHMENT_CREATOR_INDEX_CQL,
]


# ==============================================================================
# Helper Functions
# ==============================================================================


def ensure_utc_aware(dt: datetime | None) -> datetime | None:
    """Ensure datetime is UTC-aware (Cassandra returns naive datetimes)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


# ==============================================================================
# Entity Classes
# ==============================================================================


class Attachment:
    """Attachment entity representing a downloadable file.

    Attributes:
        id: Unique identifier (UUID)
        title: Display title for the attachment
        description: Optional description
        original_filename: Original name of uploaded file (for download)
        storage_path: Path in Firebase Storage
        file_url: Public URL for download
        file_size: Size in bytes
        mime_type: MIME type of the file
        attachment_type: Category (PDF, document, etc.)
        entity_type: Type of parent (lesson, module, course)
        entity_id: ID of parent entity
        position: Order position within parent
        creator_id: User who uploaded
        download_count: Total downloads
        created_at: Upload timestamp
        updated_at: Last update timestamp
    """

    def __init__(
        self,
        id: UUID | None = None,
        title: str = "",
        description: str | None = None,
        original_filename: str = "",
        storage_path: str = "",
        file_url: str = "",
        file_size: int = 0,
        mime_type: str = "application/octet-stream",
        attachment_type: str = AttachmentType.OTHER.value,
        entity_type: str = EntityType.LESSON.value,
        entity_id: UUID | None = None,
        position: int = 0,
        creator_id: UUID | None = None,
        download_count: int = 0,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ):
        self.id = id or uuid4()
        self.title = title.strip() if title else original_filename
        self.description = description
        self.original_filename = original_filename
        self.storage_path = storage_path
        self.file_url = file_url
        self.file_size = file_size
        self.mime_type = mime_type
        self.attachment_type = attachment_type
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.position = position
        self.creator_id = creator_id
        self.download_count = download_count
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.updated_at = ensure_utc_aware(updated_at)

    @classmethod
    def from_row(cls, row: Any) -> "Attachment":
        """Create Attachment instance from Cassandra row."""
        return cls(
            id=row.id,
            title=row.title,
            description=row.description,
            original_filename=row.original_filename,
            storage_path=row.storage_path,
            file_url=row.file_url,
            file_size=row.file_size,
            mime_type=row.mime_type,
            attachment_type=row.attachment_type,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            position=row.position,
            creator_id=row.creator_id,
            download_count=row.download_count or 0,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @classmethod
    def from_lookup_row(
        cls, row: Any, entity_type: str, entity_id: UUID
    ) -> "Attachment":
        """Create partial Attachment from lookup table row."""
        return cls(
            id=row.attachment_id,
            title=row.title,
            original_filename=row.original_filename,
            file_url=row.file_url,
            file_size=row.file_size,
            mime_type=row.mime_type,
            attachment_type=row.attachment_type,
            entity_type=entity_type,
            entity_id=entity_id,
            position=row.position,
            created_at=row.created_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "original_filename": self.original_filename,
            "storage_path": self.storage_path,
            "file_url": self.file_url,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "attachment_type": self.attachment_type,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "position": self.position,
            "creator_id": self.creator_id,
            "download_count": self.download_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def __repr__(self) -> str:
        return f"<Attachment {self.title} ({self.attachment_type})>"


class AttachmentDownload:
    """Track individual download events for analytics.

    Attributes:
        attachment_id: The downloaded attachment
        user_id: User who downloaded
        downloaded_at: Timestamp of download
    """

    def __init__(
        self,
        attachment_id: UUID,
        user_id: UUID,
        downloaded_at: datetime | None = None,
    ):
        self.attachment_id = attachment_id
        self.user_id = user_id
        self.downloaded_at = ensure_utc_aware(downloaded_at) or datetime.now(UTC)

    @classmethod
    def from_row(cls, row: Any) -> "AttachmentDownload":
        """Create AttachmentDownload from Cassandra row."""
        return cls(
            attachment_id=row.attachment_id,
            user_id=row.user_id,
            downloaded_at=row.downloaded_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "attachment_id": self.attachment_id,
            "user_id": self.user_id,
            "downloaded_at": self.downloaded_at,
        }

    def __repr__(self) -> str:
        return f"<AttachmentDownload {self.attachment_id} by {self.user_id}>"


class UserAttachmentDownload:
    """Aggregated download info per user per attachment.

    Attributes:
        user_id: The user
        attachment_id: The attachment
        first_downloaded_at: First download timestamp
        last_downloaded_at: Most recent download
        download_count: Total downloads by this user
    """

    def __init__(
        self,
        user_id: UUID,
        attachment_id: UUID,
        first_downloaded_at: datetime | None = None,
        last_downloaded_at: datetime | None = None,
        download_count: int = 0,
    ):
        self.user_id = user_id
        self.attachment_id = attachment_id
        self.first_downloaded_at = ensure_utc_aware(first_downloaded_at)
        self.last_downloaded_at = ensure_utc_aware(last_downloaded_at)
        self.download_count = download_count

    @classmethod
    def from_row(cls, row: Any) -> "UserAttachmentDownload":
        """Create from Cassandra row."""
        return cls(
            user_id=row.user_id,
            attachment_id=row.attachment_id,
            first_downloaded_at=row.first_downloaded_at,
            last_downloaded_at=row.last_downloaded_at,
            download_count=row.download_count or 0,
        )

    @property
    def has_downloaded(self) -> bool:
        """Check if user has ever downloaded this attachment."""
        return self.download_count > 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "user_id": self.user_id,
            "attachment_id": self.attachment_id,
            "first_downloaded_at": self.first_downloaded_at,
            "last_downloaded_at": self.last_downloaded_at,
            "download_count": self.download_count,
            "has_downloaded": self.has_downloaded,
        }

    def __repr__(self) -> str:
        return f"<UserAttachmentDownload user={self.user_id} attachment={self.attachment_id}>"
