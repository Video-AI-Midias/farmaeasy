"""Dependencies for notification routes.

Provides:
- NotificationService dependency injection
- User lookup by name functionality
"""

from collections.abc import Callable

from fastapi import Request

from src.notifications.service import NotificationService


# Service getter function (set by main.py)
_notification_service_getter: Callable[[], NotificationService] | None = None


def set_notification_service_getter(
    getter: Callable[[], NotificationService],
) -> None:
    """Set the notification service getter function."""
    global _notification_service_getter  # noqa: PLW0603 - Required for DI pattern
    _notification_service_getter = getter


def get_notification_service(request: Request) -> NotificationService:
    """Get NotificationService instance.

    Tries request.app.state first, then falls back to getter function.
    """
    # Try app.state first
    if hasattr(request.app.state, "notification_service"):
        return request.app.state.notification_service

    # Fall back to getter
    if _notification_service_getter is not None:
        return _notification_service_getter()

    msg = "NotificationService not configured"
    raise RuntimeError(msg)
