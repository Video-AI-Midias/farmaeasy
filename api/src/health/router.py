"""Health check endpoints.

Provides Kubernetes-compatible health probes:
- /health/live: Liveness probe - is the app running?
- /health/ready: Readiness probe - is the app ready to serve?
- /health: Detailed health with dependency checks
"""

from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import ORJSONResponse

from src.config import get_settings
from src.core.database.async_cassandra import AsyncCassandraConnection
from src.core.redis import get_redis


router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def liveness() -> dict[str, str]:
    """Liveness probe - checks if the application is running.

    This should be a simple check that doesn't depend on external services.
    Used by Kubernetes to determine if the container should be restarted.
    """
    return {"status": "alive"}


@router.get("/ready")
async def readiness() -> ORJSONResponse:
    """Readiness probe - checks if the application is ready to serve requests.

    Verifies that critical dependencies (Cassandra) are available.
    Used by Kubernetes to determine if traffic should be routed to this pod.
    """
    settings = get_settings()

    # Check Cassandra (critical dependency)
    cassandra_health = await AsyncCassandraConnection.health_check()

    if not cassandra_health.get("healthy"):
        return ORJSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "reason": "cassandra_unavailable",
                "environment": settings.environment,
            },
        )

    return ORJSONResponse(
        content={
            "status": "ready",
            "environment": settings.environment,
        }
    )


@router.get("")
async def health() -> ORJSONResponse:
    """Detailed health check with all dependency statuses.

    Returns comprehensive health information including:
    - Application info
    - Cassandra connection status
    - Redis connection status
    """
    settings = get_settings()

    # Check all dependencies
    cassandra_health = await AsyncCassandraConnection.health_check()
    redis_health = await _check_redis_health()

    # Determine overall status
    all_healthy = cassandra_health.get("healthy", False)
    overall_status = "healthy" if all_healthy else "degraded"

    response: dict[str, Any] = {
        "status": overall_status,
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "dependencies": {
            "cassandra": cassandra_health,
            "redis": redis_health,
        },
    }

    status_code = (
        status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return ORJSONResponse(content=response, status_code=status_code)


async def _check_redis_health() -> dict[str, bool | str]:
    """Check Redis connection health.

    Redis is optional - app can work without it (real-time features disabled).
    """
    try:
        redis_client = get_redis()
        if redis_client is None:
            return {"healthy": False, "error": "Not configured"}

        # PING command to verify connection
        result = await redis_client.ping()
        if result:
            return {"healthy": True, "status": "connected"}
        return {"healthy": False, "error": "Ping failed"}
    except Exception as e:
        return {"healthy": False, "error": str(e)}
