"""FastAPI dependencies for comment system.

Provides dependency injection for:
- Comment service
- Notification service (for @mentions)
- Auth service (for user lookup)
- Error handlers
- Permission checks
"""

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status

from src.auth.permissions import UserRole
from src.auth.service import AuthService
from src.notifications.service import NotificationService

from .service import (
    CommentError,
    CommentService,
)


async def get_comment_service(request: Request) -> CommentService:
    """Get comment service from app state.

    Args:
        request: FastAPI request

    Returns:
        CommentService instance
    """
    app_state = request.app.state
    if not hasattr(app_state, "comment_service") or not app_state.comment_service:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servico de comentarios nao disponivel",
        )
    return app_state.comment_service


async def get_notification_service(request: Request) -> NotificationService | None:
    """Get notification service from app state.

    Returns None if not available (notifications are optional).
    """
    app_state = request.app.state
    if hasattr(app_state, "notification_service") and app_state.notification_service:
        return app_state.notification_service
    return None


async def get_auth_service_for_comments(_request: Request) -> AuthService | None:
    """Get auth service from main app state for user lookups.

    Returns None if not available.
    """
    # Auth service is set via the getter pattern in main.py
    # We need to access it from the app_state
    # Note: Import here to avoid circular imports at module load time
    from src.main import app_state as main_app_state  # noqa: PLC0415

    return main_app_state.auth_service


# Type aliases for dependency injection
CommentServiceDep = Annotated[CommentService, Depends(get_comment_service)]
NotificationServiceDep = Annotated[
    NotificationService | None, Depends(get_notification_service)
]
AuthServiceDep = Annotated[AuthService | None, Depends(get_auth_service_for_comments)]


def handle_comment_error(error: CommentError) -> HTTPException:
    """Convert comment errors to HTTP exceptions.

    Args:
        error: Comment error

    Returns:
        HTTPException with appropriate status code
    """
    status_map = {
        "comment_not_found": status.HTTP_404_NOT_FOUND,
        "permission_denied": status.HTTP_403_FORBIDDEN,
        "rate_limit_exceeded": status.HTTP_429_TOO_MANY_REQUESTS,
        "spam_detected": status.HTTP_400_BAD_REQUEST,
        "edit_window_expired": status.HTTP_400_BAD_REQUEST,
    }

    status_code = status_map.get(error.code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    return HTTPException(
        status_code=status_code,
        detail=error.message,
    )


def is_moderator(user: Any) -> bool:
    """Check if user has moderator permissions.

    Moderators are ADMIN or TEACHER roles.

    Args:
        user: User from token

    Returns:
        True if user is moderator
    """
    user_role = UserRole(user.role) if isinstance(user.role, str) else user.role
    return user_role in (UserRole.ADMIN, UserRole.TEACHER)
