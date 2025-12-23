"""HTTP endpoints for course acquisitions.

Provides:
- POST /v1/acquisitions/enroll/{course_id} - Self-enroll in free course
- GET  /v1/acquisitions/my - List user's acquisitions
- GET  /v1/acquisitions/check/{course_id} - Check access to course
- Admin/Teacher endpoints for granting/revoking access
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth.dependencies import (
    CurrentUser,
    require_admin,
    require_student,
    require_teacher,
)
from src.auth.models import User
from src.courses.dependencies import CourseServiceDep, is_owner_or_admin

from .dependencies import AcquisitionServiceDep, AuthServiceDep
from .schemas import (
    AcquisitionListResponse,
    AcquisitionResponse,
    BatchGrantAccessRequest,
    BatchGrantAccessResponse,
    CheckAccessResponse,
    CourseStudentResponse,
    CourseStudentsListResponse,
    GrantAccessRequest,
    RevokeAccessRequest,
)


router = APIRouter(prefix="/v1/acquisitions", tags=["acquisitions"])
admin_router = APIRouter(prefix="/v1/admin/acquisitions", tags=["admin-acquisitions"])


# ==============================================================================
# Student Endpoints
# ==============================================================================


@router.post(
    "/enroll/{course_id}",
    response_model=AcquisitionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll in a free course",
)
async def enroll_in_course(
    course_id: UUID,
    service: AcquisitionServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_student)],
) -> AcquisitionResponse:
    """Enroll the current user in a free course.

    Requirements:
    - User must be a student or higher role
    - Course must be free (is_free=True)
    - User must not already have access
    """
    try:
        acquisition = await service.enroll_free(
            user_id=current_user.id,
            course_id=course_id,
        )
        return AcquisitionResponse.from_acquisition(acquisition)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e


@router.get(
    "/my",
    response_model=AcquisitionListResponse,
    summary="List my acquisitions",
)
async def list_my_acquisitions(
    service: AcquisitionServiceDep,
    current_user: CurrentUser,
    active_only: bool = False,
) -> AcquisitionListResponse:
    """List all course acquisitions for the current user."""
    return await service.get_user_acquisitions(
        user_id=current_user.id,
        active_only=active_only,
    )


@router.get(
    "/check/{course_id}",
    response_model=CheckAccessResponse,
    summary="Check access to a course",
)
async def check_course_access(
    course_id: UUID,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    current_user: CurrentUser,
) -> CheckAccessResponse:
    """Check if the current user has access to a specific course.

    Access hierarchy:
    1. Admin: Always has access (preview mode)
    2. Teacher: Has access to own courses (preview mode)
    3. Student: Has access via acquisition only
    """
    # Fetch course to get creator_id
    course = course_service.get_course(course_id)
    course_creator_id = course.creator_id if course else None

    return await service.check_access(
        user_id=current_user.id,
        course_id=course_id,
        user_role=current_user.role,
        course_creator_id=course_creator_id,
    )


# ==============================================================================
# Admin Endpoints
# ==============================================================================


@admin_router.post(
    "/grant",
    response_model=AcquisitionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Grant course access to a user",
)
async def grant_access(
    request: GrantAccessRequest,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_teacher)],
) -> AcquisitionResponse:
    """Grant access to a course for a specific user.

    Permissions:
    - ADMIN: Can grant access to any course
    - TEACHER: Can grant access only to own courses

    Can grant:
    - Permanent access (expires_in_days=None)
    - Temporary access (expires_in_days > 0)
    """
    # Verify course exists and user has permission
    course = course_service.get_course(request.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not is_owner_or_admin(current_user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para conceder acesso a este curso",
        )

    try:
        acquisition = await service.grant_access(
            user_id=request.user_id,
            course_id=request.course_id,
            granted_by=current_user.id,
            expires_in_days=request.expires_in_days,
            notes=request.notes,
        )
        return AcquisitionResponse.from_acquisition(acquisition)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e


@admin_router.post(
    "/grant/batch",
    response_model=BatchGrantAccessResponse,
    summary="Grant course access to multiple users",
)
async def batch_grant_access(
    request: BatchGrantAccessRequest,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_teacher)],
) -> BatchGrantAccessResponse:
    """Grant access to multiple users at once.

    Permissions:
    - ADMIN: Can grant access to any course
    - TEACHER: Can grant access only to own courses
    """
    # Verify course exists and user has permission
    course = course_service.get_course(request.course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not is_owner_or_admin(current_user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para conceder acesso a este curso",
        )

    granted, skipped, errors = await service.batch_grant_access(
        user_ids=request.user_ids,
        course_id=request.course_id,
        granted_by=current_user.id,
        expires_in_days=request.expires_in_days,
        notes=request.notes,
    )

    return BatchGrantAccessResponse(
        granted=granted,
        skipped=skipped,
        errors=errors,
    )


@admin_router.delete(
    "/{user_id}/course/{course_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke course access from a user",
)
async def revoke_access(
    user_id: UUID,
    course_id: UUID,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_teacher)],
    request: RevokeAccessRequest | None = None,
) -> dict:
    """Revoke a user's access to a course.

    Permissions:
    - ADMIN: Can revoke access from any course
    - TEACHER: Can revoke access only from own courses
    """
    # Verify course exists and user has permission
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not is_owner_or_admin(current_user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para revogar acesso deste curso",
        )

    reason = request.reason if request else None
    revoked = await service.revoke_access(
        user_id=user_id,
        course_id=course_id,
        reason=reason,
    )

    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active access found to revoke",
        )

    return {"message": "Access revoked successfully"}


@admin_router.get(
    "/course/{course_id}/students",
    response_model=CourseStudentsListResponse,
    summary="List students with course access",
)
async def list_course_students(
    course_id: UUID,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    auth_service: AuthServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_teacher)],
    limit: int = 100,
) -> CourseStudentsListResponse:
    """List all users with access to a specific course.

    Permissions:
    - ADMIN: Can view students from any course
    - TEACHER: Can view students only from own courses

    Returns full user information (name, email, avatar) along with
    acquisition details (type, status, dates).
    """
    # Verify course exists and user has permission
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not is_owner_or_admin(current_user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para visualizar alunos deste curso",
        )
    acquisitions = await service.get_course_students(
        course_id=course_id,
        limit=limit,
    )

    # Fetch user data for each acquisition
    items: list[CourseStudentResponse] = []
    active_count = 0

    for acq in acquisitions:
        # Get user data
        user = auth_service.get_user_by_id(acq.user_id)

        if not user:
            # Skip if user not found (should not happen in normal operation)
            continue

        # Build response with user + acquisition data
        items.append(
            CourseStudentResponse(
                user_id=acq.user_id,
                user_name=user.name or user.email,
                user_email=user.email,
                user_avatar=user.avatar_url,
                acquisition_type=acq.acquisition_type,
                status=acq.status,
                granted_at=acq.granted_at,
                expires_at=acq.expires_at,
                is_active=acq.is_active(),
            )
        )

        if acq.is_active():
            active_count += 1

    return CourseStudentsListResponse(
        items=items,
        total=len(items),
        active_count=active_count,
        has_more=len(items) >= limit,
    )


@admin_router.get(
    "/user/{user_id}",
    response_model=AcquisitionListResponse,
    summary="List user's acquisitions",
)
async def list_user_acquisitions(
    user_id: UUID,
    service: AcquisitionServiceDep,
    _: Annotated[User, Depends(require_admin)],
    active_only: bool = False,
) -> AcquisitionListResponse:
    """List all course acquisitions for a specific user (admin only)."""
    return await service.get_user_acquisitions(
        user_id=user_id,
        active_only=active_only,
    )


@admin_router.get(
    "/course/{course_id}/count",
    summary="Count students with course access",
)
async def count_course_students(
    course_id: UUID,
    service: AcquisitionServiceDep,
    course_service: CourseServiceDep,
    current_user: CurrentUser,
    _: Annotated[User, Depends(require_teacher)],
) -> dict:
    """Count users with access to a specific course.

    Permissions:
    - ADMIN: Can count students from any course
    - TEACHER: Can count students only from own courses
    """
    # Verify course exists and user has permission
    course = course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso nao encontrado",
        )

    if not is_owner_or_admin(current_user, course.creator_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para visualizar dados deste curso",
        )

    count = await service.count_course_students(course_id)
    return {"course_id": str(course_id), "student_count": count}
