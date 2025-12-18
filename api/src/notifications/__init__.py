"""Notifications module for user notifications.

Provides:
- Notification creation for mentions, replies, reactions
- Notification listing and pagination
- Mark as read/unread functionality
- Unread count tracking

Note: Router is imported directly in main.py to avoid circular imports.
"""

from src.notifications.models import (
    NOTIFICATIONS_TABLES_CQL,
    Notification,
    NotificationType,
)
from src.notifications.schemas import (
    NotificationListResponse,
    NotificationResponse,
)
from src.notifications.service import NotificationService


__all__ = [
    "NOTIFICATIONS_TABLES_CQL",
    "Notification",
    "NotificationListResponse",
    "NotificationResponse",
    "NotificationService",
    "NotificationType",
]
