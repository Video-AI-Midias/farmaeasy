"""Student progress tracking API endpoints.

Provides routes for:
- Video progress updates (throttled from frontend)
- Manual lesson completion
- Course enrollment (with acquisition validation)
- Progress queries
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from src.acquisitions.dependencies import AcquisitionServiceDep
from src.auth.dependencies import CurrentUser
from src.courses.dependencies import CourseServiceDep

from .dependencies import ProgressServiceDep, handle_progress_error
from .schemas import (
    CourseProgressResponse,
    EnrollmentListResponse,
    EnrollmentResponse,
    EnrollRequest,
    LessonProgressCheckResponse,
    LessonProgressResponse,
    MarkLessonCompleteRequest,
    MarkLessonIncompleteRequest,
    UpdateVideoProgressRequest,
)
from .service import ProgressError


router = APIRouter(prefix="/v1/progress", tags=["progress"])
enrollments_router = APIRouter(prefix="/v1/enrollments", tags=["enrollments"])


# ==============================================================================
# Access Validation Helper
# ==============================================================================


async def validate_course_access(
    course_id: UUID,
    user: CurrentUser,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
) -> None:
    """Validate user has access to course before progress updates.

    Access hierarchy:
    1. Admin: Always has access
    2. Teacher: Has access to own courses
    3. Student: Requires active acquisition

    Raises:
        HTTPException 403: If user does not have access
    """
    # Get course to determine creator_id
    course = await course_service.get_course(course_id)
    course_creator_id = course.creator_id if course else None

    has_access = await acquisition_service.has_active_access(
        user_id=UUID(str(user.id)),
        course_id=course_id,
        user_role=user.role,
        course_creator_id=course_creator_id,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao tem acesso a este curso",
        )


# ==============================================================================
# Video Progress Endpoints
# ==============================================================================


@router.put(
    "/video",
    response_model=LessonProgressResponse,
    summary="Update video progress",
)
async def update_video_progress(
    data: UpdateVideoProgressRequest,
    progress_service: ProgressServiceDep,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    user: CurrentUser,
) -> LessonProgressResponse:
    """Update video watching progress.

    Called from frontend every 5 seconds during video playback.
    Auto-completes lesson when >= 90% watched.
    Requires valid course access.
    """
    # Validate access before progress update
    await validate_course_access(
        data.course_id, user, acquisition_service, course_service
    )

    try:
        progress = await progress_service.update_video_progress(
            user_id=UUID(str(user.id)),
            lesson_id=data.lesson_id,
            course_id=data.course_id,
            module_id=data.module_id,
            position_seconds=data.position_seconds,
            duration_seconds=data.duration_seconds,
        )
        return LessonProgressResponse.from_entity(progress)
    except ProgressError as e:
        raise handle_progress_error(e) from e


# ==============================================================================
# Lesson Completion Endpoints
# ==============================================================================


@router.post(
    "/lesson/complete",
    response_model=LessonProgressResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark lesson as complete",
)
async def mark_lesson_complete(
    data: MarkLessonCompleteRequest,
    progress_service: ProgressServiceDep,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    user: CurrentUser,
) -> LessonProgressResponse:
    """Manually mark a lesson as complete.

    Used for non-video content (text, PDF, quiz).
    Requires valid course access.
    """
    # Validate access before progress update
    await validate_course_access(
        data.course_id, user, acquisition_service, course_service
    )

    try:
        progress = await progress_service.mark_lesson_complete(
            user_id=UUID(str(user.id)),
            lesson_id=data.lesson_id,
            course_id=data.course_id,
            module_id=data.module_id,
        )
        return LessonProgressResponse.from_entity(progress)
    except ProgressError as e:
        raise handle_progress_error(e) from e


@router.post(
    "/lesson/incomplete",
    response_model=LessonProgressResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark lesson as incomplete",
)
async def mark_lesson_incomplete(
    data: MarkLessonIncompleteRequest,
    progress_service: ProgressServiceDep,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    user: CurrentUser,
) -> LessonProgressResponse:
    """Reset lesson progress (for rewatching).

    Resets progress to 0% and clears completion status.
    Requires valid course access.
    """
    # Validate access before progress update
    await validate_course_access(
        data.course_id, user, acquisition_service, course_service
    )

    try:
        progress = await progress_service.mark_lesson_incomplete(
            user_id=UUID(str(user.id)),
            lesson_id=data.lesson_id,
            course_id=data.course_id,
            module_id=data.module_id,
        )
        return LessonProgressResponse.from_entity(progress)
    except ProgressError as e:
        raise handle_progress_error(e) from e


# ==============================================================================
# Progress Query Endpoints
# ==============================================================================


@router.get(
    "/lesson/{lesson_id}",
    response_model=LessonProgressCheckResponse,
    summary="Get lesson progress",
)
async def get_lesson_progress(
    lesson_id: UUID,
    progress_service: ProgressServiceDep,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    user: CurrentUser,
    course_id: UUID = Query(..., description="Course UUID"),
    module_id: UUID = Query(..., description="Module UUID"),
) -> LessonProgressCheckResponse:
    """Get progress for a specific lesson.

    Used on lesson load to determine resume position.
    Requires valid course access.
    """
    # Validate access before returning progress
    await validate_course_access(course_id, user, acquisition_service, course_service)

    return await progress_service.get_lesson_progress_check(
        user_id=UUID(str(user.id)),
        course_id=course_id,
        module_id=module_id,
        lesson_id=lesson_id,
    )


@router.get(
    "/course/{course_id}",
    response_model=CourseProgressResponse,
    summary="Get complete course progress",
)
async def get_course_progress(
    course_id: UUID,
    progress_service: ProgressServiceDep,
    acquisition_service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    user: CurrentUser,
) -> CourseProgressResponse:
    """Get complete progress for a course.

    Returns enrollment info, module progress, and all lesson progress.
    Includes resume position for continuing where left off.
    Requires valid course access.
    """
    # Validate access before returning progress
    await validate_course_access(course_id, user, acquisition_service, course_service)

    result = await progress_service.get_course_progress(
        user_id=UUID(str(user.id)),
        course_id=course_id,
    )
    if result is None:
        # Auto-enroll if not enrolled
        await progress_service.enroll_user(UUID(str(user.id)), course_id)
        result = await progress_service.get_course_progress(
            user_id=UUID(str(user.id)),
            course_id=course_id,
        )
    return result


# ==============================================================================
# Enrollment Endpoints
# ==============================================================================


@enrollments_router.post(
    "",
    response_model=EnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll in course",
)
async def enroll_in_course(
    data: EnrollRequest,
    progress_service: ProgressServiceDep,
    course_service: CourseServiceDep,
    acquisition_service: AcquisitionServiceDep,
    user: CurrentUser,
) -> EnrollmentResponse:
    """Enroll current user in a course.

    Validates acquisition before enrollment:
    - Free courses: auto-creates FREE acquisition
    - Paid courses: requires active acquisition (purchase or admin grant)
    """
    user_id = UUID(str(user.id))

    # 1. Check course exists
    course = await course_service.get_course(data.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso não encontrado",
        )

    # 2. Check if course requires enrollment
    if not course.requires_enrollment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este curso não requer matrícula",
        )

    # 3. Check/create acquisition based on course type
    has_access = await acquisition_service.has_active_access(user_id, data.course_id)

    if not has_access:
        if course.is_free:
            # Auto-create FREE acquisition for free courses
            await acquisition_service.enroll_free(user_id, data.course_id)
        else:
            # Paid course requires purchase or admin grant
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você precisa adquirir este curso antes de se matricular",
            )

    # 4. Create enrollment
    try:
        enrollment = await progress_service.enroll_user(
            user_id=user_id,
            course_id=data.course_id,
        )
        return EnrollmentResponse(
            course_id=enrollment.course_id,
            user_id=enrollment.user_id,
            status=enrollment.status,
            enrolled_at=enrollment.enrolled_at,
            started_at=enrollment.started_at,
            completed_at=enrollment.completed_at,
            progress_percent=enrollment.progress_percent,
            lessons_completed=enrollment.lessons_completed,
            lessons_total=enrollment.lessons_total,
            last_accessed_at=enrollment.last_accessed_at,
            last_lesson_id=enrollment.last_lesson_id,
            last_module_id=enrollment.last_module_id,
        )
    except ProgressError as e:
        raise handle_progress_error(e) from e


@enrollments_router.get(
    "/my",
    response_model=EnrollmentListResponse,
    summary="Get my enrollments",
)
async def get_my_enrollments(
    progress_service: ProgressServiceDep,
    user: CurrentUser,
) -> EnrollmentListResponse:
    """Get all course enrollments for current user."""
    enrollments = await progress_service.get_user_enrollments(UUID(str(user.id)))
    return EnrollmentListResponse(
        items=[
            EnrollmentResponse(
                course_id=e.course_id,
                user_id=e.user_id,
                status=e.status,
                enrolled_at=e.enrolled_at,
                started_at=e.started_at,
                completed_at=e.completed_at,
                progress_percent=e.progress_percent,
                lessons_completed=e.lessons_completed,
                lessons_total=e.lessons_total,
                last_accessed_at=e.last_accessed_at,
                last_lesson_id=e.last_lesson_id,
                last_module_id=e.last_module_id,
            )
            for e in enrollments
        ],
        total=len(enrollments),
    )


@enrollments_router.get(
    "/{course_id}",
    response_model=EnrollmentResponse,
    summary="Get enrollment for course",
)
async def get_enrollment(
    course_id: UUID,
    progress_service: ProgressServiceDep,
    user: CurrentUser,
) -> EnrollmentResponse:
    """Get enrollment status for a specific course."""
    enrollment = await progress_service.get_enrollment(UUID(str(user.id)), course_id)
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inscricao nao encontrada",
        )
    return EnrollmentResponse(
        course_id=enrollment.course_id,
        user_id=enrollment.user_id,
        status=enrollment.status,
        enrolled_at=enrollment.enrolled_at,
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
        progress_percent=enrollment.progress_percent,
        lessons_completed=enrollment.lessons_completed,
        lessons_total=enrollment.lessons_total,
        last_accessed_at=enrollment.last_accessed_at,
        last_lesson_id=enrollment.last_lesson_id,
        last_module_id=enrollment.last_module_id,
    )
