"""Dependency injection for attachments module.

Uses the same global getter pattern as other modules (courses, notifications, etc.)
The getter is configured by main.py during application startup.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends

from src.attachments.service import AttachmentsService


# ==============================================================================
# Service Getter (set by main.py)
# ==============================================================================

_attachments_service_getter: Callable[[], AttachmentsService] | None = None


def set_attachments_service_getter(getter: Callable[[], AttachmentsService]) -> None:
    """Set the attachments service getter function."""
    global _attachments_service_getter
    _attachments_service_getter = getter


def get_attachments_service() -> AttachmentsService:
    """Get AttachmentsService instance from app state."""
    if _attachments_service_getter is None:
        msg = "AttachmentsService not configured"
        raise RuntimeError(msg)
    return _attachments_service_getter()


# ==============================================================================
# Type Alias for Dependency Injection
# ==============================================================================

AttachmentsServiceDep = Annotated[AttachmentsService, Depends(get_attachments_service)]
