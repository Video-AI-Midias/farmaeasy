"""FastAPI dependencies for registration links.

Provides dependency injection for:
- RegistrationLinkService
- Rate limiting for public endpoints (Redis-backed)
- Client info extraction
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from src.config.settings import Settings, get_settings
from src.core.logging import get_logger
from src.core.redis import get_redis

from .service import RegistrationLinkService


logger = get_logger(__name__)


# ==============================================================================
# Service Dependency Injection
# ==============================================================================

# Service getter function (set from main.py)
_service_getter: Callable[[], RegistrationLinkService] | None = None


def set_service_getter(getter: Callable[[], RegistrationLinkService]) -> None:
    """Set the service getter function.

    Called from main.py to inject the service factory.
    """
    global _service_getter  # noqa: PLW0603 - necessary for DI pattern
    _service_getter = getter


def get_registration_link_service() -> RegistrationLinkService:
    """Get RegistrationLinkService instance.

    Returns:
        RegistrationLinkService instance

    Raises:
        RuntimeError: If service is not configured
    """
    if _service_getter is None:
        msg = "RegistrationLinkService not configured"
        raise RuntimeError(msg)
    return _service_getter()


# Type alias for dependency injection
RegistrationLinkServiceDep = Annotated[
    RegistrationLinkService, Depends(get_registration_link_service)
]


# ==============================================================================
# Client Info Extraction (Security Hardened)
# ==============================================================================


def get_client_ip(
    request: Request,
    settings: Settings,
) -> str:
    """Extract client IP address with protection against spoofing.

    Security measures:
    - Only trusts X-Forwarded-For if from trusted hosts
    - Falls back to direct connection IP
    - Never trusts arbitrary proxy headers

    Args:
        request: FastAPI request
        settings: Application settings with trusted_hosts

    Returns:
        Client IP address
    """
    # Direct connection IP (most reliable)
    direct_ip = request.client.host if request.client else "unknown"

    # Check if request is from a trusted proxy
    # In production, Nginx should be in trusted_hosts
    trusted_hosts = settings.trusted_hosts or []

    # Only trust X-Forwarded-For if from trusted proxy
    if direct_ip in trusted_hosts or direct_ip.startswith("127.") or direct_ip == "::1":
        # Request is from trusted proxy - use forwarded header
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            # Take the LAST IP in the chain that's not a known proxy
            # This is the most reliable approach for chained proxies
            ips = [ip.strip() for ip in forwarded_for.split(",")]
            # Filter out trusted proxies to get actual client
            client_ips = [ip for ip in ips if ip not in trusted_hosts]
            if client_ips:
                return client_ips[0]  # First non-proxy IP is client

        # Fallback to X-Real-IP
        real_ip = request.headers.get("x-real-ip", "")
        if real_ip:
            return real_ip

    # Not from trusted proxy or no forwarding headers - use direct IP
    return direct_ip


# ==============================================================================
# Rate Limiting (Redis-backed)
# ==============================================================================

# Rate limit configuration
RATE_LIMIT_VALIDATE = 10  # requests per minute
RATE_LIMIT_REGISTER = 3  # requests per minute
RATE_LIMIT_WINDOW = 60  # seconds


async def _check_rate_limit(
    key: str,
    limit: int,
    window: int,
) -> tuple[bool, int, int]:
    """Check and update rate limit for a key.

    Uses Redis INCR with TTL for atomic rate limiting.

    Args:
        key: Rate limit key (e.g., "rate_limit:validate:192.168.1.1")
        limit: Maximum requests allowed in window
        window: Time window in seconds

    Returns:
        Tuple of (is_allowed, current_count, remaining)
    """
    redis_client = get_redis()

    if redis_client is None:
        # Redis unavailable - log warning and allow request
        # This prevents service disruption but should be monitored
        logger.warning(
            "rate_limit_redis_unavailable",
            key=key,
            action="allowing_request",
        )
        return True, 0, limit

    try:
        # Atomic increment
        current = await redis_client.incr(key)

        # Set TTL on first request (when count is 1)
        if current == 1:
            await redis_client.expire(key, window)

        # Check if over limit
        is_allowed = current <= limit
        remaining = max(0, limit - current)

        if not is_allowed:
            logger.warning(
                "rate_limit_exceeded",
                key=key,
                current=current,
                limit=limit,
            )

        return is_allowed, current, remaining

    except Exception as e:
        # Redis error - log and allow (fail-open)
        logger.error(
            "rate_limit_redis_error",
            key=key,
            error=str(e),
            action="allowing_request",
        )
        return True, 0, limit


async def rate_limit_validate(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Rate limit for link validation endpoint.

    Allows 10 requests per minute per IP.

    Raises:
        HTTPException(429): If rate limit exceeded
    """
    client_ip = get_client_ip(request, settings)
    key = f"rate_limit:registration:validate:{client_ip}"

    is_allowed, current, remaining = await _check_rate_limit(
        key=key,
        limit=RATE_LIMIT_VALIDATE,
        window=RATE_LIMIT_WINDOW,
    )

    if not is_allowed:
        logger.warning(
            "rate_limit_validate_blocked",
            client_ip=client_ip,
            requests=current,
            limit=RATE_LIMIT_VALIDATE,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
            headers={
                "Retry-After": str(RATE_LIMIT_WINDOW),
                "X-RateLimit-Limit": str(RATE_LIMIT_VALIDATE),
                "X-RateLimit-Remaining": str(remaining),
            },
        )


async def rate_limit_register(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Rate limit for registration completion endpoint.

    Allows 3 requests per minute per IP.

    Raises:
        HTTPException(429): If rate limit exceeded
    """
    client_ip = get_client_ip(request, settings)
    key = f"rate_limit:registration:complete:{client_ip}"

    is_allowed, current, remaining = await _check_rate_limit(
        key=key,
        limit=RATE_LIMIT_REGISTER,
        window=RATE_LIMIT_WINDOW,
    )

    if not is_allowed:
        logger.warning(
            "rate_limit_register_blocked",
            client_ip=client_ip,
            requests=current,
            limit=RATE_LIMIT_REGISTER,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please wait a minute before trying again.",
            headers={
                "Retry-After": str(RATE_LIMIT_WINDOW),
                "X-RateLimit-Limit": str(RATE_LIMIT_REGISTER),
                "X-RateLimit-Remaining": str(remaining),
            },
        )


# ==============================================================================
# Client Info for Audit Logging
# ==============================================================================


class ClientInfo:
    """Client information for audit logging."""

    def __init__(self, ip_address: str, user_agent: str):
        self.ip_address = ip_address
        self.user_agent = user_agent


def get_client_info(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ClientInfo:
    """Extract client information for audit logging.

    Returns:
        ClientInfo with IP address and user agent
    """
    ip_address = get_client_ip(request, settings)
    user_agent = request.headers.get("user-agent", "unknown")

    return ClientInfo(ip_address=ip_address, user_agent=user_agent)


# ==============================================================================
# Type Aliases for Dependency Injection
# ==============================================================================

RateLimitValidate = Annotated[None, Depends(rate_limit_validate)]
RateLimitRegister = Annotated[None, Depends(rate_limit_register)]
ClientInfoDep = Annotated[ClientInfo, Depends(get_client_info)]
