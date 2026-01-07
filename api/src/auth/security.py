"""Security utilities for authentication.

Re-exports from authentication-module with local settings integration.
Provides:
- Password hashing with Argon2id (OWASP recommended)
- JWT token creation and validation
- Token type separation (access vs refresh)
"""

from datetime import timedelta
from typing import Any

from authentication import (
    get_token_expiration,
    hash_password,
    verify_password,
)
from authentication.security import (
    create_access_token as _create_access_token,
    create_refresh_token as _create_refresh_token,
    decode_access_token as _decode_access_token,
    decode_refresh_token as _decode_refresh_token,
)

from src.config.settings import get_settings


# Re-export password functions directly (no settings needed)
__all__ = [
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "decode_refresh_token",
    "get_token_expiration",
    "hash_password",
    "verify_password",
]


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token using local settings."""
    settings = get_settings()
    return _create_access_token(
        data=data,
        secret_key=settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
        expires_delta=expires_delta or timedelta(minutes=settings.auth_access_token_expire_minutes),
    )


def create_refresh_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> tuple[str, str]:
    """Create a JWT refresh token using local settings."""
    settings = get_settings()
    return _create_refresh_token(
        data=data,
        secret_key=settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
        expires_delta=expires_delta or timedelta(days=settings.auth_refresh_token_expire_days),
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token using local settings."""
    settings = get_settings()
    return _decode_access_token(
        token=token,
        secret_key=settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode and validate a refresh token using local settings."""
    settings = get_settings()
    return _decode_refresh_token(
        token=token,
        secret_key=settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )
