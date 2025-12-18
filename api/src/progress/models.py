"""Database models for student progress tracking.

Cassandra table definitions for:
- Lesson progress: Video position, completion status per user
- Module progress: Aggregated progress per module
- Enrollments: Course enrollment with overall progress
- Lookup tables: For user-based queries

Architecture: Dual-write pattern for efficient queries by both
course_id and user_id perspectives.
"""

from datetime import UTC, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID


class EnrollmentStatus(str, Enum):
    """Course enrollment status."""

    ENROLLED = "enrolled"  # Inscrito, ainda nao iniciou
    IN_PROGRESS = "in_progress"  # Cursando
    COMPLETED = "completed"  # Concluiu todas as aulas
    PAUSED = "paused"  # Pausou o curso


class LessonProgressStatus(str, Enum):
    """Lesson progress status."""

    NOT_STARTED = "not_started"  # Nunca acessou
    IN_PROGRESS = "in_progress"  # Assistiu parcialmente
    COMPLETED = "completed"  # Concluiu (>=90% ou marcado manual)


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
# CQL Table Definitions
# ==============================================================================

# Progresso de aula por usuario
# Partition key: (user_id, course_id) para buscar progresso completo do curso
# Clustering: module_id, lesson_id para ordenacao hierarquica
LESSON_PROGRESS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.lesson_progress (
    user_id UUID,
    course_id UUID,
    module_id UUID,
    lesson_id UUID,
    status TEXT,
    progress_percent DECIMAL,
    last_position_seconds INT,
    duration_seconds INT,
    duration_watched_seconds INT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_accessed_at TIMESTAMP,
    PRIMARY KEY ((user_id, course_id), module_id, lesson_id)
) WITH CLUSTERING ORDER BY (module_id ASC, lesson_id ASC)
"""

# Progresso de modulo (cache desnormalizado para performance)
# Calcula aggregates: aulas completadas, porcentagem do modulo
MODULE_PROGRESS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.module_progress (
    user_id UUID,
    course_id UUID,
    module_id UUID,
    status TEXT,
    progress_percent DECIMAL,
    lessons_completed INT,
    lessons_total INT,
    last_accessed_at TIMESTAMP,
    PRIMARY KEY ((user_id, course_id), module_id)
)
"""

# Inscricoes em cursos - particionado por course_id
# Para queries: "quantos alunos tem neste curso?"
ENROLLMENTS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.enrollments (
    course_id UUID,
    user_id UUID,
    status TEXT,
    enrolled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    progress_percent DECIMAL,
    lessons_completed INT,
    lessons_total INT,
    last_accessed_at TIMESTAMP,
    last_lesson_id UUID,
    last_module_id UUID,
    PRIMARY KEY (course_id, user_id)
)
"""

# Lookup: cursos por usuario - particionado por user_id
# Para queries: "quais cursos o usuario esta inscrito?"
ENROLLMENTS_BY_USER_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.enrollments_by_user (
    user_id UUID,
    enrolled_at TIMESTAMP,
    course_id UUID,
    status TEXT,
    progress_percent DECIMAL,
    lessons_completed INT,
    lessons_total INT,
    last_accessed_at TIMESTAMP,
    PRIMARY KEY (user_id, enrolled_at, course_id)
) WITH CLUSTERING ORDER BY (enrolled_at DESC, course_id ASC)
"""

# Index secundario para buscar por lesson_id (debug/admin)
LESSON_PROGRESS_BY_LESSON_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS lesson_progress_lesson_idx
ON {keyspace}.lesson_progress (lesson_id)
"""

# All CQL statements for table setup
PROGRESS_TABLES_CQL = [
    LESSON_PROGRESS_TABLE_CQL,
    MODULE_PROGRESS_TABLE_CQL,
    ENROLLMENTS_TABLE_CQL,
    ENROLLMENTS_BY_USER_TABLE_CQL,
    LESSON_PROGRESS_BY_LESSON_INDEX_CQL,
]


# ==============================================================================
# Entity Classes
# ==============================================================================


class LessonProgress:
    """Lesson progress entity for a specific user.

    Tracks video position, watch time, and completion status.

    Attributes:
        user_id: User UUID
        course_id: Course UUID (for partition key)
        module_id: Module UUID
        lesson_id: Lesson UUID
        status: Progress status (not_started, in_progress, completed)
        progress_percent: Percentage watched (0-100)
        last_position_seconds: Last video position for resume
        duration_seconds: Total lesson duration
        duration_watched_seconds: Total time watched (may exceed duration)
        started_at: First access timestamp
        completed_at: Completion timestamp (null if not completed)
        last_accessed_at: Last access timestamp
    """

    def __init__(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
        status: str = LessonProgressStatus.NOT_STARTED.value,
        progress_percent: Decimal = Decimal(0),
        last_position_seconds: int = 0,
        duration_seconds: int | None = None,
        duration_watched_seconds: int = 0,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        last_accessed_at: datetime | None = None,
    ):
        self.user_id = user_id
        self.course_id = course_id
        self.module_id = module_id
        self.lesson_id = lesson_id
        self.status = status
        self.progress_percent = progress_percent
        self.last_position_seconds = last_position_seconds
        self.duration_seconds = duration_seconds
        self.duration_watched_seconds = duration_watched_seconds
        self.started_at = ensure_utc_aware(started_at)
        self.completed_at = ensure_utc_aware(completed_at)
        self.last_accessed_at = ensure_utc_aware(last_accessed_at) or datetime.now(UTC)

    @property
    def is_completed(self) -> bool:
        """Check if lesson is completed."""
        return self.status == LessonProgressStatus.COMPLETED.value

    @classmethod
    def from_row(cls, row: Any) -> "LessonProgress":
        """Create LessonProgress instance from Cassandra row."""
        return cls(
            user_id=row.user_id,
            course_id=row.course_id,
            module_id=row.module_id,
            lesson_id=row.lesson_id,
            status=row.status or LessonProgressStatus.NOT_STARTED.value,
            progress_percent=row.progress_percent or Decimal(0),
            last_position_seconds=row.last_position_seconds or 0,
            duration_seconds=row.duration_seconds,
            duration_watched_seconds=row.duration_watched_seconds or 0,
            started_at=row.started_at,
            completed_at=row.completed_at,
            last_accessed_at=row.last_accessed_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "user_id": self.user_id,
            "course_id": self.course_id,
            "module_id": self.module_id,
            "lesson_id": self.lesson_id,
            "status": self.status,
            "progress_percent": self.progress_percent,
            "last_position_seconds": self.last_position_seconds,
            "duration_seconds": self.duration_seconds,
            "duration_watched_seconds": self.duration_watched_seconds,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "last_accessed_at": self.last_accessed_at,
        }

    def __repr__(self) -> str:
        return (
            f"<LessonProgress user={self.user_id} lesson={self.lesson_id} "
            f"{self.status} {self.progress_percent}%>"
        )


class ModuleProgress:
    """Module progress entity (aggregated from lessons).

    Denormalized cache for efficient module-level queries.

    Attributes:
        user_id: User UUID
        course_id: Course UUID
        module_id: Module UUID
        status: Overall module status
        progress_percent: Percentage of module completed
        lessons_completed: Number of completed lessons
        lessons_total: Total lessons in module
        last_accessed_at: Last access timestamp
    """

    def __init__(
        self,
        user_id: UUID,
        course_id: UUID,
        module_id: UUID,
        status: str = LessonProgressStatus.NOT_STARTED.value,
        progress_percent: Decimal = Decimal(0),
        lessons_completed: int = 0,
        lessons_total: int = 0,
        last_accessed_at: datetime | None = None,
    ):
        self.user_id = user_id
        self.course_id = course_id
        self.module_id = module_id
        self.status = status
        self.progress_percent = progress_percent
        self.lessons_completed = lessons_completed
        self.lessons_total = lessons_total
        self.last_accessed_at = ensure_utc_aware(last_accessed_at) or datetime.now(UTC)

    @property
    def is_completed(self) -> bool:
        """Check if module is completed."""
        return self.status == LessonProgressStatus.COMPLETED.value

    @classmethod
    def from_row(cls, row: Any) -> "ModuleProgress":
        """Create ModuleProgress instance from Cassandra row."""
        return cls(
            user_id=row.user_id,
            course_id=row.course_id,
            module_id=row.module_id,
            status=row.status or LessonProgressStatus.NOT_STARTED.value,
            progress_percent=row.progress_percent or Decimal(0),
            lessons_completed=row.lessons_completed or 0,
            lessons_total=row.lessons_total or 0,
            last_accessed_at=row.last_accessed_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "user_id": self.user_id,
            "course_id": self.course_id,
            "module_id": self.module_id,
            "status": self.status,
            "progress_percent": self.progress_percent,
            "lessons_completed": self.lessons_completed,
            "lessons_total": self.lessons_total,
            "last_accessed_at": self.last_accessed_at,
        }

    def __repr__(self) -> str:
        return (
            f"<ModuleProgress user={self.user_id} module={self.module_id} "
            f"{self.lessons_completed}/{self.lessons_total}>"
        )


class Enrollment:
    """Course enrollment entity.

    Tracks user enrollment status and overall course progress.

    Attributes:
        course_id: Course UUID
        user_id: User UUID
        status: Enrollment status (enrolled, in_progress, completed, paused)
        enrolled_at: Enrollment timestamp
        started_at: First lesson access timestamp
        completed_at: Course completion timestamp
        progress_percent: Overall course progress (0-100)
        lessons_completed: Number of completed lessons
        lessons_total: Total lessons in course
        last_accessed_at: Last access timestamp
        last_lesson_id: Last accessed lesson UUID (for resume)
        last_module_id: Last accessed module UUID (for resume)
    """

    def __init__(
        self,
        course_id: UUID,
        user_id: UUID,
        status: str = EnrollmentStatus.ENROLLED.value,
        enrolled_at: datetime | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        progress_percent: Decimal = Decimal(0),
        lessons_completed: int = 0,
        lessons_total: int = 0,
        last_accessed_at: datetime | None = None,
        last_lesson_id: UUID | None = None,
        last_module_id: UUID | None = None,
    ):
        self.course_id = course_id
        self.user_id = user_id
        self.status = status
        self.enrolled_at = ensure_utc_aware(enrolled_at) or datetime.now(UTC)
        self.started_at = ensure_utc_aware(started_at)
        self.completed_at = ensure_utc_aware(completed_at)
        self.progress_percent = progress_percent
        self.lessons_completed = lessons_completed
        self.lessons_total = lessons_total
        self.last_accessed_at = ensure_utc_aware(last_accessed_at)
        self.last_lesson_id = last_lesson_id
        self.last_module_id = last_module_id

    @property
    def is_completed(self) -> bool:
        """Check if course is completed."""
        return self.status == EnrollmentStatus.COMPLETED.value

    @classmethod
    def from_row(cls, row: Any) -> "Enrollment":
        """Create Enrollment instance from Cassandra row."""
        return cls(
            course_id=row.course_id,
            user_id=row.user_id,
            status=row.status or EnrollmentStatus.ENROLLED.value,
            enrolled_at=row.enrolled_at,
            started_at=row.started_at,
            completed_at=row.completed_at,
            progress_percent=row.progress_percent or Decimal(0),
            lessons_completed=row.lessons_completed or 0,
            lessons_total=row.lessons_total or 0,
            last_accessed_at=row.last_accessed_at,
            last_lesson_id=row.last_lesson_id,
            last_module_id=row.last_module_id,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "course_id": self.course_id,
            "user_id": self.user_id,
            "status": self.status,
            "enrolled_at": self.enrolled_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "progress_percent": self.progress_percent,
            "lessons_completed": self.lessons_completed,
            "lessons_total": self.lessons_total,
            "last_accessed_at": self.last_accessed_at,
            "last_lesson_id": self.last_lesson_id,
            "last_module_id": self.last_module_id,
        }

    def __repr__(self) -> str:
        return (
            f"<Enrollment user={self.user_id} course={self.course_id} "
            f"{self.status} {self.progress_percent}%>"
        )
