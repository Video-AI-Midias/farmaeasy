# ruff: noqa: PLW0603
"""Redis connection management.

Provides async Redis client for:
- Cache operations
- Pub/Sub for real-time notifications
"""

from collections.abc import AsyncGenerator

import redis.asyncio as redis

from src.config import get_settings
from src.core.logging import get_logger


logger = get_logger(__name__)

# Global Redis client
_redis_client: redis.Redis | None = None


async def init_redis() -> redis.Redis:
    """Initialize Redis connection pool."""
    global _redis_client

    settings = get_settings()

    _redis_client = redis.from_url(
        settings.redis_url,
        max_connections=settings.redis_max_connections,
        socket_timeout=settings.redis_socket_timeout,
        socket_connect_timeout=settings.redis_socket_connect_timeout,
        retry_on_timeout=settings.redis_retry_on_timeout,
        health_check_interval=settings.redis_health_check_interval,
        decode_responses=True,
    )

    # Test connection
    try:
        await _redis_client.ping()
        logger.info("redis_connected", url=settings.redis_url)
    except redis.ConnectionError as e:
        logger.warning("redis_connection_failed", error=str(e))
        _redis_client = None
        raise

    return _redis_client


async def shutdown_redis() -> None:
    """Close Redis connection."""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        logger.info("redis_disconnected")
        _redis_client = None


def get_redis() -> redis.Redis | None:
    """Get Redis client instance."""
    return _redis_client


async def get_redis_dependency() -> AsyncGenerator[redis.Redis | None, None]:
    """FastAPI dependency for Redis client."""
    yield _redis_client


# Pub/Sub channel patterns
def notification_channel(user_id: str) -> str:
    """Get user-specific notification channel name."""
    return f"notifications:user:{user_id}"


def notification_broadcast_channel() -> str:
    """Get broadcast channel for all notifications."""
    return "notifications:broadcast"
