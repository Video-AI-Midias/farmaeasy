"""Request middleware for context management and logging.

This module provides middleware components for:
- Request context injection (request_id, trace_id)
- Request/response logging
- Performance monitoring
"""

import time
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from src.core.context import (
    clear_context,
    set_correlation_id,
    set_request_id,
    set_trace_id,
    set_user_id,
)


logger = structlog.get_logger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware that sets up request context for logging.

    This middleware:
    1. Generates or extracts request ID from headers
    2. Extracts trace ID from distributed tracing headers
    3. Sets up context variables for the duration of the request
    4. Logs request start/finish with timing
    5. Cleans up context after request completes
    """

    # Standard headers for request tracking
    REQUEST_ID_HEADER = "X-Request-ID"
    TRACE_ID_HEADER = "X-Trace-ID"
    CORRELATION_ID_HEADER = "X-Correlation-ID"

    # OpenTelemetry/B3 trace headers (alternative)
    TRACEPARENT_HEADER = "traceparent"
    B3_TRACE_HEADER = "X-B3-TraceId"

    def __init__(
        self,
        app: ASGIApp,
        log_requests: bool = True,
        exclude_paths: list[str] | None = None,
    ) -> None:
        """Initialize the middleware.

        Args:
            app: The ASGI application.
            log_requests: Whether to log request start/finish.
            exclude_paths: Paths to exclude from logging (e.g., health checks).
        """
        super().__init__(app)
        self.log_requests = log_requests
        self.exclude_paths = exclude_paths or [
            "/health",
            "/health/live",
            "/health/ready",
        ]

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Process the request and set up context."""
        start_time = time.perf_counter()

        # Extract or generate request ID
        request_id = request.headers.get(self.REQUEST_ID_HEADER) or request.headers.get(
            "X-Request-Id"
        )
        request_id = set_request_id(request_id)

        # Extract trace ID from various headers
        trace_id = (
            request.headers.get(self.TRACE_ID_HEADER)
            or request.headers.get(self.B3_TRACE_HEADER)
            or self._extract_traceparent(request.headers.get(self.TRACEPARENT_HEADER))
        )
        if trace_id:
            set_trace_id(trace_id)

        # Extract correlation ID
        correlation_id = request.headers.get(self.CORRELATION_ID_HEADER)
        if correlation_id:
            set_correlation_id(correlation_id)

        # Extract user ID from auth header (if JWT is present)
        # Note: Full user_id is typically set by auth middleware
        # This is a fallback for logging before auth runs

        # Store request_id in request state for easy access in routes
        request.state.request_id = request_id

        # Log request start (if not excluded)
        should_log = self.log_requests and not self._should_exclude(request.url.path)

        if should_log:
            logger.info(
                "request_started",
                method=request.method,
                path=request.url.path,
                query=str(request.query_params) if request.query_params else None,
                client_ip=self._get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )

        try:
            # Process the request
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log request completion
            if should_log:
                log_method = (
                    logger.warning if response.status_code >= 400 else logger.info
                )
                log_method(
                    "request_completed",
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                    duration_ms=round(duration_ms, 2),
                )

            # Add request ID to response headers
            response.headers[self.REQUEST_ID_HEADER] = request_id

            return response

        except Exception as e:
            # Calculate duration even on error
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log the error
            logger.exception(
                "request_failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
            )
            raise

        finally:
            # Always clear context to prevent leakage
            clear_context()

    def _should_exclude(self, path: str) -> bool:
        """Check if path should be excluded from logging.

        Args:
            path: The request path.

        Returns:
            True if the path should be excluded.
        """
        return any(path.startswith(excluded) for excluded in self.exclude_paths)

    def _get_client_ip(self, request: Request) -> str | None:
        """Get the client IP address, handling proxies.

        Args:
            request: The request object.

        Returns:
            The client IP address or None.
        """
        # Check X-Forwarded-For header (from reverse proxy)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # Take the first IP in the chain (original client)
            return forwarded_for.split(",")[0].strip()

        # Check X-Real-IP header (Nginx)
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

        # Fall back to direct client IP
        if request.client:
            return request.client.host

        return None

    def _extract_traceparent(self, traceparent: str | None) -> str | None:
        """Extract trace ID from W3C traceparent header.

        Format: {version}-{trace-id}-{parent-id}-{trace-flags}
        Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01

        Args:
            traceparent: The traceparent header value.

        Returns:
            The extracted trace ID or None.
        """
        if not traceparent:
            return None

        parts = traceparent.split("-")
        if len(parts) >= 2:
            return parts[1]

        return None


def get_user_id_from_request(request: Request) -> str | None:
    """Extract user ID from request state or headers.

    This helper is for routes that need user context before auth middleware.

    Args:
        request: The request object.

    Returns:
        The user ID if available.
    """
    # Check if auth middleware has set user in state
    if hasattr(request.state, "user") and request.state.user:
        user = request.state.user
        if hasattr(user, "id"):
            return str(user.id)

    return None


def set_user_context(user_id: str | None) -> None:
    """Set user ID in the current request context.

    Call this after authentication to include user_id in all subsequent logs.

    Args:
        user_id: The authenticated user's ID.
    """
    set_user_id(user_id)


# Export for external use
__all__ = [
    "RequestContextMiddleware",
    "get_user_id_from_request",
    "set_user_context",
]
