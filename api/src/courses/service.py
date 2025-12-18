"""Course management service layer.

Business logic for:
- Course CRUD and module linking
- Module CRUD and lesson linking
- Lesson CRUD operations
- Reordering and cascade operations
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from src.courses.models import (
    ContentStatus,
    ContentType,
    Course,
    CourseModule,
    Lesson,
    Module,
    ModuleLesson,
    generate_slug,
)
from src.courses.schemas import (
    CourseResponse,
    CreateCourseRequest,
    CreateLessonRequest,
    CreateModuleRequest,
    LessonResponse,
    ModuleResponse,
    UpdateCourseRequest,
    UpdateLessonRequest,
    UpdateModuleRequest,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class CourseError(Exception):
    """Base course error."""

    def __init__(self, message: str, code: str = "course_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class CourseNotFoundError(CourseError):
    """Course not found."""

    def __init__(self, message: str = "Curso nao encontrado"):
        super().__init__(message, "course_not_found")


class ModuleNotFoundError(CourseError):
    """Module not found."""

    def __init__(self, message: str = "Modulo nao encontrado"):
        super().__init__(message, "module_not_found")


class LessonNotFoundError(CourseError):
    """Lesson not found."""

    def __init__(self, message: str = "Aula nao encontrada"):
        super().__init__(message, "lesson_not_found")


class SlugExistsError(CourseError):
    """Slug already exists."""

    def __init__(self, message: str = "Slug ja existe"):
        super().__init__(message, "slug_exists")


class ModuleInUseError(CourseError):
    """Module is in use by courses."""

    def __init__(self, message: str = "Modulo esta em uso"):
        super().__init__(message, "module_in_use")


class LessonInUseError(CourseError):
    """Lesson is in use by modules."""

    def __init__(self, message: str = "Aula esta em uso"):
        super().__init__(message, "lesson_in_use")


class AlreadyLinkedError(CourseError):
    """Item already linked."""

    def __init__(self, message: str = "Item ja vinculado"):
        super().__init__(message, "already_linked")


class NotLinkedError(CourseError):
    """Item not linked."""

    def __init__(self, message: str = "Item nao vinculado"):
        super().__init__(message, "not_linked")


class InvalidContentError(CourseError):
    """Content is invalid for the content type."""

    def __init__(self, message: str = "Conteudo invalido para o tipo de aula"):
        super().__init__(message, "invalid_content")


# ==============================================================================
# Lesson Service
# ==============================================================================


class LessonService:
    """Service for lesson management."""

    def __init__(self, session: "Session", keyspace: str):
        """Initialize with Cassandra session."""
        self.session = session
        self.keyspace = keyspace
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements."""
        # Lesson CRUD
        self._get_lesson_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.lessons WHERE id = ?"
        )
        self._get_lesson_by_slug = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.lessons WHERE slug = ?"
        )
        self._insert_lesson = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.lessons
            (id, title, slug, description, content_type, content_url,
             duration_seconds, status, creator_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._update_lesson = self.session.prepare(f"""
            UPDATE {self.keyspace}.lessons
            SET title = ?, slug = ?, description = ?, content_type = ?,
                content_url = ?, duration_seconds = ?, status = ?, updated_at = ?
            WHERE id = ?
        """)
        self._delete_lesson = self.session.prepare(
            f"DELETE FROM {self.keyspace}.lessons WHERE id = ?"
        )

        # Usage queries
        self._get_modules_by_lesson = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.modules_by_lesson WHERE lesson_id = ?"
        )

    def create_lesson(self, data: CreateLessonRequest, creator_id: UUID) -> Lesson:
        """Create a new lesson."""
        slug = generate_slug(data.title)

        # Check slug uniqueness
        existing = self.get_lesson_by_slug(slug)
        if existing:
            # Append UUID suffix if slug exists
            slug = f"{slug}-{str(creator_id)[:8]}"

        lesson = Lesson(
            title=data.title,
            slug=slug,
            description=data.description,
            content_type=data.content_type.value,
            content_url=data.content_url,
            duration_seconds=data.duration_seconds,
            status=ContentStatus.DRAFT.value,
            creator_id=creator_id,
        )

        self.session.execute(
            self._insert_lesson,
            [
                lesson.id,
                lesson.title,
                lesson.slug,
                lesson.description,
                lesson.content_type,
                lesson.content_url,
                lesson.duration_seconds,
                lesson.status,
                lesson.creator_id,
                lesson.created_at,
                lesson.updated_at,
            ],
        )

        return lesson

    def get_lesson(self, lesson_id: UUID) -> Lesson | None:
        """Get lesson by ID."""
        rows = self.session.execute(self._get_lesson_by_id, [lesson_id])
        row = rows.one()
        return Lesson.from_row(row) if row else None

    def get_lesson_by_slug(self, slug: str) -> Lesson | None:
        """Get lesson by slug."""
        rows = self.session.execute(self._get_lesson_by_slug, [slug])
        row = rows.one()
        return Lesson.from_row(row) if row else None

    def update_lesson(self, lesson_id: UUID, data: UpdateLessonRequest) -> Lesson:
        """Update lesson.

        Raises:
            LessonNotFoundError: If lesson doesn't exist
            InvalidContentError: If trying to publish an invalid lesson
        """
        lesson = self.get_lesson(lesson_id)
        if not lesson:
            raise LessonNotFoundError

        # Update fields if provided
        if data.title is not None:
            lesson.title = data.title.strip()
            lesson.slug = generate_slug(data.title)
        if data.description is not None:
            lesson.description = data.description
        if data.content_type is not None:
            lesson.content_type = data.content_type.value
        if data.content_url is not None:
            lesson.content_url = data.content_url
        if data.duration_seconds is not None:
            lesson.duration_seconds = data.duration_seconds
        if data.status is not None:
            # Validate content before publishing
            if data.status == ContentStatus.PUBLISHED and not lesson.is_valid:
                content_type = ContentType(lesson.content_type)
                if content_type == ContentType.VIDEO:
                    raise InvalidContentError(
                        "Nao e possivel publicar: URL do video e obrigatoria"
                    )
                if content_type == ContentType.PDF:
                    raise InvalidContentError(
                        "Nao e possivel publicar: URL do PDF e obrigatoria"
                    )
                if content_type == ContentType.TEXT:
                    raise InvalidContentError(
                        "Nao e possivel publicar: Descricao/conteudo e obrigatorio"
                    )
                raise InvalidContentError
            lesson.status = data.status.value

        lesson.updated_at = datetime.now(UTC)

        self.session.execute(
            self._update_lesson,
            [
                lesson.title,
                lesson.slug,
                lesson.description,
                lesson.content_type,
                lesson.content_url,
                lesson.duration_seconds,
                lesson.status,
                lesson.updated_at,
                lesson.id,
            ],
        )

        return lesson

    def delete_lesson(self, lesson_id: UUID, force: bool = False) -> int:
        """Delete lesson.

        Args:
            lesson_id: ID of the lesson to delete
            force: If True, unlink from all modules before deleting

        Returns:
            Number of modules the lesson was unlinked from (0 if not in use)

        Raises:
            LessonNotFoundError: If lesson doesn't exist
            LessonInUseError: If lesson is in use and force=False
        """
        lesson = self.get_lesson(lesson_id)
        if not lesson:
            raise LessonNotFoundError

        # Check if lesson is used by any module
        rows = self.session.execute(self._get_modules_by_lesson, [lesson_id])
        usages = list(rows)

        if usages and not force:
            raise LessonInUseError(f"Aula usada em {len(usages)} modulo(s)")

        # Force delete: unlink from all modules first
        unlinked_count = 0
        if usages:
            for usage in usages:
                module_id = usage.module_id
                # Delete from module_lessons
                self.session.execute(
                    f"DELETE FROM {self.keyspace}.module_lessons WHERE module_id = ? AND position = ? AND lesson_id = ?",
                    [module_id, usage.position, lesson_id],
                )
                # Delete from modules_by_lesson
                self.session.execute(
                    self._delete_modules_by_lesson, [lesson_id, module_id]
                )
                unlinked_count += 1

        self.session.execute(self._delete_lesson, [lesson_id])
        return unlinked_count

    def list_lessons(
        self,
        status: ContentStatus | None = None,
        content_type: ContentType | None = None,
        limit: int = 50,
    ) -> list[Lesson]:
        """List lessons with optional filters.

        Note: Full table scan, use with caution in production.
        Consider adding filter tables for performance.
        """
        # Simple approach - scan all and filter in memory
        cql = f"SELECT * FROM {self.keyspace}.lessons LIMIT {limit * 2}"
        rows = self.session.execute(cql)

        lessons = []
        for row in rows:
            lesson = Lesson.from_row(row)
            if status and lesson.status != status.value:
                continue
            if content_type and lesson.content_type != content_type.value:
                continue
            lessons.append(lesson)
            if len(lessons) >= limit:
                break

        return lessons

    def get_modules_using_lesson(self, lesson_id: UUID) -> list[Module]:
        """Get all modules that use this lesson."""
        rows = self.session.execute(self._get_modules_by_lesson, [lesson_id])
        module_ids = [row.module_id for row in rows]

        modules = []
        for mid in module_ids:
            # Need to get module details from modules table
            cql = f"SELECT * FROM {self.keyspace}.modules WHERE id = ?"
            mod_rows = self.session.execute(cql, [mid])
            mod_row = mod_rows.one()
            if mod_row:
                modules.append(Module.from_row(mod_row))

        return modules

    def to_response(self, lesson: Lesson) -> LessonResponse:
        """Convert Lesson to response schema."""
        return LessonResponse(
            id=lesson.id,
            title=lesson.title,
            slug=lesson.slug,
            description=lesson.description,
            content_type=ContentType(lesson.content_type),
            content_url=lesson.content_url,
            duration_seconds=lesson.duration_seconds,
            status=ContentStatus(lesson.status),
            creator_id=lesson.creator_id,
            created_at=lesson.created_at,
            updated_at=lesson.updated_at,
            is_valid=lesson.is_valid,
        )


# ==============================================================================
# Module Service
# ==============================================================================


class ModuleService:
    """Service for module management."""

    def __init__(self, session: "Session", keyspace: str):
        """Initialize with Cassandra session."""
        self.session = session
        self.keyspace = keyspace
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements."""
        # Module CRUD
        self._get_module_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.modules WHERE id = ?"
        )
        self._get_module_by_slug = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.modules WHERE slug = ?"
        )
        self._insert_module = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.modules
            (id, title, slug, description, thumbnail_url, status, creator_id,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._update_module = self.session.prepare(f"""
            UPDATE {self.keyspace}.modules
            SET title = ?, slug = ?, description = ?, thumbnail_url = ?,
                status = ?, updated_at = ?
            WHERE id = ?
        """)
        self._delete_module = self.session.prepare(
            f"DELETE FROM {self.keyspace}.modules WHERE id = ?"
        )

        # Module-Lesson linking
        self._get_module_lessons = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.module_lessons WHERE module_id = ?"
        )
        self._get_lesson_in_module = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.lessons_by_module WHERE module_id = ? AND lesson_id = ?"
        )
        self._insert_module_lesson = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.module_lessons
            (module_id, lesson_id, position, added_at, added_by)
            VALUES (?, ?, ?, ?, ?)
        """)
        self._insert_lessons_by_module = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.lessons_by_module
            (module_id, lesson_id, position)
            VALUES (?, ?, ?)
        """)
        self._insert_modules_by_lesson = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.modules_by_lesson
            (lesson_id, module_id)
            VALUES (?, ?)
        """)
        self._delete_module_lesson = self.session.prepare(
            f"DELETE FROM {self.keyspace}.module_lessons WHERE module_id = ? AND position = ? AND lesson_id = ?"
        )
        self._delete_lessons_by_module = self.session.prepare(
            f"DELETE FROM {self.keyspace}.lessons_by_module WHERE module_id = ? AND lesson_id = ?"
        )
        self._delete_modules_by_lesson = self.session.prepare(
            f"DELETE FROM {self.keyspace}.modules_by_lesson WHERE lesson_id = ? AND module_id = ?"
        )
        self._delete_all_module_lessons = self.session.prepare(
            f"DELETE FROM {self.keyspace}.module_lessons WHERE module_id = ?"
        )

        # Lesson lookup (for module-lesson queries)
        self._get_lesson_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.lessons WHERE id = ?"
        )

        # Usage queries
        self._get_courses_by_module = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.courses_by_module WHERE module_id = ?"
        )

    def create_module(self, data: CreateModuleRequest, creator_id: UUID) -> Module:
        """Create a new module."""
        slug = generate_slug(data.title)

        # Check slug uniqueness
        existing = self.get_module_by_slug(slug)
        if existing:
            slug = f"{slug}-{str(creator_id)[:8]}"

        module = Module(
            title=data.title,
            slug=slug,
            description=data.description,
            thumbnail_url=data.thumbnail_url,
            status=ContentStatus.DRAFT.value,
            creator_id=creator_id,
        )

        self.session.execute(
            self._insert_module,
            [
                module.id,
                module.title,
                module.slug,
                module.description,
                module.thumbnail_url,
                module.status,
                module.creator_id,
                module.created_at,
                module.updated_at,
            ],
        )

        return module

    def get_module(self, module_id: UUID) -> Module | None:
        """Get module by ID."""
        rows = self.session.execute(self._get_module_by_id, [module_id])
        row = rows.one()
        return Module.from_row(row) if row else None

    def get_module_by_slug(self, slug: str) -> Module | None:
        """Get module by slug."""
        rows = self.session.execute(self._get_module_by_slug, [slug])
        row = rows.one()
        return Module.from_row(row) if row else None

    def update_module(self, module_id: UUID, data: UpdateModuleRequest) -> Module:
        """Update module."""
        module = self.get_module(module_id)
        if not module:
            raise ModuleNotFoundError

        if data.title is not None:
            module.title = data.title.strip()
            module.slug = generate_slug(data.title)
        if data.description is not None:
            module.description = data.description
        if data.thumbnail_url is not None:
            module.thumbnail_url = data.thumbnail_url
        if data.status is not None:
            module.status = data.status.value

        module.updated_at = datetime.now(UTC)

        self.session.execute(
            self._update_module,
            [
                module.title,
                module.slug,
                module.description,
                module.thumbnail_url,
                module.status,
                module.updated_at,
                module.id,
            ],
        )

        return module

    def delete_module(self, module_id: UUID, force: bool = False) -> int:
        """Delete module.

        Args:
            module_id: ID of the module to delete
            force: If True, unlink from all courses before deleting

        Returns:
            Number of courses the module was unlinked from (0 if not in use)

        Raises:
            ModuleNotFoundError: If module doesn't exist
            ModuleInUseError: If module is in use and force=False
        """
        module = self.get_module(module_id)
        if not module:
            raise ModuleNotFoundError

        # Check if module is used by any course
        rows = self.session.execute(self._get_courses_by_module, [module_id])
        usages = list(rows)

        if usages and not force:
            raise ModuleInUseError(f"Modulo usado em {len(usages)} curso(s)")

        # Force delete: unlink from all courses first
        unlinked_count = 0
        if usages:
            for usage in usages:
                course_id = usage.course_id
                # Delete from course_modules
                self.session.execute(
                    f"DELETE FROM {self.keyspace}.course_modules WHERE course_id = ? AND position = ? AND module_id = ?",
                    [course_id, usage.position, module_id],
                )
                # Delete from modules_by_course
                self.session.execute(
                    self._delete_modules_by_course, [course_id, module_id]
                )
                # Delete from courses_by_module
                self.session.execute(
                    self._delete_courses_by_module, [module_id, course_id]
                )
                unlinked_count += 1

        # Delete all lesson links
        self.session.execute(self._delete_all_module_lessons, [module_id])

        # Also clean up modules_by_lesson for all lessons in this module
        lesson_links = self.session.execute(self._get_module_lessons, [module_id])
        for link in lesson_links:
            self.session.execute(
                self._delete_modules_by_lesson, [link.lesson_id, module_id]
            )

        # Delete module
        self.session.execute(self._delete_module, [module_id])
        return unlinked_count

    def list_modules(
        self,
        status: ContentStatus | None = None,
        limit: int = 50,
    ) -> list[Module]:
        """List modules with optional filters."""
        cql = f"SELECT * FROM {self.keyspace}.modules LIMIT {limit * 2}"
        rows = self.session.execute(cql)

        modules = []
        for row in rows:
            module = Module.from_row(row)
            if status and module.status != status.value:
                continue
            modules.append(module)
            if len(modules) >= limit:
                break

        return modules

    # --------------------------------------------------------------------------
    # Lesson Linking
    # --------------------------------------------------------------------------

    def link_lesson(
        self,
        module_id: UUID,
        lesson_id: UUID,
        position: int | None,
        user_id: UUID,
    ) -> ModuleLesson:
        """Link a lesson to a module."""
        # Verify module exists
        module = self.get_module(module_id)
        if not module:
            raise ModuleNotFoundError

        # Check if already linked
        rows = self.session.execute(self._get_lesson_in_module, [module_id, lesson_id])
        if rows.one():
            raise AlreadyLinkedError("Aula ja vinculada a este modulo")

        # Auto-calculate position if not provided
        if position is None:
            lessons = self.get_module_lessons(module_id)
            position = len(lessons)

        now = datetime.now(UTC)
        link = ModuleLesson(
            module_id=module_id,
            lesson_id=lesson_id,
            position=position,
            added_at=now,
            added_by=user_id,
        )

        # Dual-write pattern
        self.session.execute(
            self._insert_module_lesson,
            [module_id, lesson_id, position, now, user_id],
        )
        self.session.execute(
            self._insert_lessons_by_module,
            [module_id, lesson_id, position],
        )
        self.session.execute(
            self._insert_modules_by_lesson,
            [lesson_id, module_id],
        )

        return link

    def unlink_lesson(self, module_id: UUID, lesson_id: UUID) -> None:
        """Unlink a lesson from a module."""
        # Find the link to get position
        rows = self.session.execute(self._get_lesson_in_module, [module_id, lesson_id])
        row = rows.one()
        if not row:
            raise NotLinkedError("Aula nao vinculada a este modulo")

        position = row.position

        # Delete from all tables
        self.session.execute(
            self._delete_module_lesson, [module_id, position, lesson_id]
        )
        self.session.execute(self._delete_lessons_by_module, [module_id, lesson_id])
        self.session.execute(self._delete_modules_by_lesson, [lesson_id, module_id])

    def get_module_lessons(self, module_id: UUID) -> list[tuple[Lesson, int]]:
        """Get all lessons in a module with their positions."""
        rows = self.session.execute(self._get_module_lessons, [module_id])

        results = []
        for row in rows:
            link = ModuleLesson.from_row(row)
            # Get lesson details using prepared statement
            lesson_rows = self.session.execute(self._get_lesson_by_id, [link.lesson_id])
            lesson_row = lesson_rows.one()
            if lesson_row:
                lesson = Lesson.from_row(lesson_row)
                results.append((lesson, link.position))

        # Sort by position
        results.sort(key=lambda x: x[1])
        return results

    def reorder_lessons(
        self, module_id: UUID, lesson_ids: list[UUID], user_id: UUID
    ) -> None:
        """Reorder lessons in a module."""
        # Get current links
        current_lessons = self.get_module_lessons(module_id)
        current_ids = {lesson.id for lesson, _ in current_lessons}

        # Verify all IDs exist in current lessons
        if set(lesson_ids) != current_ids:
            msg = "Lista de IDs nao corresponde aos modulos atuais"
            raise CourseError(msg, "invalid_reorder")

        # Delete all current links
        self.session.execute(self._delete_all_module_lessons, [module_id])

        # Re-insert with new positions
        now = datetime.now(UTC)
        for position, lesson_id in enumerate(lesson_ids):
            self.session.execute(
                self._insert_module_lesson,
                [module_id, lesson_id, position, now, user_id],
            )
            self.session.execute(
                self._insert_lessons_by_module,
                [module_id, lesson_id, position],
            )

    def get_courses_using_module(self, module_id: UUID) -> list[Course]:
        """Get all courses that use this module."""
        rows = self.session.execute(self._get_courses_by_module, [module_id])
        course_ids = [row.course_id for row in rows]

        courses = []
        for cid in course_ids:
            cql = f"SELECT * FROM {self.keyspace}.courses WHERE id = ?"
            course_rows = self.session.execute(cql, [cid])
            course_row = course_rows.one()
            if course_row:
                courses.append(Course.from_row(course_row))

        return courses

    def get_lesson_count(self, module_id: UUID) -> int:
        """Get number of lessons in a module."""
        rows = self.session.execute(self._get_module_lessons, [module_id])
        return len(list(rows))

    def to_response(self, module: Module, lesson_count: int = 0) -> ModuleResponse:
        """Convert Module to response schema."""
        return ModuleResponse(
            id=module.id,
            title=module.title,
            slug=module.slug,
            description=module.description,
            thumbnail_url=module.thumbnail_url,
            status=ContentStatus(module.status),
            creator_id=module.creator_id,
            created_at=module.created_at,
            updated_at=module.updated_at,
            lesson_count=lesson_count,
        )


# ==============================================================================
# Course Service
# ==============================================================================


class CourseService:
    """Service for course management."""

    def __init__(self, session: "Session", keyspace: str):
        """Initialize with Cassandra session."""
        self.session = session
        self.keyspace = keyspace
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements."""
        # Course CRUD
        self._get_course_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.courses WHERE id = ?"
        )
        self._get_course_by_slug = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.courses WHERE slug = ?"
        )
        self._insert_course = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.courses
            (id, title, slug, description, thumbnail_url, status, creator_id,
             price, is_free, requires_enrollment, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._update_course = self.session.prepare(f"""
            UPDATE {self.keyspace}.courses
            SET title = ?, slug = ?, description = ?, thumbnail_url = ?,
                status = ?, price = ?, is_free = ?, updated_at = ?
            WHERE id = ?
        """)
        self._delete_course = self.session.prepare(
            f"DELETE FROM {self.keyspace}.courses WHERE id = ?"
        )

        # Filter tables
        self._insert_course_by_status = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.courses_by_status
            (status, created_at, course_id, title, slug, creator_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """)
        self._delete_course_by_status = self.session.prepare(
            f"DELETE FROM {self.keyspace}.courses_by_status WHERE status = ? AND created_at = ? AND course_id = ?"
        )
        self._get_courses_by_status = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.courses_by_status WHERE status = ? LIMIT ?"
        )

        self._insert_course_by_creator = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.courses_by_creator
            (creator_id, created_at, course_id, title, slug, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """)
        self._delete_course_by_creator = self.session.prepare(
            f"DELETE FROM {self.keyspace}.courses_by_creator WHERE creator_id = ? AND created_at = ? AND course_id = ?"
        )
        self._get_courses_by_creator = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.courses_by_creator WHERE creator_id = ? LIMIT ?"
        )

        # Course-Module linking
        self._get_course_modules = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.course_modules WHERE course_id = ?"
        )
        self._get_module_in_course = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.modules_by_course WHERE course_id = ? AND module_id = ?"
        )
        self._insert_course_module = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.course_modules
            (course_id, module_id, position, added_at, added_by)
            VALUES (?, ?, ?, ?, ?)
        """)
        self._insert_modules_by_course = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.modules_by_course
            (course_id, module_id, position)
            VALUES (?, ?, ?)
        """)
        self._insert_courses_by_module = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.courses_by_module
            (module_id, course_id)
            VALUES (?, ?)
        """)
        self._delete_course_module = self.session.prepare(
            f"DELETE FROM {self.keyspace}.course_modules WHERE course_id = ? AND position = ? AND module_id = ?"
        )
        self._delete_modules_by_course = self.session.prepare(
            f"DELETE FROM {self.keyspace}.modules_by_course WHERE course_id = ? AND module_id = ?"
        )
        self._delete_courses_by_module = self.session.prepare(
            f"DELETE FROM {self.keyspace}.courses_by_module WHERE module_id = ? AND course_id = ?"
        )
        self._delete_all_course_modules = self.session.prepare(
            f"DELETE FROM {self.keyspace}.course_modules WHERE course_id = ?"
        )

        # Module lookup (for getting module details when listing course modules)
        self._get_module_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.modules WHERE id = ?"
        )

    def create_course(self, data: CreateCourseRequest, creator_id: UUID) -> Course:
        """Create a new course."""
        slug = generate_slug(data.title)

        # Check slug uniqueness
        existing = self.get_course_by_slug(slug)
        if existing:
            slug = f"{slug}-{str(creator_id)[:8]}"

        course = Course(
            title=data.title,
            slug=slug,
            description=data.description,
            thumbnail_url=data.thumbnail_url,
            status=ContentStatus.DRAFT.value,
            creator_id=creator_id,
            price=data.price,
            is_free=data.is_free,
            requires_enrollment=True,
        )

        # Insert into main table
        self.session.execute(
            self._insert_course,
            [
                course.id,
                course.title,
                course.slug,
                course.description,
                course.thumbnail_url,
                course.status,
                course.creator_id,
                course.price,
                course.is_free,
                course.requires_enrollment,
                course.created_at,
                course.updated_at,
            ],
        )

        # Insert into filter tables
        self.session.execute(
            self._insert_course_by_status,
            [
                course.status,
                course.created_at,
                course.id,
                course.title,
                course.slug,
                course.creator_id,
            ],
        )
        self.session.execute(
            self._insert_course_by_creator,
            [
                course.creator_id,
                course.created_at,
                course.id,
                course.title,
                course.slug,
                course.status,
            ],
        )

        return course

    def get_course(self, course_id: UUID) -> Course | None:
        """Get course by ID."""
        rows = self.session.execute(self._get_course_by_id, [course_id])
        row = rows.one()
        return Course.from_row(row) if row else None

    def get_course_by_slug(self, slug: str) -> Course | None:
        """Get course by slug."""
        rows = self.session.execute(self._get_course_by_slug, [slug])
        row = rows.one()
        return Course.from_row(row) if row else None

    def update_course(self, course_id: UUID, data: UpdateCourseRequest) -> Course:
        """Update course."""
        course = self.get_course(course_id)
        if not course:
            raise CourseNotFoundError

        old_status = course.status
        old_created_at = course.created_at

        if data.title is not None:
            course.title = data.title.strip()
            course.slug = generate_slug(data.title)
        if data.description is not None:
            course.description = data.description
        if data.thumbnail_url is not None:
            course.thumbnail_url = data.thumbnail_url
        if data.status is not None:
            course.status = data.status.value
        if data.price is not None:
            course.price = data.price
        if data.is_free is not None:
            course.is_free = data.is_free

        course.updated_at = datetime.now(UTC)

        # Update main table
        self.session.execute(
            self._update_course,
            [
                course.title,
                course.slug,
                course.description,
                course.thumbnail_url,
                course.status,
                course.price,
                course.is_free,
                course.updated_at,
                course.id,
            ],
        )

        # Update filter tables if status changed
        if old_status != course.status:
            # Delete from old status
            self.session.execute(
                self._delete_course_by_status,
                [old_status, old_created_at, course.id],
            )
            # Insert into new status
            self.session.execute(
                self._insert_course_by_status,
                [
                    course.status,
                    course.created_at,
                    course.id,
                    course.title,
                    course.slug,
                    course.creator_id,
                ],
            )

        return course

    def delete_course(self, course_id: UUID) -> None:
        """Delete course."""
        course = self.get_course(course_id)
        if not course:
            raise CourseNotFoundError

        # Delete all module links
        modules = self.get_course_modules(course_id)
        for module, _ in modules:
            self.unlink_module(course_id, module.id)

        # Delete from filter tables
        self.session.execute(
            self._delete_course_by_status,
            [course.status, course.created_at, course.id],
        )
        self.session.execute(
            self._delete_course_by_creator,
            [course.creator_id, course.created_at, course.id],
        )

        # Delete course
        self.session.execute(self._delete_course, [course_id])

    def list_courses(
        self,
        status: ContentStatus | None = None,
        limit: int = 50,
    ) -> list[Course]:
        """List courses with optional status filter."""
        if status:
            rows = self.session.execute(
                self._get_courses_by_status, [status.value, limit]
            )
            courses = []
            for row in rows:
                # Get full course data
                course = self.get_course(row.course_id)
                if course:
                    courses.append(course)
            return courses
        else:
            cql = f"SELECT * FROM {self.keyspace}.courses LIMIT {limit}"
            rows = self.session.execute(cql)
            return [Course.from_row(row) for row in rows]

    def list_courses_by_creator(
        self, creator_id: UUID, limit: int = 50
    ) -> list[Course]:
        """List courses by creator."""
        rows = self.session.execute(self._get_courses_by_creator, [creator_id, limit])
        courses = []
        for row in rows:
            course = self.get_course(row.course_id)
            if course:
                courses.append(course)
        return courses

    # --------------------------------------------------------------------------
    # Module Linking
    # --------------------------------------------------------------------------

    def link_module(
        self,
        course_id: UUID,
        module_id: UUID,
        position: int | None,
        user_id: UUID,
    ) -> CourseModule:
        """Link a module to a course."""
        # Verify course exists
        course = self.get_course(course_id)
        if not course:
            raise CourseNotFoundError

        # Verify module exists
        module_rows = self.session.execute(self._get_module_by_id, [module_id])
        if not module_rows.one():
            raise ModuleNotFoundError

        # Check if already linked
        rows = self.session.execute(self._get_module_in_course, [course_id, module_id])
        if rows.one():
            raise AlreadyLinkedError("Modulo ja vinculado a este curso")

        # Auto-calculate position if not provided
        if position is None:
            modules = self.get_course_modules(course_id)
            position = len(modules)

        now = datetime.now(UTC)
        link = CourseModule(
            course_id=course_id,
            module_id=module_id,
            position=position,
            added_at=now,
            added_by=user_id,
        )

        # Dual-write pattern
        self.session.execute(
            self._insert_course_module,
            [course_id, module_id, position, now, user_id],
        )
        self.session.execute(
            self._insert_modules_by_course,
            [course_id, module_id, position],
        )
        self.session.execute(
            self._insert_courses_by_module,
            [module_id, course_id],
        )

        return link

    def unlink_module(self, course_id: UUID, module_id: UUID) -> None:
        """Unlink a module from a course."""
        # Find the link to get position
        rows = self.session.execute(self._get_module_in_course, [course_id, module_id])
        row = rows.one()
        if not row:
            raise NotLinkedError("Modulo nao vinculado a este curso")

        position = row.position

        # Delete from all tables
        self.session.execute(
            self._delete_course_module, [course_id, position, module_id]
        )
        self.session.execute(self._delete_modules_by_course, [course_id, module_id])
        self.session.execute(self._delete_courses_by_module, [module_id, course_id])

    def get_course_modules(self, course_id: UUID) -> list[tuple[Module, int]]:
        """Get all modules in a course with their positions."""
        rows = self.session.execute(self._get_course_modules, [course_id])

        results = []
        for row in rows:
            link = CourseModule.from_row(row)
            # Get module details using prepared statement
            module_rows = self.session.execute(self._get_module_by_id, [link.module_id])
            module_row = module_rows.one()
            if module_row:
                module = Module.from_row(module_row)
                results.append((module, link.position))

        # Sort by position
        results.sort(key=lambda x: x[1])
        return results

    def reorder_modules(
        self, course_id: UUID, module_ids: list[UUID], user_id: UUID
    ) -> None:
        """Reorder modules in a course."""
        # Get current links
        current_modules = self.get_course_modules(course_id)
        current_ids = {module.id for module, _ in current_modules}

        # Verify all IDs exist in current modules
        if set(module_ids) != current_ids:
            msg = "Lista de IDs nao corresponde aos modulos atuais"
            raise CourseError(msg, "invalid_reorder")

        # Delete all current links
        self.session.execute(self._delete_all_course_modules, [course_id])

        # Re-insert with new positions
        now = datetime.now(UTC)
        for position, module_id in enumerate(module_ids):
            self.session.execute(
                self._insert_course_module,
                [course_id, module_id, position, now, user_id],
            )
            self.session.execute(
                self._insert_modules_by_course,
                [course_id, module_id, position],
            )

    def get_module_count(self, course_id: UUID) -> int:
        """Get number of modules in a course."""
        rows = self.session.execute(self._get_course_modules, [course_id])
        return len(list(rows))

    def to_response(self, course: Course, module_count: int = 0) -> CourseResponse:
        """Convert Course to response schema."""
        return CourseResponse(
            id=course.id,
            title=course.title,
            slug=course.slug,
            description=course.description,
            thumbnail_url=course.thumbnail_url,
            status=ContentStatus(course.status),
            creator_id=course.creator_id,
            created_at=course.created_at,
            updated_at=course.updated_at,
            module_count=module_count,
        )
