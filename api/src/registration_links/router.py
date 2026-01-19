"""FastAPI router for registration links.

Endpoints:
- POST /v1/registration-links (API Key protected) - Create link
- GET /v1/registration-links (Teacher+) - List my links
- DELETE /v1/registration-links/{id} (Teacher+) - Revoke link
- POST /v1/register/{shortcode}/validate (Public) - Validate link
- POST /v1/register/{shortcode}/complete (Public) - Complete registration
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, status

from src.auth.dependencies import (
    MasterApiKey,
    TeacherUser,
)
from src.config.settings import get_settings

from .dependencies import (
    ClientInfoDep,
    RateLimitRegister,
    RateLimitValidate,
    RegistrationLinkServiceDep,
)
from .models import LinkStatus
from .schemas import (
    CompleteRegistrationRequest,
    CompleteRegistrationResponse,
    CoursePreview,
    CreateRegistrationLinkRequest,
    RegistrationLinkListResponse,
    RegistrationLinkResponse,
    ValidateLinkRequest,
    ValidateLinkResponse,
)
from .service import (
    CourseGrantError,
    DatabaseError,
    DuplicateUserError,
    LinkAlreadyUsedError,
    LinkExpiredError,
    LinkNotFoundError,
    LinkRevokedError,
)


# ==============================================================================
# Admin Router (API Key or Teacher+ protected)
# ==============================================================================

router = APIRouter(
    prefix="/v1/registration-links",
    tags=["registration-links"],
)


@router.post(
    "",
    response_model=RegistrationLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create registration link",
    description="Create a new registration link for WhatsApp customers. Requires API Key.",
)
async def create_registration_link(
    request: CreateRegistrationLinkRequest,
    _api_key: MasterApiKey,
    service: RegistrationLinkServiceDep,
) -> RegistrationLinkResponse:
    """Create a new registration link.

    Requires API Key authentication (X-API-Key header).
    """
    settings = get_settings()

    link, token = await service.create_link(
        course_ids=request.course_ids,
        expires_in_days=request.expires_in_days,
        prefill_phone=request.prefill_phone,
        notes=request.notes,
        source=request.source,
    )

    return RegistrationLinkResponse.from_link(
        link,
        base_url=settings.registration_link_base_url,
        token=token,
    )


@router.get(
    "",
    response_model=RegistrationLinkListResponse,
    summary="List registration links",
    description="List registration links. Teachers see only their own, admins see all.",
)
async def list_registration_links(
    current_user: TeacherUser,
    service: RegistrationLinkServiceDep,
    status_filter: LinkStatus | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
) -> RegistrationLinkListResponse:
    """List registration links."""
    settings = get_settings()

    # Teachers see only their links, admins see all
    created_by = current_user.id if current_user.role != "admin" else None

    links = await service.list_links(
        created_by=created_by,
        status=status_filter,
        limit=limit,
    )

    items = [
        RegistrationLinkResponse.from_link(
            link, base_url=settings.registration_link_base_url
        )
        for link in links
    ]

    return RegistrationLinkListResponse(
        items=items,
        total=len(items),
        has_more=len(items) >= limit,
    )


@router.delete(
    "/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke registration link",
    description="Revoke a pending registration link.",
)
async def revoke_registration_link(
    link_id: UUID,
    current_user: TeacherUser,
    service: RegistrationLinkServiceDep,
) -> None:
    """Revoke a registration link."""
    # Get link first to check ownership
    link = await service.get_link_by_id(link_id)

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    # Teachers can only revoke their own links
    if current_user.role != "admin" and link.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only revoke your own links",
        )

    success = await service.revoke_link(link_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link cannot be revoked (already used or expired)",
        )


@router.get(
    "/{link_id}",
    response_model=RegistrationLinkResponse,
    summary="Get registration link details",
    description="Get details of a specific registration link.",
)
async def get_registration_link(
    link_id: UUID,
    current_user: TeacherUser,
    service: RegistrationLinkServiceDep,
) -> RegistrationLinkResponse:
    """Get registration link details."""
    settings = get_settings()

    link = await service.get_link_by_id(link_id)

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    # Teachers can only view their own links
    if current_user.role != "admin" and link.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own links",
        )

    return RegistrationLinkResponse.from_link(
        link,
        base_url=settings.registration_link_base_url,
    )


# ==============================================================================
# Public Router (for registration flow)
# ==============================================================================

public_router = APIRouter(
    prefix="/v1/register",
    tags=["registration"],
)


@public_router.post(
    "/{shortcode}/validate",
    response_model=ValidateLinkResponse,
    summary="Validate registration link",
    description="Validate a registration link and get course information. "
    "Token is passed in the request body for security.",
)
async def validate_registration_link(
    shortcode: str,
    request: ValidateLinkRequest,
    service: RegistrationLinkServiceDep,
    _rate_limit: RateLimitValidate,
) -> ValidateLinkResponse:
    """Validate a registration link.

    The token is passed in the request body (not URL) to prevent:
    - Logging in server access logs
    - Browser history exposure
    - Referer header leaks
    - Proxy log visibility
    """
    token = request.token
    try:
        link, courses = await service.get_link_for_display(shortcode, token)

        return ValidateLinkResponse(
            valid=True,
            shortcode=link.shortcode,
            status=link.status,
            expires_at=link.expires_at,
            courses=courses,
            prefill_phone=link.prefill_phone,
        )

    except LinkNotFoundError:
        return ValidateLinkResponse(
            valid=False,
            shortcode=shortcode,
            status=LinkStatus.PENDING,
            error="Link not found",
        )

    except LinkExpiredError:
        return ValidateLinkResponse(
            valid=False,
            shortcode=shortcode,
            status=LinkStatus.EXPIRED,
            error="This link has expired",
        )

    except LinkAlreadyUsedError:
        return ValidateLinkResponse(
            valid=False,
            shortcode=shortcode,
            status=LinkStatus.USED,
            error="This link has already been used",
        )

    except LinkRevokedError:
        return ValidateLinkResponse(
            valid=False,
            shortcode=shortcode,
            status=LinkStatus.REVOKED,
            error="This link has been revoked",
        )

    except ValueError:
        return ValidateLinkResponse(
            valid=False,
            shortcode=shortcode,
            status=LinkStatus.PENDING,
            error="Invalid link",
        )


@public_router.post(
    "/{shortcode}/complete",
    response_model=CompleteRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Complete registration",
    description="Complete registration using a valid link.",
)
async def complete_registration(
    shortcode: str,
    request: CompleteRegistrationRequest,
    _http_request: Request,  # Reserved for future audit logging
    service: RegistrationLinkServiceDep,
    client_info: ClientInfoDep,
    _rate_limit: RateLimitRegister = ...,
) -> CompleteRegistrationResponse:
    """Complete registration using a link.

    This endpoint:
    1. Validates the link
    2. Creates the user account
    3. Grants access to the courses
    4. Returns an access token for immediate login
    """
    user_agent = client_info.user_agent
    ip_address = client_info.ip_address

    try:
        user, courses, access_token = await service.complete_registration(
            shortcode=shortcode,
            request=request,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return CompleteRegistrationResponse(
            success=True,
            user_id=user.id,
            email=user.email,
            name=user.name,
            courses_granted=courses,
            access_token=access_token,
        )

    except LinkNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        ) from None

    except LinkExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This link has expired",
        ) from None

    except LinkAlreadyUsedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This link has already been used",
        ) from None

    except LinkRevokedError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This link has been revoked",
        ) from None

    except DuplicateUserError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from None

    except CourseGrantError as e:
        # User was created but some/all course grants failed
        # This is a partial success - user can still login
        # Return 207 Multi-Status with access_token so user can login
        user = getattr(e, "user", None)
        access_token = getattr(e, "access_token", None)

        if not user or not access_token:
            # This shouldn't happen, but if it does, return 500
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed due to an internal error.",
            ) from None

        # Build list of granted courses as CoursePreview
        granted_courses = [
            CoursePreview(id=cid, title="Course") for cid in e.granted_courses
        ]

        return CompleteRegistrationResponse(
            success=True,  # User was created successfully
            user_id=user.id,
            email=user.email,
            name=user.name,
            courses_granted=granted_courses,
            access_token=access_token,
            message="Cadastro realizado, mas alguns cursos não foram liberados.",
            partial_success=True,
            failed_courses=e.failed_courses,
            warning=(
                "Seu cadastro foi concluído, mas não conseguimos liberar "
                f"{len(e.failed_courses)} curso(s). Por favor, entre em contato "
                "com o suporte para resolver esta pendência."
            ),
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from None

    except DatabaseError as e:
        # Log the original error for debugging
        # The exception already logged details via logger.exception
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
            headers={"Retry-After": "30"},  # Suggest retry after 30 seconds
        ) from None
