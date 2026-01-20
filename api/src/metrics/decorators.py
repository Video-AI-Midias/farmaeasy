"""Decorators for tracking business events.

Provides @track_event decorator for automatic metric emission
on function calls with minimal code changes.
"""

from __future__ import annotations

import functools
import inspect
from typing import TYPE_CHECKING, Any, ParamSpec, TypeVar
from uuid import UUID as UUIDType

import structlog

from .emitter import get_metrics_emitter
from .models import EventType


if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID


logger = structlog.get_logger(__name__)

P = ParamSpec("P")
T = TypeVar("T")


def track_event(
    event_name: str,
    event_type: str = EventType.BUSINESS,
    extract_user_id: str | None = "user_id",
    extract_course_id: str | None = "course_id",
    extract_lesson_id: str | None = "lesson_id",
    include_result: bool = False,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator to track function calls as metric events.

    Automatically emits a metric event when the decorated function is called.
    Can extract IDs from function parameters or return value.

    Args:
        event_name: Name of the event (e.g., 'enrollment_created')
        event_type: Event type (default: 'business')
        extract_user_id: Parameter name to extract user_id from
        extract_course_id: Parameter name to extract course_id from
        extract_lesson_id: Parameter name to extract lesson_id from
        include_result: If True, extract IDs from return value

    Returns:
        Decorated function

    Example:
        @track_event("enrollment_created")
        async def create_enrollment(user_id: UUID, course_id: UUID):
            ...

        @track_event("lesson_completed", extract_lesson_id="lesson.id")
        async def complete_lesson(lesson: Lesson, user_id: UUID):
            ...
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        # Get function signature for parameter extraction
        sig = inspect.signature(func)
        param_names = list(sig.parameters.keys())

        @functools.wraps(func)
        async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Execute the function first
            result = await func(*args, **kwargs)

            # Emit metric event (fire-and-forget)
            _emit_event(
                event_name=event_name,
                event_type=event_type,
                args=args,
                kwargs=kwargs,
                param_names=param_names,
                result=result if include_result else None,
                extract_user_id=extract_user_id,
                extract_course_id=extract_course_id,
                extract_lesson_id=extract_lesson_id,
            )

            return result

        @functools.wraps(func)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Execute the function first
            result = func(*args, **kwargs)

            # Emit metric event (fire-and-forget)
            _emit_event(
                event_name=event_name,
                event_type=event_type,
                args=args,
                kwargs=kwargs,
                param_names=param_names,
                result=result if include_result else None,
                extract_user_id=extract_user_id,
                extract_course_id=extract_course_id,
                extract_lesson_id=extract_lesson_id,
            )

            return result

        # Return appropriate wrapper based on function type
        if inspect.iscoroutinefunction(func):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]

    return decorator


def _emit_event(
    event_name: str,
    event_type: str,  # noqa: ARG001 - reserved for future event type routing
    args: tuple,
    kwargs: dict,
    param_names: list[str],
    result: Any | None,
    extract_user_id: str | None,
    extract_course_id: str | None,
    extract_lesson_id: str | None,
) -> None:
    """Emit metric event with extracted IDs.

    Args:
        event_name: Event name
        event_type: Event type (reserved for future event type routing)
        args: Function positional arguments
        kwargs: Function keyword arguments
        param_names: Parameter names from signature
        result: Function return value (if include_result=True)
        extract_user_id: Path to extract user_id
        extract_course_id: Path to extract course_id
        extract_lesson_id: Path to extract lesson_id
    """
    emitter = get_metrics_emitter()
    if not emitter:
        return

    # Build combined args dict (args may be shorter than param_names for default args)
    all_args = dict(zip(param_names, args, strict=False))
    all_args.update(kwargs)

    # Extract IDs
    user_id = _extract_value(all_args, result, extract_user_id)
    course_id = _extract_value(all_args, result, extract_course_id)
    lesson_id = _extract_value(all_args, result, extract_lesson_id)

    # Emit event
    try:
        emitter.emit_business(
            event_name=event_name,
            user_id=user_id,
            course_id=course_id,
            lesson_id=lesson_id,
        )
    except Exception:
        # Never fail the main function due to metrics
        logger.debug("metrics_emit_error", event_name=event_name)


def _extract_value(
    args: dict,
    result: Any | None,
    path: str | None,
) -> UUID | None:
    """Extract a value from args or result using dot notation.

    Args:
        args: Function arguments dict
        result: Function return value
        path: Dot-separated path (e.g., 'user_id' or 'result.user.id')

    Returns:
        Extracted UUID or None
    """
    if not path:
        return None

    # Check if extracting from result
    if path.startswith("result.") and result is not None:
        path = path[7:]  # Remove 'result.' prefix
        obj = result
    else:
        # Extract from args
        parts = path.split(".")
        if parts[0] not in args:
            return None
        obj = args[parts[0]]
        path = ".".join(parts[1:]) if len(parts) > 1 else ""

    # Navigate nested path
    if path:
        for part in path.split("."):
            if obj is None:
                return None
            if hasattr(obj, part):
                obj = getattr(obj, part)
            elif isinstance(obj, dict) and part in obj:
                obj = obj[part]
            else:
                return None

    # Validate it's a UUID

    if isinstance(obj, UUIDType):
        return obj

    return None


# ==============================================================================
# Convenience Functions for Manual Event Emission
# ==============================================================================


def emit_business_event(
    event_name: str,
    user_id: UUID | None = None,
    course_id: UUID | None = None,
    lesson_id: UUID | None = None,
    metadata: dict[str, str] | None = None,
) -> bool:
    """Emit a business event manually.

    Use this when the @track_event decorator doesn't fit.

    Args:
        event_name: Event name
        user_id: Optional user ID
        course_id: Optional course ID
        lesson_id: Optional lesson ID
        metadata: Optional metadata

    Returns:
        True if emitted, False if not
    """
    emitter = get_metrics_emitter()
    if not emitter:
        return False

    return emitter.emit_business(
        event_name=event_name,
        user_id=user_id,
        course_id=course_id,
        lesson_id=lesson_id,
        metadata=metadata,
    )


def emit_error_event(
    error_type: str,
    error_message: str,
    path: str | None = None,
    user_id: UUID | None = None,
    request_id: str | None = None,
) -> bool:
    """Emit an error event manually.

    Args:
        error_type: Type/class of error
        error_message: Error message
        path: Request path where error occurred
        user_id: Optional user ID
        request_id: Optional request ID

    Returns:
        True if emitted, False if not
    """
    emitter = get_metrics_emitter()
    if not emitter:
        return False

    return emitter.emit_error(
        error_type=error_type,
        error_message=error_message,
        path=path,
        user_id=user_id,
        request_id=request_id,
    )
