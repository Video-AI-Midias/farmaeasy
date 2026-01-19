"""Database models for course management.

Cassandra table definitions for:
- Courses: Main course table
- Modules: Standalone reusable modules
- Lessons: Standalone reusable lessons
- Junction tables: course_modules, module_lessons
- Lookup tables: For reverse queries and filtering

Architecture: Many-to-Many relationships via junction tables
allowing modules and lessons to be reused across different courses/modules.
"""

import re
import unicodedata
from datetime import UTC, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class ContentStatus(str, Enum):
    """Content publication status."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ContentType(str, Enum):
    """Lesson content type."""

    VIDEO = "video"
    TEXT = "text"
    QUIZ = "quiz"
    PDF = "pdf"
    EMBED = "embed"  # External embed (iframe) - e.g., Gamma, Canva, Google Slides


# Allowed domains for EMBED content type (security whitelist)
ALLOWED_EMBED_DOMAINS = [
    "gamma.app",
    "canva.com",
    "docs.google.com",
    "slides.google.com",
    "drive.google.com",
    "figma.com",
    "miro.com",
    "notion.so",
    "prezi.com",
    "slideshare.net",
    "youtube.com",
    "youtube-nocookie.com",
    "vimeo.com",
    "loom.com",
    "genially.com",
    "padlet.com",
    "mentimeter.com",
    "kahoot.it",
    "typeform.com",
    "jotform.com",
]


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

# Main Tables
COURSE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.courses (
    id UUID PRIMARY KEY,
    title TEXT,
    slug TEXT,
    description TEXT,
    thumbnail_url TEXT,
    status TEXT,
    creator_id UUID,
    price DECIMAL,
    is_free BOOLEAN,
    requires_enrollment BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

# Migration: Add pricing columns to existing courses table
COURSE_ADD_PRICE_COLUMNS_CQL = """
ALTER TABLE {keyspace}.courses ADD price DECIMAL
"""

COURSE_ADD_IS_FREE_COLUMN_CQL = """
ALTER TABLE {keyspace}.courses ADD is_free BOOLEAN
"""

COURSE_ADD_REQUIRES_ENROLLMENT_COLUMN_CQL = """
ALTER TABLE {keyspace}.courses ADD requires_enrollment BOOLEAN
"""

COURSE_SLUG_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS courses_slug_idx ON {keyspace}.courses (slug)
"""

MODULE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.modules (
    id UUID PRIMARY KEY,
    title TEXT,
    slug TEXT,
    description TEXT,
    thumbnail_url TEXT,
    status TEXT,
    creator_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

MODULE_SLUG_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS modules_slug_idx ON {keyspace}.modules (slug)
"""

LESSON_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.lessons (
    id UUID PRIMARY KEY,
    title TEXT,
    slug TEXT,
    description TEXT,
    content_type TEXT,
    content_url TEXT,
    duration_seconds INT,
    status TEXT,
    creator_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

LESSON_SLUG_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS lessons_slug_idx ON {keyspace}.lessons (slug)
"""

# Junction Tables (Many-to-Many)
COURSE_MODULES_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.course_modules (
    course_id UUID,
    module_id UUID,
    position INT,
    added_at TIMESTAMP,
    added_by UUID,
    PRIMARY KEY (course_id, position, module_id)
) WITH CLUSTERING ORDER BY (position ASC, module_id ASC)
"""

MODULE_LESSONS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.module_lessons (
    module_id UUID,
    lesson_id UUID,
    position INT,
    added_at TIMESTAMP,
    added_by UUID,
    PRIMARY KEY (module_id, position, lesson_id)
) WITH CLUSTERING ORDER BY (position ASC, lesson_id ASC)
"""

# Reverse Lookup Tables
MODULES_BY_COURSE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.modules_by_course (
    course_id UUID,
    module_id UUID,
    position INT,
    PRIMARY KEY (course_id, module_id)
)
"""

LESSONS_BY_MODULE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.lessons_by_module (
    module_id UUID,
    lesson_id UUID,
    position INT,
    PRIMARY KEY (module_id, lesson_id)
)
"""

# Courses using a specific module (for cascade check)
COURSES_BY_MODULE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.courses_by_module (
    module_id UUID,
    course_id UUID,
    PRIMARY KEY (module_id, course_id)
)
"""

# Modules using a specific lesson (for cascade check)
MODULES_BY_LESSON_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.modules_by_lesson (
    lesson_id UUID,
    module_id UUID,
    PRIMARY KEY (lesson_id, module_id)
)
"""

# Filter Tables
COURSES_BY_STATUS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.courses_by_status (
    status TEXT,
    created_at TIMESTAMP,
    course_id UUID,
    title TEXT,
    slug TEXT,
    creator_id UUID,
    PRIMARY KEY (status, created_at, course_id)
) WITH CLUSTERING ORDER BY (created_at DESC, course_id ASC)
"""

COURSES_BY_CREATOR_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.courses_by_creator (
    creator_id UUID,
    created_at TIMESTAMP,
    course_id UUID,
    title TEXT,
    slug TEXT,
    status TEXT,
    PRIMARY KEY (creator_id, created_at, course_id)
) WITH CLUSTERING ORDER BY (created_at DESC, course_id ASC)
"""

# All CQL statements for table setup
COURSES_TABLES_CQL = [
    # Main tables
    COURSE_TABLE_CQL,
    COURSE_SLUG_INDEX_CQL,
    MODULE_TABLE_CQL,
    MODULE_SLUG_INDEX_CQL,
    LESSON_TABLE_CQL,
    LESSON_SLUG_INDEX_CQL,
    # Junction tables
    COURSE_MODULES_TABLE_CQL,
    MODULE_LESSONS_TABLE_CQL,
    # Reverse lookups
    MODULES_BY_COURSE_TABLE_CQL,
    LESSONS_BY_MODULE_TABLE_CQL,
    COURSES_BY_MODULE_TABLE_CQL,
    MODULES_BY_LESSON_TABLE_CQL,
    # Filter tables
    COURSES_BY_STATUS_TABLE_CQL,
    COURSES_BY_CREATOR_TABLE_CQL,
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


def generate_slug(title: str) -> str:
    """Generate URL-friendly slug from title."""
    # Normalize unicode characters
    slug = unicodedata.normalize("NFKD", title)
    slug = slug.encode("ascii", "ignore").decode("ascii")
    # Convert to lowercase and replace spaces with hyphens
    slug = slug.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    return re.sub(r"[-\s]+", "-", slug)


# ==============================================================================
# Entity Classes
# ==============================================================================


class Course:
    """Course entity representing a collection of modules.

    Attributes:
        id: Unique identifier (UUID)
        title: Course title
        slug: URL-friendly identifier
        description: Course description
        thumbnail_url: Cover image URL
        status: Publication status (draft, published, archived)
        creator_id: User who created the course
        price: Course price in BRL (None = free)
        is_free: Whether course is free (default: True)
        requires_enrollment: Whether enrollment is required (default: True)
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """

    def __init__(
        self,
        id: UUID | None = None,
        title: str = "",
        slug: str | None = None,
        description: str | None = None,
        thumbnail_url: str | None = None,
        status: str = ContentStatus.DRAFT.value,
        creator_id: UUID | None = None,
        price: Decimal | None = None,
        is_free: bool = True,
        requires_enrollment: bool = True,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ):
        self.id = id or uuid4()
        self.title = title.strip()
        self.slug = slug or generate_slug(title)
        self.description = description
        self.thumbnail_url = thumbnail_url
        self.status = status
        self.creator_id = creator_id
        self.price = price
        self.is_free = is_free if is_free is not None else (price is None or price == 0)
        self.requires_enrollment = (
            requires_enrollment if requires_enrollment is not None else True
        )
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.updated_at = ensure_utc_aware(updated_at)

    @classmethod
    def from_row(cls, row: Any) -> "Course":
        """Create Course instance from Cassandra row."""
        # Handle None values for new columns (backward compatibility)
        price = getattr(row, "price", None)
        is_free = getattr(row, "is_free", None)
        requires_enrollment = getattr(row, "requires_enrollment", None)

        return cls(
            id=row.id,
            title=row.title,
            slug=row.slug,
            description=row.description,
            thumbnail_url=row.thumbnail_url,
            status=row.status,
            creator_id=row.creator_id,
            price=price,
            is_free=is_free if is_free is not None else True,
            requires_enrollment=requires_enrollment
            if requires_enrollment is not None
            else True,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "description": self.description,
            "thumbnail_url": self.thumbnail_url,
            "status": self.status,
            "creator_id": self.creator_id,
            "price": self.price,
            "is_free": self.is_free,
            "requires_enrollment": self.requires_enrollment,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def __repr__(self) -> str:
        return f"<Course {self.title} ({self.status})>"


class Module:
    """Module entity representing a reusable collection of lessons.

    Modules are standalone entities that can be linked to multiple courses.

    Attributes:
        id: Unique identifier (UUID)
        title: Module title
        slug: URL-friendly identifier
        description: Module description
        thumbnail_url: Cover image URL
        status: Publication status
        creator_id: User who created the module
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """

    def __init__(
        self,
        id: UUID | None = None,
        title: str = "",
        slug: str | None = None,
        description: str | None = None,
        thumbnail_url: str | None = None,
        status: str = ContentStatus.DRAFT.value,
        creator_id: UUID | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ):
        self.id = id or uuid4()
        self.title = title.strip()
        self.slug = slug or generate_slug(title)
        self.description = description
        self.thumbnail_url = thumbnail_url
        self.status = status
        self.creator_id = creator_id
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.updated_at = ensure_utc_aware(updated_at)

    @classmethod
    def from_row(cls, row: Any) -> "Module":
        """Create Module instance from Cassandra row."""
        return cls(
            id=row.id,
            title=row.title,
            slug=row.slug,
            description=row.description,
            thumbnail_url=row.thumbnail_url,
            status=row.status,
            creator_id=row.creator_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "description": self.description,
            "thumbnail_url": self.thumbnail_url,
            "status": self.status,
            "creator_id": self.creator_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def __repr__(self) -> str:
        return f"<Module {self.title} ({self.status})>"


class Lesson:
    """Lesson entity representing individual learning content.

    Lessons are standalone entities that can be linked to multiple modules.

    Attributes:
        id: Unique identifier (UUID)
        title: Lesson title
        slug: URL-friendly identifier
        description: Lesson description
        content_type: Type of content (video, text, quiz, pdf)
        content_url: URL to the content
        duration_seconds: Duration for video/audio content
        status: Publication status
        creator_id: User who created the lesson
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """

    def __init__(
        self,
        id: UUID | None = None,
        title: str = "",
        slug: str | None = None,
        description: str | None = None,
        content_type: str = ContentType.VIDEO.value,
        content_url: str | None = None,
        duration_seconds: int | None = None,
        status: str = ContentStatus.DRAFT.value,
        creator_id: UUID | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ):
        self.id = id or uuid4()
        self.title = title.strip()
        self.slug = slug or generate_slug(title)
        self.description = description
        self.content_type = content_type
        self.content_url = content_url
        self.duration_seconds = duration_seconds
        self.status = status
        self.creator_id = creator_id
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.updated_at = ensure_utc_aware(updated_at)

    @classmethod
    def from_row(cls, row: Any) -> "Lesson":
        """Create Lesson instance from Cassandra row."""
        return cls(
            id=row.id,
            title=row.title,
            slug=row.slug,
            description=row.description,
            content_type=row.content_type,
            content_url=row.content_url,
            duration_seconds=row.duration_seconds,
            status=row.status,
            creator_id=row.creator_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @property
    def is_valid(self) -> bool:
        """Check if lesson has valid content based on content_type.

        Validation rules:
        - VIDEO: requires content_url
        - PDF: requires content_url
        - EMBED: requires content_url from allowed domains
        - TEXT: requires description
        - QUIZ: always valid (future implementation)
        """
        if self.content_type == ContentType.VIDEO.value:
            return bool(self.content_url)
        if self.content_type == ContentType.PDF.value:
            return bool(self.content_url)
        if self.content_type == ContentType.EMBED.value:
            return bool(self.content_url) and self._is_allowed_embed_url()
        if self.content_type == ContentType.TEXT.value:
            return bool(self.description)
        # QUIZ and others: always valid for now
        return True

    def _is_allowed_embed_url(self) -> bool:
        """Check if embed URL is from an allowed domain."""
        if not self.content_url:
            return False
        from urllib.parse import urlparse

        try:
            parsed = urlparse(self.content_url)
            domain = parsed.netloc.lower()
            # Remove www. prefix if present
            domain = domain.removeprefix("www.")
            # Check if domain matches any allowed domain
            return any(
                domain == allowed or domain.endswith(f".{allowed}")
                for allowed in ALLOWED_EMBED_DOMAINS
            )
        except Exception:
            return False

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "description": self.description,
            "content_type": self.content_type,
            "content_url": self.content_url,
            "duration_seconds": self.duration_seconds,
            "status": self.status,
            "creator_id": self.creator_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_valid": self.is_valid,
        }

    def __repr__(self) -> str:
        return f"<Lesson {self.title} ({self.content_type})>"


class CourseModule:
    """Junction entity linking courses to modules.

    Tracks position for ordering and audit trail.

    Attributes:
        course_id: Course UUID
        module_id: Module UUID
        position: Order position within the course
        added_at: When the link was created
        added_by: User who created the link
    """

    def __init__(
        self,
        course_id: UUID,
        module_id: UUID,
        position: int,
        added_at: datetime | None = None,
        added_by: UUID | None = None,
    ):
        self.course_id = course_id
        self.module_id = module_id
        self.position = position
        self.added_at = ensure_utc_aware(added_at) or datetime.now(UTC)
        self.added_by = added_by

    @classmethod
    def from_row(cls, row: Any) -> "CourseModule":
        """Create CourseModule instance from Cassandra row."""
        return cls(
            course_id=row.course_id,
            module_id=row.module_id,
            position=row.position,
            added_at=row.added_at,
            added_by=row.added_by,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "course_id": self.course_id,
            "module_id": self.module_id,
            "position": self.position,
            "added_at": self.added_at,
            "added_by": self.added_by,
        }

    def __repr__(self) -> str:
        return f"<CourseModule course={self.course_id} module={self.module_id} pos={self.position}>"


class ModuleLesson:
    """Junction entity linking modules to lessons.

    Tracks position for ordering and audit trail.

    Attributes:
        module_id: Module UUID
        lesson_id: Lesson UUID
        position: Order position within the module
        added_at: When the link was created
        added_by: User who created the link
    """

    def __init__(
        self,
        module_id: UUID,
        lesson_id: UUID,
        position: int,
        added_at: datetime | None = None,
        added_by: UUID | None = None,
    ):
        self.module_id = module_id
        self.lesson_id = lesson_id
        self.position = position
        self.added_at = ensure_utc_aware(added_at) or datetime.now(UTC)
        self.added_by = added_by

    @classmethod
    def from_row(cls, row: Any) -> "ModuleLesson":
        """Create ModuleLesson instance from Cassandra row."""
        return cls(
            module_id=row.module_id,
            lesson_id=row.lesson_id,
            position=row.position,
            added_at=row.added_at,
            added_by=row.added_by,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "module_id": self.module_id,
            "lesson_id": self.lesson_id,
            "position": self.position,
            "added_at": self.added_at,
            "added_by": self.added_by,
        }

    def __repr__(self) -> str:
        return f"<ModuleLesson module={self.module_id} lesson={self.lesson_id} pos={self.position}>"
