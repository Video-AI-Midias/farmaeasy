"""Course management API endpoints.

Provides routes for:
- Courses: CRUD and module management
- Modules: CRUD and lesson management
- Lessons: CRUD operations
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.acquisitions.dependencies import AcquisitionServiceDep
from src.auth.dependencies import CurrentUser, OptionalUser, TeacherUser
from src.auth.permissions import UserRole
from src.courses.dependencies import (
    CourseServiceDep,
    LessonServiceDep,
    ModuleServiceDep,
    can_delete_content,
    can_edit_content,
    can_view_content,
    handle_course_error,
    is_student_user,
)
from src.courses.models import ContentStatus, ContentType
from src.courses.schemas import (
    CourseDetailResponse,
    CourseListResponse,
    CourseResponse,
    CreateCourseRequest,
    CreateLessonRequest,
    CreateModuleRequest,
    LessonInModuleResponse,
    LessonListResponse,
    LessonResponse,
    LessonUsageResponse,
    LinkLessonRequest,
    LinkModuleRequest,
    MessageResponse,
    ModuleDetailResponse,
    ModuleInCourseResponse,
    ModuleListResponse,
    ModuleResponse,
    ModuleUsageResponse,
    ReorderRequest,
    UpdateCourseRequest,
    UpdateLessonRequest,
    UpdateModuleRequest,
)
from src.courses.service import (
    AlreadyLinkedError,
    CourseError,
    LessonInUseError,
    LessonNotFoundError,
    ModuleInUseError,
    ModuleNotFoundError,
    NotLinkedError,
)


# ==============================================================================
# Courses Router
# ==============================================================================

router_courses = APIRouter(prefix="/v1/courses", tags=["courses"])


@router_courses.post(
    "",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new course",
)
async def create_course(
    data: CreateCourseRequest,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> CourseResponse:
    """Create a new course (TEACHER or ADMIN only)."""
    course = course_service.create_course(data, UUID(str(user.id)))
    return course_service.to_response(course)


@router_courses.get(
    "",
    response_model=CourseListResponse,
    summary="List published courses",
)
async def list_published_courses(
    course_service: CourseServiceDep,
    limit: int = 50,
) -> CourseListResponse:
    """List all published courses (public)."""
    courses = course_service.list_courses(status=ContentStatus.PUBLISHED, limit=limit)
    items = [
        course_service.to_response(c, course_service.get_module_count(c.id))
        for c in courses
    ]
    return CourseListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router_courses.get(
    "/admin",
    response_model=CourseListResponse,
    summary="List all courses (admin)",
)
async def list_all_courses(
    course_service: CourseServiceDep,
    user: TeacherUser,
    status_filter: ContentStatus | None = None,
    limit: int = 50,
) -> CourseListResponse:
    """List all courses with optional filters (TEACHER/ADMIN only)."""
    courses = course_service.list_courses(status=status_filter, limit=limit)
    items = [
        course_service.to_response(c, course_service.get_module_count(c.id))
        for c in courses
        if can_view_content(user, c.status, c.creator_id)
    ]
    return CourseListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router_courses.get(
    "/my",
    response_model=CourseListResponse,
    summary="List my courses",
)
async def list_my_courses(
    course_service: CourseServiceDep,
    user: TeacherUser,
    limit: int = 50,
) -> CourseListResponse:
    """List courses created by current user."""
    courses = course_service.list_courses_by_creator(UUID(str(user.id)), limit)
    items = [
        course_service.to_response(c, course_service.get_module_count(c.id))
        for c in courses
    ]
    return CourseListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router_courses.get(
    "/{course_id}",
    response_model=CourseDetailResponse,
    summary="Get course details",
)
async def get_course(
    course_id: UUID,
    course_service: CourseServiceDep,
    module_service: ModuleServiceDep,
    _lesson_service: LessonServiceDep,
    acquisition_service: AcquisitionServiceDep,
    user: OptionalUser,
) -> CourseDetailResponse:
    """Get course with nested modules and lessons.

    Includes user-specific access information when authenticated.
    """
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

    # Get user access info (if authenticated)
    has_access: bool | None = None
    acquisition_type: str | None = None

    if user is not None:
        access_info = await acquisition_service.check_access(
            user_id=UUID(str(user.id)),
            course_id=course_id,
        )
        has_access = access_info.has_access
        acquisition_type = (
            access_info.acquisition_type.value if access_info.acquisition_type else None
        )

    # Get modules with lessons
    modules_with_pos = course_service.get_course_modules(course_id)
    module_responses = []

    for module, pos in modules_with_pos:
        # Skip non-viewable modules for non-admin users
        if not can_view_content(user, module.status, module.creator_id):
            continue

        # Get lessons for this module
        lessons_with_pos = module_service.get_module_lessons(module.id)
        lesson_responses = []

        for lesson, lesson_pos in lessons_with_pos:
            if not can_view_content(user, lesson.status, lesson.creator_id):
                continue
            # Filter invalid lessons for students (only show valid lessons)
            if is_student_user(user) and not lesson.is_valid:
                continue
            lesson_responses.append(
                LessonInModuleResponse(
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
                    position=lesson_pos,
                )
            )

        module_responses.append(
            ModuleInCourseResponse(
                id=module.id,
                title=module.title,
                slug=module.slug,
                description=module.description,
                thumbnail_url=module.thumbnail_url,
                status=ContentStatus(module.status),
                creator_id=module.creator_id,
                created_at=module.created_at,
                updated_at=module.updated_at,
                lesson_count=len(lesson_responses),
                position=pos,
                lessons=lesson_responses,
            )
        )

    return CourseDetailResponse(
        id=course.id,
        title=course.title,
        slug=course.slug,
        description=course.description,
        thumbnail_url=course.thumbnail_url,
        status=ContentStatus(course.status),
        creator_id=course.creator_id,
        price=course.price,
        is_free=course.is_free,
        requires_enrollment=course.requires_enrollment,
        created_at=course.created_at,
        updated_at=course.updated_at,
        module_count=len(module_responses),
        modules=module_responses,
        has_access=has_access,
        acquisition_type=acquisition_type,
    )


@router_courses.get(
    "/slug/{slug}",
    response_model=CourseDetailResponse,
    summary="Get course by slug",
)
async def get_course_by_slug(
    slug: str,
    course_service: CourseServiceDep,
    module_service: ModuleServiceDep,
    lesson_service: LessonServiceDep,
    acquisition_service: AcquisitionServiceDep,
    user: OptionalUser,
) -> CourseDetailResponse:
    """Get course by slug with nested modules and lessons."""
    course = course_service.get_course_by_slug(slug)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    # Reuse the detail endpoint logic
    return await get_course(
        course.id,
        course_service,
        module_service,
        lesson_service,
        acquisition_service,
        user,
    )


@router_courses.put(
    "/{course_id}",
    response_model=CourseResponse,
    summary="Update course",
)
async def update_course(
    course_id: UUID,
    data: UpdateCourseRequest,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> CourseResponse:
    """Update course (owner or ADMIN only)."""
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

    try:
        updated = course_service.update_course(course_id, data)
        return course_service.to_response(
            updated, course_service.get_module_count(course_id)
        )
    except CourseError as e:
        raise handle_course_error(e) from e


@router_courses.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete course",
)
async def delete_course(
    course_id: UUID,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> None:
    """Delete course (owner or ADMIN only)."""
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not can_delete_content(user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para deletar este curso",
        )

    try:
        course_service.delete_course(course_id)
    except CourseError as e:
        raise handle_course_error(e) from e


# --------------------------------------------------------------------------
# Course-Module Linking
# --------------------------------------------------------------------------


@router_courses.get(
    "/{course_id}/modules",
    response_model=list[ModuleInCourseResponse],
    summary="List course modules",
)
async def list_course_modules(
    course_id: UUID,
    course_service: CourseServiceDep,
    module_service: ModuleServiceDep,
    user: OptionalUser,
) -> list[ModuleInCourseResponse]:
    """List all modules in a course."""
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

    modules_with_pos = course_service.get_course_modules(course_id)
    responses = []

    for module, pos in modules_with_pos:
        if can_view_content(user, module.status, module.creator_id):
            responses.append(
                ModuleInCourseResponse(
                    id=module.id,
                    title=module.title,
                    slug=module.slug,
                    description=module.description,
                    thumbnail_url=module.thumbnail_url,
                    status=ContentStatus(module.status),
                    creator_id=module.creator_id,
                    created_at=module.created_at,
                    updated_at=module.updated_at,
                    lesson_count=module_service.get_lesson_count(module.id),
                    position=pos,
                )
            )

    return responses


@router_courses.post(
    "/{course_id}/modules",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link module to course",
)
async def link_module_to_course(
    course_id: UUID,
    data: LinkModuleRequest,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Link an existing module to a course."""
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

    try:
        course_service.link_module(
            course_id, data.module_id, data.position, UUID(str(user.id))
        )
        return MessageResponse(message="Modulo vinculado com sucesso")
    except (ModuleNotFoundError, AlreadyLinkedError) as e:
        raise handle_course_error(e) from e


@router_courses.delete(
    "/{course_id}/modules/{module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink module from course",
)
async def unlink_module_from_course(
    course_id: UUID,
    module_id: UUID,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> None:
    """Unlink a module from a course."""
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

    try:
        course_service.unlink_module(course_id, module_id)
    except NotLinkedError as e:
        raise handle_course_error(e) from e


@router_courses.put(
    "/{course_id}/modules/reorder",
    response_model=MessageResponse,
    summary="Reorder course modules",
)
async def reorder_course_modules(
    course_id: UUID,
    data: ReorderRequest,
    course_service: CourseServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Reorder modules in a course."""
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

    try:
        course_service.reorder_modules(course_id, data.items, UUID(str(user.id)))
        return MessageResponse(message="Modulos reordenados com sucesso")
    except CourseError as e:
        raise handle_course_error(e) from e


# ==============================================================================
# Modules Router
# ==============================================================================

router_modules = APIRouter(prefix="/v1/modules", tags=["modules"])


@router_modules.post(
    "",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new module",
)
async def create_module(
    data: CreateModuleRequest,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> ModuleResponse:
    """Create a new standalone module (TEACHER or ADMIN only)."""
    module = module_service.create_module(data, UUID(str(user.id)))
    return module_service.to_response(module)


@router_modules.get(
    "",
    response_model=ModuleListResponse,
    summary="List modules",
)
async def list_modules(
    module_service: ModuleServiceDep,
    user: TeacherUser,
    status_filter: ContentStatus | None = None,
    limit: int = 50,
) -> ModuleListResponse:
    """List all modules (TEACHER/ADMIN only)."""
    modules = module_service.list_modules(status=status_filter, limit=limit)
    items = [
        module_service.to_response(m, module_service.get_lesson_count(m.id))
        for m in modules
        if can_view_content(user, m.status, m.creator_id)
    ]
    return ModuleListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router_modules.get(
    "/{module_id}",
    response_model=ModuleDetailResponse,
    summary="Get module details",
)
async def get_module(
    module_id: UUID,
    module_service: ModuleServiceDep,
    _lesson_service: LessonServiceDep,
    user: CurrentUser,
) -> ModuleDetailResponse:
    """Get module with nested lessons."""
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

    # Get lessons
    lessons_with_pos = module_service.get_module_lessons(module_id)
    lesson_responses = []

    for lesson, pos in lessons_with_pos:
        if not can_view_content(user, lesson.status, lesson.creator_id):
            continue
        # Filter invalid lessons for students (only show valid lessons)
        if is_student_user(user) and not lesson.is_valid:
            continue
        lesson_responses.append(
            LessonInModuleResponse(
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
                position=pos,
            )
        )

    return ModuleDetailResponse(
        id=module.id,
        title=module.title,
        slug=module.slug,
        description=module.description,
        thumbnail_url=module.thumbnail_url,
        status=ContentStatus(module.status),
        creator_id=module.creator_id,
        created_at=module.created_at,
        updated_at=module.updated_at,
        lesson_count=len(lesson_responses),
        lessons=lesson_responses,
    )


@router_modules.put(
    "/{module_id}",
    response_model=ModuleResponse,
    summary="Update module",
)
async def update_module(
    module_id: UUID,
    data: UpdateModuleRequest,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> ModuleResponse:
    """Update module (owner or ADMIN only)."""
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

    try:
        updated = module_service.update_module(module_id, data)
        return module_service.to_response(
            updated, module_service.get_lesson_count(module_id)
        )
    except CourseError as e:
        raise handle_course_error(e) from e


@router_modules.delete(
    "/{module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete module",
)
async def delete_module(
    module_id: UUID,
    module_service: ModuleServiceDep,
    user: TeacherUser,
    force: bool = False,
) -> None:
    """Delete module.

    Args:
        module_id: ID of the module to delete
        force: If True, unlink from all courses before deleting.
               Requires ADMIN role for force delete.
    """
    module = module_service.get_module(module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modulo nao encontrado",
        )

    if not can_delete_content(user, module.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para deletar este modulo",
        )

    # Force delete requires ADMIN role
    if force and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem forcar exclusao",
        )

    try:
        module_service.delete_module(module_id, force=force)
    except ModuleInUseError as e:
        raise handle_course_error(e) from e


@router_modules.get(
    "/{module_id}/courses",
    response_model=ModuleUsageResponse,
    summary="Get courses using this module",
)
async def get_module_usage(
    module_id: UUID,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> ModuleUsageResponse:
    """Get all courses that use this module."""
    module = module_service.get_module(module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Modulo nao encontrado",
        )

    courses = module_service.get_courses_using_module(module_id)
    course_refs = [
        {
            "id": c.id,
            "title": c.title,
            "slug": c.slug,
            "status": ContentStatus(c.status),
        }
        for c in courses
        if can_view_content(user, c.status, c.creator_id)
    ]

    return ModuleUsageResponse(
        module=module_service.to_response(
            module, module_service.get_lesson_count(module_id)
        ),
        courses=course_refs,
        course_count=len(course_refs),
    )


# --------------------------------------------------------------------------
# Module-Lesson Linking
# --------------------------------------------------------------------------


@router_modules.get(
    "/{module_id}/lessons",
    response_model=list[LessonInModuleResponse],
    summary="List module lessons",
)
async def list_module_lessons(
    module_id: UUID,
    module_service: ModuleServiceDep,
    user: CurrentUser,
) -> list[LessonInModuleResponse]:
    """List all lessons in a module."""
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

    lessons_with_pos = module_service.get_module_lessons(module_id)
    responses = []

    for lesson, pos in lessons_with_pos:
        if not can_view_content(user, lesson.status, lesson.creator_id):
            continue
        # Filter invalid lessons for students (only show valid lessons)
        if is_student_user(user) and not lesson.is_valid:
            continue
        responses.append(
            LessonInModuleResponse(
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
                position=pos,
            )
        )

    return responses


@router_modules.post(
    "/{module_id}/lessons",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link lesson to module",
)
async def link_lesson_to_module(
    module_id: UUID,
    data: LinkLessonRequest,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Link an existing lesson to a module."""
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

    try:
        module_service.link_lesson(
            module_id, data.lesson_id, data.position, UUID(str(user.id))
        )
        return MessageResponse(message="Aula vinculada com sucesso")
    except (LessonNotFoundError, AlreadyLinkedError) as e:
        raise handle_course_error(e) from e


@router_modules.delete(
    "/{module_id}/lessons/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink lesson from module",
)
async def unlink_lesson_from_module(
    module_id: UUID,
    lesson_id: UUID,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> None:
    """Unlink a lesson from a module."""
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

    try:
        module_service.unlink_lesson(module_id, lesson_id)
    except NotLinkedError as e:
        raise handle_course_error(e) from e


@router_modules.put(
    "/{module_id}/lessons/reorder",
    response_model=MessageResponse,
    summary="Reorder module lessons",
)
async def reorder_module_lessons(
    module_id: UUID,
    data: ReorderRequest,
    module_service: ModuleServiceDep,
    user: TeacherUser,
) -> MessageResponse:
    """Reorder lessons in a module."""
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

    try:
        module_service.reorder_lessons(module_id, data.items, UUID(str(user.id)))
        return MessageResponse(message="Aulas reordenadas com sucesso")
    except CourseError as e:
        raise handle_course_error(e) from e


# ==============================================================================
# Lessons Router
# ==============================================================================

router_lessons = APIRouter(prefix="/v1/lessons", tags=["lessons"])


@router_lessons.post(
    "",
    response_model=LessonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new lesson",
)
async def create_lesson(
    data: CreateLessonRequest,
    lesson_service: LessonServiceDep,
    user: TeacherUser,
) -> LessonResponse:
    """Create a new standalone lesson (TEACHER or ADMIN only)."""
    lesson = lesson_service.create_lesson(data, UUID(str(user.id)))
    return lesson_service.to_response(lesson)


@router_lessons.get(
    "",
    response_model=LessonListResponse,
    summary="List lessons",
)
async def list_lessons(
    lesson_service: LessonServiceDep,
    user: TeacherUser,
    status_filter: ContentStatus | None = None,
    content_type: ContentType | None = None,
    limit: int = 50,
) -> LessonListResponse:
    """List all lessons (TEACHER/ADMIN only)."""
    lessons = lesson_service.list_lessons(
        status=status_filter, content_type=content_type, limit=limit
    )
    items = [
        lesson_service.to_response(lesson)
        for lesson in lessons
        if can_view_content(user, lesson.status, lesson.creator_id)
    ]
    return LessonListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router_lessons.get(
    "/{lesson_id}",
    response_model=LessonResponse,
    summary="Get lesson details",
)
async def get_lesson(
    lesson_id: UUID,
    lesson_service: LessonServiceDep,
    user: CurrentUser,
) -> LessonResponse:
    """Get lesson details."""
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

    return lesson_service.to_response(lesson)


@router_lessons.put(
    "/{lesson_id}",
    response_model=LessonResponse,
    summary="Update lesson",
)
async def update_lesson(
    lesson_id: UUID,
    data: UpdateLessonRequest,
    lesson_service: LessonServiceDep,
    user: TeacherUser,
) -> LessonResponse:
    """Update lesson (owner or ADMIN only)."""
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

    try:
        updated = lesson_service.update_lesson(lesson_id, data)
        return lesson_service.to_response(updated)
    except CourseError as e:
        raise handle_course_error(e) from e


@router_lessons.delete(
    "/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete lesson",
)
async def delete_lesson(
    lesson_id: UUID,
    lesson_service: LessonServiceDep,
    user: TeacherUser,
    force: bool = False,
) -> None:
    """Delete lesson.

    Args:
        lesson_id: ID of the lesson to delete
        force: If True, unlink from all modules before deleting.
               Requires ADMIN role for force delete.
    """
    lesson = lesson_service.get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aula nao encontrada",
        )

    if not can_delete_content(user, lesson.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para deletar esta aula",
        )

    # Force delete requires ADMIN role
    if force and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem forcar exclusao",
        )

    try:
        lesson_service.delete_lesson(lesson_id, force=force)
    except LessonInUseError as e:
        raise handle_course_error(e) from e


@router_lessons.get(
    "/{lesson_id}/modules",
    response_model=LessonUsageResponse,
    summary="Get modules using this lesson",
)
async def get_lesson_usage(
    lesson_id: UUID,
    lesson_service: LessonServiceDep,
    user: TeacherUser,
) -> LessonUsageResponse:
    """Get all modules that use this lesson."""
    lesson = lesson_service.get_lesson(lesson_id)
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aula nao encontrada",
        )

    modules = lesson_service.get_modules_using_lesson(lesson_id)
    module_refs = [
        {
            "id": m.id,
            "title": m.title,
            "slug": m.slug,
            "status": ContentStatus(m.status),
        }
        for m in modules
        if can_view_content(user, m.status, m.creator_id)
    ]

    return LessonUsageResponse(
        lesson=lesson_service.to_response(lesson),
        modules=module_refs,
        module_count=len(module_refs),
    )
