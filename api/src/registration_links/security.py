"""Security utilities for registration links.

Provides:
- Shortcode generation (human-readable, unambiguous)
- Token generation (cryptographically secure)
- Token hashing and verification
"""

import hashlib
import secrets
import string


# Alphabet for shortcodes - excludes ambiguous characters (0, O, l, I, 1)
SHORTCODE_ALPHABET = string.ascii_uppercase.replace("O", "").replace(
    "I", ""
) + string.digits.replace("0", "").replace("1", "")
# Result: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (32 characters)

SHORTCODE_LENGTH = 8


def generate_shortcode(length: int = SHORTCODE_LENGTH) -> str:
    """Generate a human-readable shortcode.

    Uses an alphabet that excludes visually ambiguous characters:
    - Excluded: 0 (zero), O, l (lowercase L), I, 1 (one)

    Args:
        length: Length of shortcode (default: 8)

    Returns:
        Shortcode string (e.g., "ABC12345")
    """
    return "".join(secrets.choice(SHORTCODE_ALPHABET) for _ in range(length))


def generate_token() -> str:
    """Generate a cryptographically secure token.

    Returns:
        URL-safe base64 token (256 bits / 32 bytes)
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token for secure storage.

    Uses SHA-256 for fast comparison during validation.
    Only the hash is stored, never the raw token.

    Args:
        token: Raw token to hash

    Returns:
        SHA-256 hex digest of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    """Verify a token against its stored hash.

    Uses timing-safe comparison to prevent timing attacks.

    Args:
        token: Raw token to verify
        token_hash: Stored hash to compare against

    Returns:
        True if token matches the hash
    """
    computed_hash = hash_token(token)
    return secrets.compare_digest(computed_hash, token_hash)
