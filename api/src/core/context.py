"""Request context management using contextvars.

This module provides thread-safe request context tracking using Python's contextvars.
Each request gets a unique ID and optional user/trace information that can be
accessed anywhere in the call stack without passing parameters explicitly.
"""

from contextvars import ContextVar
from typing import Any
from uuid import UUID, uuid4


# Context variables for request tracking
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)
trace_id_var: ContextVar[str | None] = ContextVar("trace_id", default=None)
correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def generate_request_id() -> str:
    """Generate a new unique request ID."""
    return str(uuid4())


def get_request_id() -> str:
    """Get the current request ID."""
    return request_id_var.get()


def set_request_id(request_id: str | None = None) -> str:
    """Set the request ID for the current context.

    Args:
        request_id: Optional request ID. If not provided, generates a new one.

    Returns:
        The request ID that was set.
    """
    rid = request_id or generate_request_id()
    request_id_var.set(rid)
    return rid


def get_user_id() -> str | None:
    """Get the current user ID."""
    return user_id_var.get()


def set_user_id(user_id: str | UUID | None) -> None:
    """Set the user ID for the current context.

    Args:
        user_id: The user ID to set (can be string or UUID).
    """
    if user_id is not None:
        user_id_var.set(str(user_id))
    else:
        user_id_var.set(None)


def get_trace_id() -> str | None:
    """Get the current trace ID."""
    return trace_id_var.get()


def set_trace_id(trace_id: str | None) -> None:
    """Set the trace ID for the current context.

    Args:
        trace_id: The trace ID from distributed tracing headers.
    """
    trace_id_var.set(trace_id)


def get_correlation_id() -> str | None:
    """Get the current correlation ID."""
    return correlation_id_var.get()


def set_correlation_id(correlation_id: str | None) -> None:
    """Set the correlation ID for the current context.

    Args:
        correlation_id: The correlation ID for tracking related operations.
    """
    correlation_id_var.set(correlation_id)


def get_context() -> dict[str, Any]:
    """Get all context variables as a dictionary.

    Returns:
        Dictionary with request_id, user_id, trace_id, and correlation_id.
    """
    context: dict[str, Any] = {}

    request_id = get_request_id()
    if request_id:
        context["request_id"] = request_id

    user_id = get_user_id()
    if user_id:
        context["user_id"] = user_id

    trace_id = get_trace_id()
    if trace_id:
        context["trace_id"] = trace_id

    correlation_id = get_correlation_id()
    if correlation_id:
        context["correlation_id"] = correlation_id

    return context


def clear_context() -> None:
    """Clear all context variables.

    This should be called at the end of each request to prevent
    context leakage between requests.
    """
    request_id_var.set("")
    user_id_var.set(None)
    trace_id_var.set(None)
    correlation_id_var.set(None)


class RequestContext:
    """Context manager for request scope.

    Usage:
        with RequestContext(request_id="...", user_id="..."):
            # All code here has access to these context values
            log.info("doing something")  # Will include request_id, user_id
    """

    def __init__(
        self,
        request_id: str | None = None,
        user_id: str | UUID | None = None,
        trace_id: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        """Initialize request context.

        Args:
            request_id: Unique request identifier.
            user_id: User identifier.
            trace_id: Distributed tracing ID.
            correlation_id: Correlation ID for related operations.
        """
        self.request_id = request_id
        self.user_id = user_id
        self.trace_id = trace_id
        self.correlation_id = correlation_id
        self._tokens: dict[str, Any] = {}

    def __enter__(self) -> "RequestContext":
        """Enter context and set variables."""
        self._tokens["request_id"] = request_id_var.set(
            self.request_id or generate_request_id()
        )

        if self.user_id is not None:
            self._tokens["user_id"] = user_id_var.set(str(self.user_id))

        if self.trace_id is not None:
            self._tokens["trace_id"] = trace_id_var.set(self.trace_id)

        if self.correlation_id is not None:
            self._tokens["correlation_id"] = correlation_id_var.set(self.correlation_id)

        return self

    def __exit__(self, *_: object) -> None:
        """Exit context and restore previous values."""
        for var_name, token in self._tokens.items():
            if var_name == "request_id":
                request_id_var.reset(token)
            elif var_name == "user_id":
                user_id_var.reset(token)
            elif var_name == "trace_id":
                trace_id_var.reset(token)
            elif var_name == "correlation_id":
                correlation_id_var.reset(token)
