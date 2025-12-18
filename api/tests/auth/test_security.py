"""Tests for auth security functions."""

from datetime import timedelta
from uuid import uuid4

import pytest
from jose import JWTError

from src.auth.permissions import UserRole
from src.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    """Tests for password hashing functions."""

    def test_hash_password_creates_hash(self) -> None:
        """Hash should be different from plain password."""
        password = "SecureP@ssword123"
        hashed = hash_password(password)
        assert hashed != password
        assert len(hashed) > 0

    def test_hash_password_unique_hashes(self) -> None:
        """Same password should produce different hashes (due to salt)."""
        password = "SecureP@ssword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        assert hash1 != hash2

    def test_verify_password_correct(self) -> None:
        """Correct password should verify successfully."""
        password = "SecureP@ssword123"
        hashed = hash_password(password)
        is_valid, new_hash = verify_password(password, hashed)
        assert is_valid is True
        assert new_hash is None  # No rehash needed for fresh hash

    def test_verify_password_incorrect(self) -> None:
        """Incorrect password should fail verification."""
        password = "SecureP@ssword123"
        wrong_password = "WrongP@ssword456"
        hashed = hash_password(password)
        is_valid, new_hash = verify_password(wrong_password, hashed)
        assert is_valid is False
        assert new_hash is None

    def test_verify_password_empty(self) -> None:
        """Empty password should fail verification."""
        password = "SecureP@ssword123"
        hashed = hash_password(password)
        is_valid, _new_hash = verify_password("", hashed)
        assert is_valid is False

    def test_hash_is_argon2(self) -> None:
        """Hash should use Argon2 format."""
        password = "SecureP@ssword123"
        hashed = hash_password(password)
        assert hashed.startswith("$argon2")


class TestAccessToken:
    """Tests for access token creation and decoding."""

    def test_create_access_token(self) -> None:
        """Should create valid access token."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token = create_access_token(data)
        assert token is not None
        assert len(token) > 0

    def test_decode_access_token(self) -> None:
        """Should decode token and return payload."""
        user_id = uuid4()
        email = "test@example.com"
        role = UserRole.STUDENT

        data = {"sub": str(user_id), "email": email, "role": role.value}
        token = create_access_token(data)
        payload = decode_access_token(token)

        assert payload["sub"] == str(user_id)
        assert payload["email"] == email
        assert payload["role"] == role.value
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "iat" in payload

    def test_decode_access_token_expired(self) -> None:
        """Should raise JWTError for expired token."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token = create_access_token(data, expires_delta=timedelta(seconds=-1))

        with pytest.raises(JWTError):
            decode_access_token(token)

    def test_decode_access_token_invalid(self) -> None:
        """Should raise JWTError for invalid token."""
        with pytest.raises(JWTError):
            decode_access_token("invalid.token.here")

    def test_decode_access_token_wrong_type(self) -> None:
        """Should raise JWTError if token type is not 'access'."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        refresh_token, _ = create_refresh_token(data)

        with pytest.raises(JWTError, match="expected 'access'"):
            decode_access_token(refresh_token)


class TestRefreshToken:
    """Tests for refresh token creation and decoding."""

    def test_create_refresh_token(self) -> None:
        """Should create valid refresh token."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token, jti = create_refresh_token(data)
        assert token is not None
        assert len(token) > 0
        assert jti is not None

    def test_refresh_token_has_jti(self) -> None:
        """Refresh token should have unique jti."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token, jti = create_refresh_token(data)
        payload = decode_refresh_token(token)

        assert "jti" in payload
        assert payload["jti"] == jti

    def test_decode_refresh_token(self) -> None:
        """Should decode refresh token and return payload."""
        user_id = uuid4()
        email = "test@example.com"
        role = UserRole.TEACHER

        data = {"sub": str(user_id), "email": email, "role": role.value}
        token, jti = create_refresh_token(data)
        payload = decode_refresh_token(token)

        assert payload["sub"] == str(user_id)
        assert payload["email"] == email
        assert payload["role"] == role.value
        assert payload["type"] == "refresh"
        assert payload["jti"] == jti
        assert "exp" in payload
        assert "iat" in payload

    def test_decode_refresh_token_expired(self) -> None:
        """Should raise JWTError for expired token."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token, _ = create_refresh_token(data, expires_delta=timedelta(seconds=-1))

        with pytest.raises(JWTError):
            decode_refresh_token(token)

    def test_decode_refresh_token_invalid(self) -> None:
        """Should raise JWTError for invalid token."""
        with pytest.raises(JWTError):
            decode_refresh_token("invalid.token.here")

    def test_decode_refresh_token_wrong_type(self) -> None:
        """Should raise JWTError if token type is not 'refresh'."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        access_token = create_access_token(data)

        with pytest.raises(JWTError, match="expected 'refresh'"):
            decode_refresh_token(access_token)


class TestTokenUniqueness:
    """Tests for token uniqueness."""

    def test_access_tokens_deterministic_same_second(self) -> None:
        """Access tokens with same data created in same second are identical.

        This is expected JWT behavior - tokens are deterministic based on
        payload and timestamp. Uniqueness comes from different payloads
        or different timestamps.
        """
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token1 = create_access_token(data)
        token2 = create_access_token(data)
        # Tokens created in same second with same data are identical
        # This is expected - JWT is deterministic
        assert token1 == token2

    def test_access_tokens_unique_different_users(self) -> None:
        """Access tokens for different users are unique."""
        data1 = {
            "sub": str(uuid4()),
            "email": "user1@example.com",
            "role": UserRole.USER.value,
        }
        data2 = {
            "sub": str(uuid4()),
            "email": "user2@example.com",
            "role": UserRole.USER.value,
        }
        token1 = create_access_token(data1)
        token2 = create_access_token(data2)
        assert token1 != token2

    def test_refresh_tokens_unique(self) -> None:
        """Different calls should create different refresh tokens."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        token1, _ = create_refresh_token(data)
        token2, _ = create_refresh_token(data)
        assert token1 != token2

    def test_refresh_tokens_have_unique_jti(self) -> None:
        """Each refresh token should have unique jti."""
        user_id = uuid4()
        data = {
            "sub": str(user_id),
            "email": "test@example.com",
            "role": UserRole.USER.value,
        }
        _, jti1 = create_refresh_token(data)
        _, jti2 = create_refresh_token(data)
        assert jti1 != jti2
