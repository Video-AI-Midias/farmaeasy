"""FastAPI dependencies for course management.

Provides dependency injection for:
- Service instances
- Content ownership verification
- Role-based access control for content
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status

from src.auth.dependencies import CurrentUser, TeacherUser
from src.auth.permissions import UserRole
from src.auth.schemas import UserResponse
from src.courses.models import ContentStatus
from src.courses.service import (
    CourseService,
    LessonService,
    ModuleService,
)


# ==============================================================================
# Service Getters (set by main.py)
# ==============================================================================

_course_service_getter: Callable[[], CourseService] | None = None
_module_service_getter: Callable[[], ModuleService] | None = None
_lesson_service_getter: Callable[[], LessonService] | None = None


def set_course_service_getter(getter: Callable[[], CourseService]) -> None:
    """Set the course service getter function."""
    global _course_service_getter
    _course_service_getter = getter


def set_module_service_getter(getter: Callable[[], ModuleService]) -> None:
    """Set the module service getter function."""
    global _module_service_getter
    _module_service_getter = getter


def set_lesson_service_getter(getter: Callable[[], LessonService]) -> None:
    """Set the lesson service getter function."""
    global _lesson_service_getter
    _lesson_service_getter = getter


def get_course_service() -> CourseService:
    """Get CourseService instance from app state."""
    if _course_service_getter is None:
        msg = "CourseService not configured"
        raise RuntimeError(msg)
    return _course_service_getter()


def get_module_service() -> ModuleService:
    """Get ModuleService instance from app state."""
    if _module_service_getter is None:
        msg = "ModuleService not configured"
        raise RuntimeError(msg)
    return _module_service_getter()


def get_lesson_service() -> LessonService:
    """Get LessonService instance from app state."""
    if _lesson_service_getter is None:
        msg = "LessonService not configured"
        raise RuntimeError(msg)
    return _lesson_service_getter()


# ==============================================================================
# Type Aliases for Dependencies
# ==============================================================================

CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]
ModuleServiceDep = Annotated[ModuleService, Depends(get_module_service)]
LessonServiceDep = Annotated[LessonService, Depends(get_lesson_service)]


# ==============================================================================
# Ownership Verification
# ==============================================================================


def is_owner_or_admin(user: UserResponse, creator_id: UUID) -> bool:
    """Check if user is the owner or an admin."""
    user_role = UserRole(user.role) if isinstance(user.role, str) else user.role
    if user_role == UserRole.ADMIN:
        return True
    return str(user.id) == str(creator_id)


def is_student_user(user: UserResponse | None) -> bool:
    """Check if user is a student (not ADMIN or TEACHER).

    Students should only see valid, published lessons.
    Anonymous users are treated as students.
    """
    if user is None:
        return True
    user_role = UserRole(user.role) if isinstance(user.role, str) else user.role
    return user_role == UserRole.STUDENT


def can_view_content(user: UserResponse | None, status: str, creator_id: UUID) -> bool:
    """Check if user can view content based on status and ownership.

    Rules:
    - Published: Everyone (including anonymous)
    - Draft: Owner and ADMIN only
    - Archived: ADMIN only
    """
    content_status = ContentStatus(status)

    if content_status == ContentStatus.PUBLISHED:
        return True

    if user is None:
        return False

    user_role = UserRole(user.role) if isinstance(user.role, str) else user.role

    if user_role == UserRole.ADMIN:
        return True

    if content_status == ContentStatus.DRAFT:
        return str(user.id) == str(creator_id)

    # Archived - only ADMIN (already handled above)
    return False


def can_edit_content(user: UserResponse, creator_id: UUID) -> bool:
    """Check if user can edit content.

    Rules:
    - ADMIN: Can edit any content
    - TEACHER: Can edit own content only
    """
    return is_owner_or_admin(user, creator_id)


def can_delete_content(user: UserResponse, creator_id: UUID) -> bool:
    """Check if user can delete content.

    Same rules as edit.
    """
    return is_owner_or_admin(user, creator_id)


# ==============================================================================
# Course Access Dependencies
# ==============================================================================


async def verify_course_view_access(
    course_id: UUID,
    course_service: CourseServiceDep,
    user: CurrentUser,
):
    """Verify user can view a course."""
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not can_view_content(user, course.status, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para visualizar este curso",
        )

    return course


async def verify_course_edit_access(
    course_id: UUID,
    course_service: CourseServiceDep,
    user: TeacherUser,
):
    """Verify user can edit a course (TEACHER or ADMIN required)."""
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not can_edit_content(user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para editar este curso",
        )

    return course


# ==============================================================================
# Module Access Dependencies
# ==============================================================================


async def verify_module_view_access(
    module_id: UUID,
    module_service: ModuleServiceDep,
    user: CurrentUser,
):
    """Verify user can view a module."""
    module = module_service.get_module(module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modulo nao encontrado",
        )

    if not can_view_content(user, module.status, module.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para visualizar este modulo",
        )

    return module


async def verify_module_edit_access(
    module_id: UUID,
    module_service: ModuleServiceDep,
    user: TeacherUser,
):
    """Verify user can edit a module (TEACHER or ADMIN required)."""
    module = module_service.get_module(module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modulo nao encontrado",
        )

    if not can_edit_content(user, module.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para editar este modulo",
        )

    return module


# ==============================================================================
# Lesson Access Dependencies
# ==============================================================================


async def verify_lesson_view_access(
    lesson_id: UUID,
    lesson_service: LessonServiceDep,
    user: CurrentUser,
):
    """Verify user can view a lesson."""
    lesson = lesson_service.get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aula nao encontrada",
        )

    if not can_view_content(user, lesson.status, lesson.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para visualizar esta aula",
        )

    return lesson


async def verify_lesson_edit_access(
    lesson_id: UUID,
    lesson_service: LessonServiceDep,
    user: TeacherUser,
):
    """Verify user can edit a lesson (TEACHER or ADMIN required)."""
    lesson = lesson_service.get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aula nao encontrada",
        )

    if not can_edit_content(user, lesson.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para editar esta aula",
        )

    return lesson


# ==============================================================================
# Error Handlers
# ==============================================================================


def handle_course_error(error: Exception) -> HTTPException:
    """Convert course errors to HTTPException."""
    status_map = {
        "course_not_found": status.HTTP_404_NOT_FOUND,
        "module_not_found": status.HTTP_404_NOT_FOUND,
        "lesson_not_found": status.HTTP_404_NOT_FOUND,
        "slug_exists": status.HTTP_409_CONFLICT,
        "module_in_use": status.HTTP_409_CONFLICT,
        "lesson_in_use": status.HTTP_409_CONFLICT,
        "already_linked": status.HTTP_409_CONFLICT,
        "not_linked": status.HTTP_404_NOT_FOUND,
        "invalid_reorder": status.HTTP_400_BAD_REQUEST,
        "invalid_content": status.HTTP_422_UNPROCESSABLE_ENTITY,
    }

    # Get error code from exception
    code = getattr(error, "code", "course_error")
    message = getattr(error, "message", str(error))

    return HTTPException(
        status_code=status_map.get(code, status.HTTP_400_BAD_REQUEST),
        detail=message,
    )
