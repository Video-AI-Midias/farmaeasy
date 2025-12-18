"""Notification API routes.

Endpoints for:
- GET /v1/notifications - List user notifications
- GET /v1/notifications/unread-count - Get unread count
- POST /v1/notifications/mark-read - Mark specific as read
- POST /v1/notifications/mark-all-read - Mark all as read
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.auth.dependencies import get_current_user
from src.auth.models import User
from src.notifications.dependencies import get_notification_service
from src.notifications.schemas import (
    MarkReadRequest,
    MarkReadResponse,
    NotificationListResponse,
    UnreadCountResponse,
)
from src.notifications.service import NotificationService


router = APIRouter(
    prefix="/v1/notifications",
    tags=["notifications"],
)


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List user notifications",
    description="Get paginated list of notifications for the authenticated user.",
)
async def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationService, Depends(get_notification_service)],
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    cursor: str | None = Query(default=None, description="Pagination cursor"),
    unread_only: bool = Query(default=False, description="Only show unread"),
) -> NotificationListResponse:
    """List notifications for the current user."""
    return await service.get_notifications(
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
        unread_only=unread_only,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Get unread notification count",
    description="Get the number of unread notifications for the authenticated user.",
)
async def get_unread_count(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationService, Depends(get_notification_service)],
) -> UnreadCountResponse:
    """Get unread notification count."""
    count = await service.get_unread_count(user_id=current_user.id)
    return UnreadCountResponse(count=count)


@router.post(
    "/mark-read",
    response_model=MarkReadResponse,
    summary="Mark notifications as read",
    description="Mark specific notifications as read by their IDs.",
)
async def mark_notifications_read(
    body: MarkReadRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationService, Depends(get_notification_service)],
) -> MarkReadResponse:
    """Mark specific notifications as read."""
    marked_count = await service.mark_as_read(
        user_id=current_user.id,
        notification_ids=body.notification_ids,
    )
    unread_count = await service.get_unread_count(user_id=current_user.id)

    return MarkReadResponse(
        marked_count=marked_count,
        unread_count=unread_count,
    )


@router.post(
    "/mark-all-read",
    response_model=MarkReadResponse,
    summary="Mark all notifications as read",
    description="Mark all notifications as read for the authenticated user.",
)
async def mark_all_read(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[NotificationService, Depends(get_notification_service)],
) -> MarkReadResponse:
    """Mark all notifications as read."""
    marked_count = await service.mark_all_as_read(user_id=current_user.id)
    unread_count = await service.get_unread_count(user_id=current_user.id)

    return MarkReadResponse(
        marked_count=marked_count,
        unread_count=unread_count,
    )
