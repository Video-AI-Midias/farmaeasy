"""Pydantic schemas for notifications.

Request and response models for notification operations.
"""

import base64
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.notifications.models import Notification, NotificationType


# ==============================================================================
# Response Schemas
# ==============================================================================


class NotificationResponse(BaseModel):
    """Single notification response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Notification ID")
    type: NotificationType = Field(description="Notification type")
    title: str = Field(description="Notification title")
    message: str = Field(description="Notification message/preview")
    actor: dict | None = Field(None, description="User who triggered the notification")
    reference: dict | None = Field(None, description="Reference to related content")
    is_read: bool = Field(description="Whether notification was read")
    read_at: datetime | None = Field(None, description="When notification was read")
    created_at: datetime = Field(description="When notification was created")

    @classmethod
    def from_notification(cls, notification: Notification) -> "NotificationResponse":
        """Create response from notification entity."""
        actor = None
        if notification.actor_id:
            actor = {
                "id": notification.actor_id,
                "name": notification.actor_name,
                "avatar": notification.actor_avatar,
            }

        reference = None
        if notification.reference_id:
            reference = {
                "id": notification.reference_id,
                "type": notification.reference_type,
                "url": notification.reference_url,
                "lesson_id": notification.lesson_id,
                "course_slug": notification.course_slug,
                "lesson_slug": notification.lesson_slug,
            }

        return cls(
            id=notification.notification_id,
            type=notification.type,
            title=notification.title,
            message=notification.message,
            actor=actor,
            reference=reference,
            is_read=notification.is_read,
            read_at=notification.read_at,
            created_at=notification.created_at,
        )


class NotificationListResponse(BaseModel):
    """Paginated notification list response."""

    items: list[NotificationResponse] = Field(description="List of notifications")
    total: int = Field(description="Total notification count")
    unread_count: int = Field(description="Unread notification count")
    has_more: bool = Field(description="Whether more notifications exist")
    next_cursor: str | None = Field(None, description="Cursor for next page")


class UnreadCountResponse(BaseModel):
    """Unread notification count response."""

    count: int = Field(description="Number of unread notifications")


class MarkReadResponse(BaseModel):
    """Response after marking notifications as read."""

    marked_count: int = Field(description="Number of notifications marked as read")
    unread_count: int = Field(description="Remaining unread count")


# ==============================================================================
# Request Schemas
# ==============================================================================


class MarkReadRequest(BaseModel):
    """Request to mark specific notifications as read."""

    notification_ids: list[UUID] = Field(
        description="List of notification IDs to mark as read"
    )


class AdminNotificationRequest(BaseModel):
    """Request to create a system notification for specific users (admin only)."""

    title: str = Field(
        min_length=1,
        max_length=200,
        description="Notification title",
    )
    message: str = Field(
        min_length=1,
        max_length=1000,
        description="Notification message",
    )
    user_ids: list[UUID] = Field(
        min_length=1,
        description="List of user IDs to notify",
    )


class AdminBroadcastRequest(BaseModel):
    """Request to broadcast a system notification (admin only)."""

    title: str = Field(
        min_length=1,
        max_length=200,
        description="Notification title",
    )
    message: str = Field(
        min_length=1,
        max_length=1000,
        description="Notification message",
    )
    target: str = Field(
        default="all",
        description="Target audience: 'all', 'students', 'teachers'",
    )


class AdminNotificationResponse(BaseModel):
    """Response after sending admin notification."""

    success: bool = Field(description="Whether notification was sent successfully")
    sent_count: int = Field(description="Number of notifications sent")
    message: str = Field(description="Status message")


# ==============================================================================
# Cursor Encoding/Decoding
# ==============================================================================


def encode_cursor(created_at: datetime, notification_id: UUID) -> str:
    """Encode pagination cursor."""
    cursor_str = f"{created_at.isoformat()}|{notification_id}"
    return base64.urlsafe_b64encode(cursor_str.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    """Decode pagination cursor."""
    try:
        cursor_str = base64.urlsafe_b64decode(cursor.encode()).decode()
        parts = cursor_str.split("|")
        created_at = datetime.fromisoformat(parts[0])
        notification_id = UUID(parts[1])
        return created_at, notification_id
    except (ValueError, IndexError) as e:
        msg = f"Invalid cursor format: {e}"
        raise ValueError(msg) from e
