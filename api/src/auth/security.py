"""Security utilities for authentication.

Provides:
- Password hashing with Argon2id (OWASP recommended)
- JWT token creation and validation
- Token type separation (access vs refresh)
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from src.config.settings import get_settings


# Argon2id configuration (OWASP recommended parameters)
# https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
_password_hasher = PasswordHasher(
    time_cost=2,  # 2 iterations
    memory_cost=19456,  # 19 MiB (19456 KiB)
    parallelism=1,  # Single thread
    hash_len=32,  # 32-byte output
    salt_len=16,  # 16-byte random salt
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2id.

    The returned hash includes the algorithm parameters and salt,
    making it self-contained for verification.

    Args:
        password: Plain text password

    Returns:
        Argon2id hash string (includes salt and parameters)

    Example:
        >>> hashed = hash_password("my-secure-password")
        >>> hashed.startswith("$argon2id$")
        True
    """
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Verify a password against its hash.

    Also checks if the hash needs rehashing (algorithm params changed).
    This enables seamless upgrades of hashing parameters.

    Args:
        password: Plain text password to verify
        password_hash: Stored Argon2id hash

    Returns:
        Tuple of (is_valid, new_hash):
        - is_valid: True if password matches
        - new_hash: New hash if rehash needed, None otherwise

    Example:
        >>> hashed = hash_password("secret")
        >>> is_valid, new_hash = verify_password("secret", hashed)
        >>> is_valid
        True
        >>> new_hash is None  # No rehash needed
        True
    """
    try:
        _password_hasher.verify(password_hash, password)

        # Check if parameters changed and rehash is needed
        if _password_hasher.check_needs_rehash(password_hash):
            return True, hash_password(password)

        return True, None
    except VerifyMismatchError:
        return False, None


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Access tokens are short-lived and used for API authentication.
    They contain user claims and are validated on each request.

    Args:
        data: Payload data (typically {"sub": user_id, "email": email, "role": role})
        expires_delta: Token lifetime (default from settings)

    Returns:
        Encoded JWT string

    Token payload includes:
        - All provided data
        - exp: Expiration timestamp
        - iat: Issued at timestamp
        - type: "access" (for validation)
    """
    settings = get_settings()

    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.auth_access_token_expire_minutes)
    )

    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            "type": "access",
        }
    )

    return jwt.encode(
        to_encode,
        settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )


def create_refresh_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> tuple[str, str]:
    """Create a JWT refresh token with unique identifier.

    Refresh tokens are long-lived and used to obtain new access tokens.
    Each refresh token has a unique jti (JWT ID) for revocation tracking.

    Args:
        data: Payload data (typically {"sub": user_id, "email": email, "role": role})
        expires_delta: Token lifetime (default from settings)

    Returns:
        Tuple of (token_string, jti):
        - token_string: Encoded JWT
        - jti: Unique token identifier (UUID) for database storage

    Token payload includes:
        - All provided data
        - exp: Expiration timestamp
        - iat: Issued at timestamp
        - type: "refresh" (for validation)
        - jti: Unique identifier for revocation
    """
    settings = get_settings()

    jti = str(uuid4())
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(days=settings.auth_refresh_token_expire_days)
    )

    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            "type": "refresh",
            "jti": jti,
        }
    )

    token = jwt.encode(
        to_encode,
        settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )

    return token, jti


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token.

    Validates:
    - JWT signature
    - Expiration time
    - Token type == "access"

    Args:
        token: JWT string

    Returns:
        Decoded payload dictionary

    Raises:
        JWTError: If token is invalid, expired, or wrong type
    """
    settings = get_settings()

    payload = jwt.decode(
        token,
        settings.auth_secret_key,
        algorithms=[settings.auth_algorithm],
    )

    if payload.get("type") != "access":
        msg = "Invalid token type: expected 'access'"
        raise JWTError(msg)

    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode and validate a refresh token.

    Validates:
    - JWT signature
    - Expiration time
    - Token type == "refresh"
    - Presence of jti claim

    Args:
        token: JWT string

    Returns:
        Decoded payload dictionary (includes jti)

    Raises:
        JWTError: If token is invalid, expired, or wrong type
    """
    settings = get_settings()

    payload = jwt.decode(
        token,
        settings.auth_secret_key,
        algorithms=[settings.auth_algorithm],
    )

    if payload.get("type") != "refresh":
        msg = "Invalid token type: expected 'refresh'"
        raise JWTError(msg)

    if "jti" not in payload:
        msg = "Refresh token missing jti claim"
        raise JWTError(msg)

    return payload


def get_token_expiration(token: str) -> datetime | None:
    """Extract expiration time from a token without full validation.

    Useful for checking token expiry without secret key.

    Args:
        token: JWT string

    Returns:
        Expiration datetime or None if invalid
    """
    try:
        # Decode without verification to read exp claim
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
        )
        exp = payload.get("exp")
        if exp:
            return datetime.fromtimestamp(exp, tz=UTC)
    except JWTError:
        pass
    return None
