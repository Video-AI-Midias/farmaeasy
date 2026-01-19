"""FastAPI dependencies for authentication.

Provides dependency injection for:
- Current user extraction from JWT
- Role-based access control
- Permission checks
- API Key authentication for integrations
"""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError

from src.auth.permissions import UserRole, has_permission
from src.auth.schemas import UserResponse
from src.auth.security import decode_access_token
from src.config.settings import Settings, get_settings
from src.core.context import set_user_id


def get_token_from_header(request: Request) -> str | None:
    """Extract Bearer token from Authorization header.

    Args:
        request: FastAPI request

    Returns:
        Token string or None if not present
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    expected_parts = 2
    parts = auth_header.split()
    if len(parts) != expected_parts or parts[0].lower() != "bearer":
        return None

    return parts[1]


def get_refresh_token_from_cookie(
    request: Request,
) -> str | None:
    """Extract refresh token from httpOnly cookie.

    Args:
        request: FastAPI request

    Returns:
        Refresh token or None if not present
    """
    settings = get_settings()
    return request.cookies.get(settings.auth_cookie_name)


async def get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract client information for audit trail.

    Returns:
        Tuple of (user_agent, ip_address)
    """
    user_agent = request.headers.get("user-agent")

    # IP detection order: X-Forwarded-For > X-Real-IP > client.host
    ip_address = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip")
        or (request.client.host if request.client else None)
    )

    return user_agent, ip_address


async def get_current_user(
    token: Annotated[str | None, Depends(get_token_from_header)],
) -> UserResponse:
    """Get current authenticated user from JWT token.

    This is the main authentication dependency.
    Validates the access token and returns user information.

    Args:
        request: FastAPI request
        token: JWT access token from Authorization header

    Returns:
        UserResponse with user data

    Raises:
        HTTPException(401): If token is missing, invalid, or expired
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acesso nao fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    # Set user_id in context for logging
    user_id = payload["sub"]
    set_user_id(user_id)

    # Extract user data from token payload
    return UserResponse(
        id=user_id,
        email=payload["email"],
        role=payload["role"],
        # These fields come from token, may not have full data
        name="",  # Not stored in token
        phone="",  # Not stored in token
        is_active=True,  # Token wouldn't be valid if inactive
        created_at=payload.get("iat"),
    )


async def get_current_user_optional(
    token: Annotated[str | None, Depends(get_token_from_header)],
) -> UserResponse | None:
    """Get current user if authenticated, None otherwise.

    Use this for endpoints that work for both authenticated and anonymous users.

    Returns:
        UserResponse or None
    """
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        user_id = payload["sub"]

        # Set user_id in context for logging
        set_user_id(user_id)

        return UserResponse(
            id=user_id,
            email=payload["email"],
            role=payload["role"],
            name="",
            phone="",
            is_active=True,
            created_at=payload.get("iat"),
        )
    except JWTError:
        return None


def require_role(*allowed_roles: UserRole):
    """Create dependency requiring specific role(s).

    Args:
        *allowed_roles: Roles that are allowed (exact match)

    Returns:
        Dependency function

    Example:
        @router.get("/admin-only")
        async def admin_endpoint(
            user: Annotated[UserResponse, Depends(require_role(UserRole.ADMIN))]
        ):
            ...
    """

    async def role_checker(
        user: Annotated[UserResponse, Depends(get_current_user)],
    ) -> UserResponse:
        user_role = UserRole(user.role) if isinstance(user.role, str) else user.role

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissao insuficiente",
            )

        return user

    return role_checker


def require_permission(required_role: UserRole):
    """Create dependency requiring at least a permission level.

    Uses hierarchical comparison: ADMIN >= TEACHER >= STUDENT >= USER

    Args:
        required_role: Minimum required role level

    Returns:
        Dependency function

    Example:
        @router.get("/teacher-area")
        async def teacher_endpoint(
            user: Annotated[UserResponse, Depends(require_permission(UserRole.TEACHER))]
        ):
            # Accessible by TEACHER and ADMIN
            ...
    """

    async def permission_checker(
        user: Annotated[UserResponse, Depends(get_current_user)],
    ) -> UserResponse:
        if not has_permission(user.role, required_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissao insuficiente",
            )

        return user

    return permission_checker


# ==============================================================================
# Pre-built Role Dependencies
# ==============================================================================


def require_admin():
    """Require ADMIN role."""
    return require_role(UserRole.ADMIN)


def require_teacher():
    """Require TEACHER or ADMIN role."""
    return require_permission(UserRole.TEACHER)


def require_student():
    """Require STUDENT or higher role."""
    return require_permission(UserRole.STUDENT)


# ==============================================================================
# Type Aliases for Cleaner Code
# ==============================================================================

# Basic authenticated user
CurrentUser = Annotated[UserResponse, Depends(get_current_user)]

# Optional user (for endpoints that work both ways)
OptionalUser = Annotated[UserResponse | None, Depends(get_current_user_optional)]

# Role-specific dependencies
AdminUser = Annotated[UserResponse, Depends(require_admin())]
TeacherUser = Annotated[UserResponse, Depends(require_teacher())]
StudentUser = Annotated[UserResponse, Depends(require_student())]

# Client info for audit
ClientInfo = Annotated[tuple[str | None, str | None], Depends(get_client_info)]

# Refresh token from cookie
RefreshTokenCookie = Annotated[str | None, Depends(get_refresh_token_from_cookie)]


# ==============================================================================
# API Key Authentication (for integration endpoints)
# ==============================================================================


async def verify_master_api_key(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """Verify X-API-Key header against master API key.

    Used for integration endpoints that don't require user authentication.

    Args:
        request: FastAPI request
        settings: Application settings

    Returns:
        The validated API key

    Raises:
        HTTPException(401): If API key is missing
        HTTPException(403): If API key is invalid
        HTTPException(503): If API key is not configured
    """
    api_key = request.headers.get("X-API-Key")

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key required",
        )

    if not settings.master_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API Key authentication not configured",
        )

    # Timing-safe comparison to prevent timing attacks
    if not secrets.compare_digest(api_key, settings.master_api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API Key",
        )

    return api_key


# Master API Key dependency
MasterApiKey = Annotated[str, Depends(verify_master_api_key)]
