"""FastAPI dependency injection for metrics."""

from __future__ import annotations

from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi import Request

    from .emitter import MetricsEmitter
    from .service import MetricsQueryService


# Service getters (set during app initialization)
_metrics_emitter_getter: Callable[[], MetricsEmitter] | None = None
_metrics_service_getter: Callable[[], MetricsQueryService] | None = None


def set_metrics_emitter_getter(getter: Callable[[], MetricsEmitter]) -> None:
    """Set the metrics emitter getter function.

    Args:
        getter: Function that returns MetricsEmitter instance
    """
    global _metrics_emitter_getter  # noqa: PLW0603 - singleton pattern
    _metrics_emitter_getter = getter


def set_metrics_service_getter(getter: Callable[[], MetricsQueryService]) -> None:
    """Set the metrics service getter function.

    Args:
        getter: Function that returns MetricsQueryService instance
    """
    global _metrics_service_getter  # noqa: PLW0603 - singleton pattern
    _metrics_service_getter = getter


def get_metrics_emitter_dep() -> MetricsEmitter:
    """FastAPI dependency for MetricsEmitter.

    Returns:
        MetricsEmitter instance

    Raises:
        RuntimeError: If emitter not initialized
    """
    if _metrics_emitter_getter is None:
        msg = "MetricsEmitter not initialized"
        raise RuntimeError(msg)
    return _metrics_emitter_getter()


def get_metrics_service_dep() -> MetricsQueryService:
    """FastAPI dependency for MetricsQueryService.

    Returns:
        MetricsQueryService instance

    Raises:
        RuntimeError: If service not initialized
    """
    if _metrics_service_getter is None:
        msg = "MetricsQueryService not initialized"
        raise RuntimeError(msg)
    return _metrics_service_getter()


def get_metrics_service_from_request(request: Request) -> MetricsQueryService:
    """Get metrics service from request state.

    Alternative dependency that uses request.app.state.

    Args:
        request: FastAPI request

    Returns:
        MetricsQueryService instance

    Raises:
        RuntimeError: If service not available
    """
    if not hasattr(request.app.state, "metrics_service"):
        msg = "MetricsQueryService not available in app state"
        raise RuntimeError(msg)
    return request.app.state.metrics_service
