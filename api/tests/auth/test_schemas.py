"""Tests for auth schemas."""

from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.auth.permissions import UserRole
from src.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UpdateRoleRequest,
    UserResponse,
    ValidateCPFRequest,
    ValidateCPFResponse,
    ValidateEmailRequest,
    ValidateEmailResponse,
)


class TestRegisterRequest:
    """Tests for RegisterRequest schema."""

    def test_valid_registration(self) -> None:
        """Valid registration data should pass validation."""
        data = RegisterRequest(
            email="test@example.com",
            password="SecureP@ss123",
            name="John Doe",
            cpf="529.982.247-25",
            phone="(11) 98765-4321",
        )
        assert data.email == "test@example.com"
        assert data.name == "John Doe"
        # CPF and phone should be normalized
        assert data.cpf == "52998224725"
        assert data.phone == "11987654321"

    def test_invalid_email(self) -> None:
        """Invalid email should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                email="invalid-email",
                password="SecureP@ss123",
                name="John Doe",
                cpf="529.982.247-25",
                phone="(11) 98765-4321",
            )
        assert "email" in str(exc_info.value).lower()

    def test_invalid_cpf(self) -> None:
        """Invalid CPF should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                email="test@example.com",
                password="SecureP@ss123",
                name="John Doe",
                cpf="111.111.111-11",  # Invalid CPF
                phone="(11) 98765-4321",
            )
        assert "cpf" in str(exc_info.value).lower()

    def test_invalid_phone(self) -> None:
        """Invalid phone should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                email="test@example.com",
                password="SecureP@ss123",
                name="John Doe",
                cpf="529.982.247-25",
                phone="123",  # Invalid phone
            )
        assert "phone" in str(exc_info.value).lower()

    def test_weak_password(self) -> None:
        """Weak password should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RegisterRequest(
                email="test@example.com",
                password="weak",  # Too short, no special chars
                name="John Doe",
                cpf="529.982.247-25",
                phone="(11) 98765-4321",
            )
        assert "password" in str(exc_info.value).lower()

    def test_empty_name(self) -> None:
        """Empty name should fail validation."""
        with pytest.raises(ValidationError):
            RegisterRequest(
                email="test@example.com",
                password="SecureP@ss123",
                name="",  # Empty name
                cpf="529.982.247-25",
                phone="(11) 98765-4321",
            )


class TestLoginRequest:
    """Tests for LoginRequest schema."""

    def test_valid_login(self) -> None:
        """Valid login data should pass validation."""
        data = LoginRequest(
            email="test@example.com",
            password="password123",
        )
        assert data.email == "test@example.com"
        assert data.password == "password123"

    def test_invalid_email(self) -> None:
        """Invalid email should fail validation."""
        with pytest.raises(ValidationError):
            LoginRequest(
                email="invalid",
                password="password123",
            )

    def test_accepts_any_password(self) -> None:
        """LoginRequest accepts any password (validation is done at authentication).

        Note: Password strength is only validated at registration, not login.
        """
        data = LoginRequest(
            email="test@example.com",
            password="simple",  # Weak password is OK for login
        )
        assert data.password == "simple"


class TestTokenResponse:
    """Tests for TokenResponse schema."""

    def test_token_response(self) -> None:
        """Token response should have correct structure."""
        data = TokenResponse(
            access_token="jwt.token.here",
            expires_in=900,
        )
        assert data.access_token == "jwt.token.here"
        assert data.token_type == "Bearer"
        assert data.expires_in == 900


class TestUserResponse:
    """Tests for UserResponse schema."""

    def test_user_response(self) -> None:
        """User response should have correct structure."""
        user_id = uuid4()
        now = datetime.now()
        data = UserResponse(
            id=user_id,
            email="test@example.com",
            name="John Doe",
            phone="11987654321",
            role=UserRole.STUDENT,
            is_active=True,
            created_at=now,
        )
        assert data.id == user_id
        assert data.email == "test@example.com"
        assert data.role == UserRole.STUDENT
        assert data.is_active is True


class TestUpdateProfileRequest:
    """Tests for UpdateProfileRequest schema."""

    def test_partial_update(self) -> None:
        """Should allow partial updates."""
        data = UpdateProfileRequest(name="New Name")
        assert data.name == "New Name"
        assert data.phone is None
        assert data.avatar_url is None

    def test_all_fields(self) -> None:
        """Should accept all fields."""
        data = UpdateProfileRequest(
            name="New Name",
            phone="11987654321",
            avatar_url="https://example.com/avatar.jpg",
        )
        assert data.name == "New Name"
        assert data.phone == "11987654321"
        assert data.avatar_url == "https://example.com/avatar.jpg"


class TestChangePasswordRequest:
    """Tests for ChangePasswordRequest schema."""

    def test_valid_password_change(self) -> None:
        """Valid password change should pass."""
        data = ChangePasswordRequest(
            current_password="OldP@ss123",
            new_password="NewP@ss456!",
        )
        assert data.current_password == "OldP@ss123"
        assert data.new_password == "NewP@ss456!"

    def test_weak_new_password(self) -> None:
        """Weak new password should fail validation."""
        with pytest.raises(ValidationError):
            ChangePasswordRequest(
                current_password="OldP@ss123",
                new_password="weak",
            )


class TestUpdateRoleRequest:
    """Tests for UpdateRoleRequest schema."""

    def test_valid_role_update(self) -> None:
        """Valid role should pass."""
        data = UpdateRoleRequest(role=UserRole.TEACHER)
        assert data.role == UserRole.TEACHER

    def test_string_role(self) -> None:
        """String role should be converted to enum."""
        data = UpdateRoleRequest(role="student")  # type: ignore
        assert data.role == UserRole.STUDENT

    def test_invalid_role(self) -> None:
        """Invalid role should fail."""
        with pytest.raises(ValidationError):
            UpdateRoleRequest(role="invalid_role")  # type: ignore


class TestValidateCPFRequest:
    """Tests for ValidateCPFRequest schema."""

    def test_valid_cpf(self) -> None:
        """CPF string should be accepted."""
        data = ValidateCPFRequest(cpf="529.982.247-25")
        assert data.cpf == "529.982.247-25"


class TestValidateCPFResponse:
    """Tests for ValidateCPFResponse schema."""

    def test_valid_response(self) -> None:
        """Response should have all fields."""
        data = ValidateCPFResponse(
            valid=True,
            formatted="529.982.247-25",
            available=True,
        )
        assert data.valid is True
        assert data.formatted == "529.982.247-25"
        assert data.available is True

    def test_invalid_response(self) -> None:
        """Invalid CPF response."""
        data = ValidateCPFResponse(valid=False)
        assert data.valid is False
        assert data.formatted is None
        assert data.available is None


class TestValidateEmailRequest:
    """Tests for ValidateEmailRequest schema."""

    def test_valid_email(self) -> None:
        """Valid email should pass."""
        data = ValidateEmailRequest(email="test@example.com")
        assert data.email == "test@example.com"

    def test_invalid_email(self) -> None:
        """Invalid email should fail."""
        with pytest.raises(ValidationError):
            ValidateEmailRequest(email="invalid")


class TestValidateEmailResponse:
    """Tests for ValidateEmailResponse schema."""

    def test_available(self) -> None:
        """Should indicate availability."""
        data = ValidateEmailResponse(available=True)
        assert data.available is True

    def test_not_available(self) -> None:
        """Should indicate unavailability."""
        data = ValidateEmailResponse(available=False)
        assert data.available is False
