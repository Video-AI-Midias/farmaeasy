"""Request metrics middleware for automatic tracking.

Captures:
- Request method, path, status code
- Response time (duration_ms)
- User ID (if authenticated)
- Request ID (for correlation)

All with < 1ms overhead using fire-and-forget emission.
"""

from __future__ import annotations

import re
import time
from typing import TYPE_CHECKING

import structlog
from starlette.middleware.base import BaseHTTPMiddleware


if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response

    from .emitter import MetricsEmitter


logger = structlog.get_logger(__name__)


# Paths to exclude from metrics collection
DEFAULT_EXCLUDE_PATHS = {
    "/health",
    "/health/live",
    "/health/ready",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
}

# Patterns for path normalization (replace UUIDs, IDs with placeholders)
UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)
ID_PATTERN = re.compile(r"/\d+(?=/|$)")


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic request metrics collection.

    Captures request/response metrics with minimal overhead.
    Uses fire-and-forget pattern for non-blocking emission.
    """

    def __init__(
        self,
        app,
        emitter: MetricsEmitter,
        exclude_paths: set[str] | None = None,
        normalize_paths: bool = True,
    ) -> None:
        """Initialize metrics middleware.

        Args:
            app: ASGI application
            emitter: MetricsEmitter instance
            exclude_paths: Paths to exclude from tracking
            normalize_paths: Whether to normalize paths (replace IDs)
        """
        super().__init__(app)
        self.emitter = emitter
        self.exclude_paths = exclude_paths or DEFAULT_EXCLUDE_PATHS
        self.normalize_paths = normalize_paths

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request and emit metrics.

        Args:
            request: Incoming request
            call_next: Next middleware/handler

        Returns:
            Response from handler
        """
        path = request.url.path

        # Skip excluded paths (fast path)
        if self._should_exclude(path):
            return await call_next(request)

        # Record start time
        start_time = time.perf_counter()

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Extract context
        request_id = getattr(request.state, "request_id", None)
        user_id = getattr(request.state, "user_id", None)

        # Normalize path for aggregation
        normalized_path = self._normalize_path(path) if self.normalize_paths else path

        # Emit metric (fire-and-forget, < 1ms)
        # Only emit if emitter is available (may not be initialized during startup)
        if self.emitter is not None:
            self.emitter.emit_request(
                method=request.method,
                path=normalized_path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                request_id=request_id,
                user_id=user_id,
            )

        return response

    def _should_exclude(self, path: str) -> bool:
        """Check if path should be excluded from metrics.

        Args:
            path: Request path

        Returns:
            True if path should be excluded
        """
        # Exact match
        if path in self.exclude_paths:
            return True

        # Prefix match for excluded paths
        return any(path.startswith(excluded) for excluded in self.exclude_paths)

    def _normalize_path(self, path: str) -> str:
        """Normalize path for aggregation.

        Replaces:
        - UUIDs with :id
        - Numeric IDs with :id

        This prevents high-cardinality metrics from unique resource paths.

        Args:
            path: Original request path

        Returns:
            Normalized path
        """
        # Replace UUIDs, then numeric IDs (e.g., /users/123/posts)
        normalized = UUID_PATTERN.sub(":id", path)
        return ID_PATTERN.sub("/:id", normalized)
