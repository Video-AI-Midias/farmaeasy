"""Authentication API endpoints.

Provides routes for:
- User registration and login
- Token refresh and logout
- Profile management
- Validation endpoints
"""

import contextlib
from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from src.auth.dependencies import (
    AdminUser,
    ClientInfo,
    CurrentUser,
    RefreshTokenCookie,
)
from src.auth.permissions import UserRole, can_manage_role, is_admin
from src.auth.schemas import (
    AdminCreateUserRequest,
    ChangePasswordRequest,
    LastLessonInfo,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TokenResponse,
    UpdateMaxSessionsRequest,
    UpdateProfileRequest,
    UpdateRoleRequest,
    UserDetailsResponse,
    UserListResponse,
    UserProgressSummary,
    UserResponse,
    UserSessionInfo,
    ValidateCPFRequest,
    ValidateCPFResponse,
    ValidateEmailRequest,
    ValidateEmailResponse,
)
from src.auth.service import (
    AuthError,
    AuthService,
    InvalidCredentialsError,
    InvalidTokenError,
    SessionLimitExceededError,
    UserExistsError,
    UserInactiveError,
    UserNotFoundError,
)
from src.auth.validators import format_cpf, validate_cpf
from src.config.settings import get_settings


router = APIRouter(prefix="/v1/auth", tags=["auth"])


# ==============================================================================
# Dependency for AuthService
# ==============================================================================

# Module-level reference to be overridden by main.py
_auth_service_getter: Callable[[], AuthService] | None = None


def set_auth_service_getter(getter: Callable[[], AuthService]) -> None:
    """Set the auth service getter function.

    Called by main.py during app initialization.
    """
    global _auth_service_getter  # noqa: PLW0603 - Required for DI pattern
    _auth_service_getter = getter


def get_auth_service() -> AuthService:
    """Get AuthService instance.

    Uses the getter function set by main.py at startup.
    """
    if _auth_service_getter is None:
        raise RuntimeError(
            "AuthService not configured - call set_auth_service_getter first"
        )
    return _auth_service_getter()


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


# ==============================================================================
# Error Handling
# ==============================================================================


def handle_auth_error(error: AuthError) -> HTTPException:
    """Convert AuthError to HTTPException.

    For UserExistsError, returns structured detail with field info.
    For SessionLimitExceededError, returns session limit info.
    """
    status_map = {
        "invalid_credentials": status.HTTP_401_UNAUTHORIZED,
        "user_inactive": status.HTTP_403_FORBIDDEN,
        "user_not_found": status.HTTP_404_NOT_FOUND,
        "user_exists": status.HTTP_409_CONFLICT,
        "invalid_token": status.HTTP_401_UNAUTHORIZED,
        "permission_denied": status.HTTP_403_FORBIDDEN,
        "session_limit_exceeded": status.HTTP_429_TOO_MANY_REQUESTS,
        "auth_error": status.HTTP_400_BAD_REQUEST,
    }

    # Build detail - include field info for UserExistsError
    field = getattr(error, "field", None)
    if field:
        detail: str | dict[str, str | int | None] = {
            "message": error.message,
            "field": field,
        }
    # Include session limit info for SessionLimitExceededError
    elif isinstance(error, SessionLimitExceededError):
        detail = {
            "message": error.message,
            "code": error.code,
            "current_sessions": error.current_sessions,
            "max_sessions": error.max_sessions,
        }
    else:
        detail = error.message

    return HTTPException(
        status_code=status_map.get(error.code, status.HTTP_400_BAD_REQUEST),
        detail=detail,
    )


# ==============================================================================
# Public Endpoints (No Auth Required)
# ==============================================================================


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    responses={
        409: {"description": "Email or CPF already exists"},
        422: {"description": "Validation error"},
    },
)
async def register(
    data: RegisterRequest,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Register a new user account.

    Creates a user with role=USER. The user needs to subscribe
    to access course content.
    """
    try:
        user = await auth_service.register_user(data)
        return auth_service.to_response(user)
    except UserExistsError as e:
        raise handle_auth_error(e) from e


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User login",
    responses={
        401: {"description": "Invalid credentials"},
        403: {"description": "Account inactive"},
        429: {"description": "Session limit exceeded"},
    },
)
async def login(
    data: LoginRequest,
    response: Response,
    auth_service: AuthServiceDep,
    client_info: ClientInfo,
) -> TokenResponse:
    """Authenticate user and return tokens.

    Returns access token in response body.
    Sets refresh token in httpOnly cookie.
    """
    settings = get_settings()
    user_agent, ip_address = client_info

    try:
        user = await auth_service.authenticate_user(data.email, data.password)
        access_token, refresh_token = await auth_service.create_tokens(
            user, user_agent, ip_address
        )
    except (InvalidCredentialsError, UserInactiveError, SessionLimitExceededError) as e:
        raise handle_auth_error(e) from e

    # Set refresh token in httpOnly cookie
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=refresh_token,
        httponly=settings.auth_cookie_httponly,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=settings.auth_refresh_token_expire_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.auth_access_token_expire_minutes * 60,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh(
    response: Response,
    auth_service: AuthServiceDep,
    client_info: ClientInfo,
    refresh_token: RefreshTokenCookie,
) -> TokenResponse:
    """Refresh access token using refresh token from cookie.

    Implements token rotation: old refresh token is revoked,
    new one is issued.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token nao fornecido",
        )

    settings = get_settings()
    user_agent, ip_address = client_info

    try:
        access_token, new_refresh_token = await auth_service.refresh_tokens(
            refresh_token, user_agent, ip_address
        )
    except (InvalidTokenError, UserInactiveError) as e:
        # Clear invalid cookie
        response.delete_cookie(
            key=settings.auth_cookie_name,
            path="/api/v1/auth",
        )
        raise handle_auth_error(e) from e

    # Set new refresh token
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=new_refresh_token,
        httponly=settings.auth_cookie_httponly,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=settings.auth_refresh_token_expire_days * 24 * 60 * 60,
        path="/api/v1/auth",
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.auth_access_token_expire_minutes * 60,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="User logout",
)
async def logout(
    response: Response,
    auth_service: AuthServiceDep,
    refresh_token: RefreshTokenCookie,
) -> None:
    """Logout user by revoking refresh token.

    Clears the refresh token cookie.
    """
    settings = get_settings()

    # Revoke token if present (suppress error if already invalid)
    if refresh_token:
        with contextlib.suppress(InvalidTokenError):
            await auth_service.revoke_token(refresh_token)

    # Clear cookie
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/api/v1/auth",
    )


# ==============================================================================
# Validation Endpoints (No Auth Required)
# ==============================================================================


@router.post(
    "/validate/cpf",
    response_model=ValidateCPFResponse,
    summary="Validate CPF",
)
async def validate_cpf_endpoint(
    data: ValidateCPFRequest,
    auth_service: AuthServiceDep,
) -> ValidateCPFResponse:
    """Validate CPF format and check availability."""
    result = validate_cpf(data.cpf)

    if not result.valid:
        return ValidateCPFResponse(valid=False)

    # Check availability
    available = await auth_service.is_cpf_available(data.cpf)

    return ValidateCPFResponse(
        valid=True,
        formatted=format_cpf(data.cpf),
        available=available,
    )


@router.post(
    "/validate/email",
    response_model=ValidateEmailResponse,
    summary="Check email availability",
)
async def validate_email_endpoint(
    data: ValidateEmailRequest,
    auth_service: AuthServiceDep,
) -> ValidateEmailResponse:
    """Check if email is available for registration."""
    available = await auth_service.is_email_available(data.email)
    return ValidateEmailResponse(available=available)


# ==============================================================================
# Protected Endpoints (Auth Required)
# ==============================================================================


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
)
async def get_me(
    user: CurrentUser,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Get current authenticated user profile.

    Returns full user data from database (not just token claims).
    """
    db_user = await auth_service.get_user_by_id(UUID(str(user.id)))
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao encontrado",
        )

    return auth_service.to_response(db_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
async def update_me(
    data: UpdateProfileRequest,
    user: CurrentUser,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Update current user's profile fields."""
    try:
        updated_user = await auth_service.update_user_profile(
            user_id=UUID(str(user.id)),
            name=data.name,
            phone=data.phone,
            avatar_url=data.avatar_url,
        )
        return auth_service.to_response(updated_user)
    except UserNotFoundError as e:
        raise handle_auth_error(e) from e


@router.post(
    "/me/change-password",
    response_model=MessageResponse,
    summary="Change password",
)
async def change_password(
    data: ChangePasswordRequest,
    user: CurrentUser,
    auth_service: AuthServiceDep,
) -> MessageResponse:
    """Change current user's password."""
    try:
        await auth_service.change_password(
            user_id=UUID(str(user.id)),
            current_password=data.current_password,
            new_password=data.new_password,
        )
        return MessageResponse(message="Senha alterada com sucesso")
    except (UserNotFoundError, InvalidCredentialsError) as e:
        raise handle_auth_error(e) from e


@router.post(
    "/me/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout from all devices",
)
async def logout_all_devices(
    response: Response,
    user: CurrentUser,
    auth_service: AuthServiceDep,
) -> None:
    """Revoke all refresh tokens (logout from all devices)."""
    settings = get_settings()

    await auth_service.revoke_all_user_tokens(UUID(str(user.id)))

    # Clear current cookie
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/api/v1/auth",
    )


# ==============================================================================
# Admin Endpoints
# ==============================================================================


@router.patch(
    "/users/{user_id}/role",
    response_model=UserResponse,
    summary="Update user role (admin only)",
    responses={
        403: {"description": "Permission denied"},
        404: {"description": "User not found"},
    },
)
async def update_user_role(
    user_id: UUID,
    data: UpdateRoleRequest,
    admin: AdminUser,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Update another user's role.

    Admins can only assign roles below their own level.
    Cannot modify own role.
    Cannot modify other admin users.
    """
    # Cannot modify own role
    if str(admin.id) == str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao pode alterar o proprio role",
        )

    # Fetch target user to check their current role
    target_user = await auth_service.get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao encontrado",
        )

    # Cannot modify admin users (security protection)
    if is_admin(target_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao e permitido modificar usuarios administradores",
        )

    # Check if admin can assign this role
    admin_role = UserRole(admin.role)
    if not can_manage_role(admin_role, data.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Nao tem permissao para atribuir role '{data.role.value}'",
        )

    try:
        updated_user = await auth_service.update_user_role(user_id, data.role)
        return auth_service.to_response(updated_user)
    except UserNotFoundError as e:
        raise handle_auth_error(e) from e


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate user (admin only)",
    responses={
        403: {"description": "Permission denied"},
        404: {"description": "User not found"},
    },
)
async def deactivate_user(
    user_id: UUID,
    admin: AdminUser,
    auth_service: AuthServiceDep,
) -> None:
    """Deactivate a user account.

    Cannot deactivate own account.
    Cannot deactivate admin users.
    """
    # Cannot deactivate own account
    if str(admin.id) == str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao pode desativar a propria conta",
        )

    # Fetch target user to check their role
    target_user = await auth_service.get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao encontrado",
        )

    # Cannot deactivate admin users (security protection)
    if is_admin(target_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao e permitido desativar usuarios administradores",
        )

    try:
        await auth_service.deactivate_user(user_id)
    except UserNotFoundError as e:
        raise handle_auth_error(e) from e


@router.get(
    "/users",
    response_model=UserListResponse,
    summary="List/search users (admin only)",
    responses={
        403: {"description": "Permission denied"},
    },
)
async def list_users(
    _admin: AdminUser,
    auth_service: AuthServiceDep,
    search: str | None = None,
    role: UserRole | None = None,
    limit: int = 50,
) -> UserListResponse:
    """List or search users.

    Args:
        search: Search term (matches email or name)
        role: Filter by role
        limit: Max results (default 50)
    """
    users = await auth_service.search_users(search=search, role=role, limit=limit)
    return UserListResponse(
        items=[auth_service.to_response(u) for u in users],
        total=len(users),
    )


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create user (admin only)",
    responses={
        403: {"description": "Permission denied"},
        409: {"description": "Email or CPF already exists"},
        422: {"description": "Validation error"},
    },
)
async def admin_create_user(
    data: AdminCreateUserRequest,
    _admin: AdminUser,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Create a new user (admin only).

    Only email and password are required.
    All other fields are optional.
    """
    try:
        user = await auth_service.admin_create_user(data)
        return auth_service.to_response(user)
    except UserExistsError as e:
        raise handle_auth_error(e) from e


@router.patch(
    "/users/{user_id}/max-sessions",
    response_model=UserResponse,
    summary="Update user max concurrent sessions (admin only)",
    responses={
        403: {"description": "Permission denied"},
        404: {"description": "User not found"},
    },
)
async def update_user_max_sessions(
    user_id: UUID,
    data: UpdateMaxSessionsRequest,
    admin: AdminUser,
    auth_service: AuthServiceDep,
) -> UserResponse:
    """Update user's maximum concurrent sessions limit.

    Args:
        user_id: Target user ID
        data: New max sessions limit (1-100, or null for default)

    Cannot modify own session limit.
    Cannot modify admin users.
    """
    # Cannot modify own session limit
    if str(admin.id) == str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao pode alterar o proprio limite de sessoes",
        )

    # Fetch target user to check their role
    target_user = await auth_service.get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao encontrado",
        )

    # Cannot modify admin users (security protection)
    if is_admin(target_user.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nao e permitido modificar usuarios administradores",
        )

    try:
        updated_user = await auth_service.update_user_max_sessions(
            user_id, data.max_concurrent_sessions
        )
        return auth_service.to_response(updated_user)
    except UserNotFoundError as e:
        raise handle_auth_error(e) from e


@router.get(
    "/users/{user_id}/details",
    response_model=UserDetailsResponse,
    summary="Get extended user details (admin only)",
    responses={
        403: {"description": "Permission denied"},
        404: {"description": "User not found"},
    },
)
async def get_user_details(
    user_id: UUID,
    request: Request,
    _admin: AdminUser,
    auth_service: AuthServiceDep,
) -> UserDetailsResponse:
    """Get extended user details for admin panel.

    Returns:
        - Basic user info
        - Session info (active count, max allowed, first/last access)
        - Progress summary (courses, lessons, watch time)
        - Comments count

    Requires admin permissions.
    """
    # Fetch user
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao encontrado",
        )

    # Get session info
    active_sessions = await auth_service.count_active_sessions(user_id)
    max_sessions = user.max_concurrent_sessions or 10
    first_access, last_access = await auth_service.get_session_access_times(user_id)

    session_info = UserSessionInfo(
        active_sessions=active_sessions,
        max_sessions=max_sessions,
        first_access=first_access,
        last_access=last_access,
    )

    # Get progress summary (if service available)
    progress_data: dict = {}
    app_state = request.app.state
    if hasattr(app_state, "progress_service") and app_state.progress_service:
        progress_data = await app_state.progress_service.get_user_progress_summary(
            user_id
        )

    last_lesson = None
    if progress_data.get("last_lesson"):
        last_lesson = LastLessonInfo(**progress_data["last_lesson"])

    progress = UserProgressSummary(
        total_courses_enrolled=progress_data.get("total_courses_enrolled", 0),
        total_lessons_completed=progress_data.get("total_lessons_completed", 0),
        total_lessons_total=progress_data.get("total_lessons_total", 0),
        total_watch_time_seconds=progress_data.get("total_watch_time_seconds", 0),
        last_lesson=last_lesson,
    )

    # Get comments count (if service available)
    comments_count = 0
    if hasattr(app_state, "comment_service") and app_state.comment_service:
        comments_count = await app_state.comment_service.count_comments_by_author(
            user_id
        )

    return UserDetailsResponse(
        user=auth_service.to_response(user),
        session_info=session_info,
        progress=progress,
        comments_count=comments_count,
    )
