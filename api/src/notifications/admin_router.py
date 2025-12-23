"""Admin API routes for notifications.

Endpoints for (ADMIN ONLY):
- POST /v1/admin/notifications - Send to specific users
- POST /v1/admin/notifications/broadcast - Broadcast to all/role
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth.dependencies import AdminUser
from src.auth.permissions import UserRole
from src.auth.service import AuthService
from src.notifications.dependencies import get_notification_service
from src.notifications.schemas import (
    AdminBroadcastRequest,
    AdminNotificationRequest,
    AdminNotificationResponse,
)
from src.notifications.service import NotificationService


# Dependency injection setup
_auth_service_getter: Callable[[], AuthService] | None = None


def set_auth_service_getter(getter: Callable[[], AuthService]) -> None:
    """Set the AuthService getter function."""
    global _auth_service_getter  # noqa: PLW0603
    _auth_service_getter = getter


def get_auth_service() -> AuthService:
    """Get AuthService instance from app state."""
    if _auth_service_getter is None:
        msg = "AuthService getter not configured"
        raise RuntimeError(msg)
    return _auth_service_getter()


router = APIRouter(
    prefix="/v1/admin/notifications",
    tags=["admin-notifications"],
)


@router.post(
    "",
    response_model=AdminNotificationResponse,
    summary="Send notification to specific users",
    description="Send a system notification to a list of specific users. Admin only.",
)
async def send_notification_to_users(
    body: AdminNotificationRequest,
    _admin_user: AdminUser,  # Used for auth validation
    service: Annotated[NotificationService, Depends(get_notification_service)],
) -> AdminNotificationResponse:
    """Send notification to specific users."""
    sent_count = await service.broadcast_to_users(
        user_ids=body.user_ids,
        title=body.title,
        message=body.message,
    )

    return AdminNotificationResponse(
        success=True,
        sent_count=sent_count,
        message=f"Notificacao enviada para {sent_count} usuarios",
    )


@router.post(
    "/broadcast",
    response_model=AdminNotificationResponse,
    summary="Broadcast notification to all users or by role",
    description="Broadcast a system notification to all users or specific roles. Admin only.",
)
async def broadcast_notification(
    body: AdminBroadcastRequest,
    _admin_user: AdminUser,  # Used for auth validation
    service: Annotated[NotificationService, Depends(get_notification_service)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> AdminNotificationResponse:
    """Broadcast notification to all users or by role."""
    # Get users based on target
    target = body.target.lower()

    if target == "all":
        users = await auth_service.list_active_users()
    elif target == "students":
        users = await auth_service.list_users_by_role(UserRole.STUDENT)
    elif target == "teachers":
        users = await auth_service.list_users_by_role(UserRole.TEACHER)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target invalido: {body.target}. Use: all, students, teachers",
        )

    if not users:
        return AdminNotificationResponse(
            success=True,
            sent_count=0,
            message="Nenhum usuario encontrado para o target especificado",
        )

    # Extract user IDs
    user_ids = [user.id for user in users]

    # Broadcast notification
    sent_count = await service.broadcast_to_users(
        user_ids=user_ids,
        title=body.title,
        message=body.message,
    )

    target_label = {
        "all": "todos os usuarios",
        "students": "todos os alunos",
        "teachers": "todos os professores",
    }.get(target, target)

    return AdminNotificationResponse(
        success=True,
        sent_count=sent_count,
        message=f"Notificacao enviada para {target_label} ({sent_count} usuarios)",
    )
