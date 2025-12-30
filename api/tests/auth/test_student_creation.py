"""Tests for teacher student creation endpoint (POST /auth/users/student).

TDD RED Phase tests for the new endpoint that allows teachers
to create student accounts with optional auto-grant access.
"""

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.auth.permissions import UserRole
from src.auth.schemas import UserResponse


# ==============================================================================
# Fixtures
# ==============================================================================


@pytest.fixture
def mock_user_factory():
    """Factory to create mock UserResponse objects."""

    def _create_user(
        role: UserRole = UserRole.STUDENT,
        email: str | None = None,
        name: str | None = None,
    ) -> UserResponse:
        user_id = uuid4()
        return UserResponse(
            id=user_id,
            email=email or f"{role.value}_{user_id.hex[:8]}@test.com",
            name=name or f"Test {role.value.title()}",
            phone="11999990000",
            role=role.value,
            is_active=True,
            created_at=datetime.now(),
        )

    return _create_user


@pytest.fixture
def mock_auth_service(mock_user_factory):
    """Create a mock AuthService."""
    from src.auth.models import User

    service = MagicMock()

    # Track created users for assertions
    created_users = []

    async def mock_admin_create_user(data: Any) -> MagicMock:
        """Mock user creation."""
        user = MagicMock(spec=User)
        user.id = uuid4()
        user.email = data.email.lower()
        user.name = data.name
        user.phone = data.phone
        user.role = data.role.value if hasattr(data, "role") else UserRole.STUDENT.value
        user.is_active = True
        user.cpf = data.cpf if hasattr(data, "cpf") else None
        user.rg = None
        user.avatar_url = None
        user.address_street = None
        user.address_number = None
        user.address_complement = None
        user.address_neighborhood = None
        user.address_city = None
        user.address_state = None
        user.address_zip_code = None
        user.max_concurrent_sessions = None
        user.created_at = datetime.now()
        user.updated_at = None
        created_users.append(user)
        return user

    service.admin_create_user = AsyncMock(side_effect=mock_admin_create_user)
    service.get_user_by_email = AsyncMock(return_value=None)  # Email available
    service.to_response = MagicMock(side_effect=lambda u: UserResponse.from_user(u))

    return service


@pytest.fixture
def teacher_token() -> str:
    """Create a mock JWT token for a teacher user."""
    from src.auth.security import create_access_token

    return create_access_token(
        {
            "sub": str(uuid4()),
            "email": "teacher@test.com",
            "role": UserRole.TEACHER.value,
        }
    )


@pytest.fixture
def admin_token() -> str:
    """Create a mock JWT token for an admin user."""
    from src.auth.security import create_access_token

    return create_access_token(
        {
            "sub": str(uuid4()),
            "email": "admin@test.com",
            "role": UserRole.ADMIN.value,
        }
    )


@pytest.fixture
def student_token() -> str:
    """Create a mock JWT token for a student user."""
    from src.auth.security import create_access_token

    return create_access_token(
        {
            "sub": str(uuid4()),
            "email": "student@test.com",
            "role": UserRole.STUDENT.value,
        }
    )


@pytest.fixture
def user_token() -> str:
    """Create a mock JWT token for a regular user."""
    from src.auth.security import create_access_token

    return create_access_token(
        {
            "sub": str(uuid4()),
            "email": "user@test.com",
            "role": UserRole.USER.value,
        }
    )


@pytest.fixture
def client_with_mock_service(mock_auth_service) -> TestClient:
    """Create test client with mocked auth service."""
    from src.auth.router import set_auth_service_getter
    from src.main import app

    # Override the auth service getter
    set_auth_service_getter(lambda: mock_auth_service)

    return TestClient(app)


@pytest.fixture
def valid_student_data() -> dict:
    """Valid student creation data."""
    return {
        "email": "newstudent@test.com",
        "password": "SecurePass123!",
        "name": "New Student",
        "phone": "11999999999",
    }


# ==============================================================================
# Tests - Teacher Create Student Endpoint
# ==============================================================================


class TestTeacherCreateStudentEndpoint:
    """Tests for POST /v1/auth/users/student endpoint."""

    def test_teacher_can_create_student(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
        valid_student_data: dict,
    ) -> None:
        """Teacher should be able to create a student."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 201
        data = response.json()

        # Check response structure
        assert "user" in data
        assert data["user"]["email"] == valid_student_data["email"].lower()
        assert data["user"]["role"] == UserRole.STUDENT.value

    def test_created_user_always_has_student_role(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
        valid_student_data: dict,
    ) -> None:
        """Created user should always have STUDENT role, regardless of request."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["user"]["role"] == UserRole.STUDENT.value

    def test_create_student_with_minimal_data(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Should create student with only required fields."""
        minimal_data = {
            "email": "minimal@test.com",
            "password": "SecurePass123!",
        }

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=minimal_data,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["user"]["email"] == "minimal@test.com"

    def test_create_student_with_cpf(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
        valid_student_data: dict,
    ) -> None:
        """Should create student with CPF."""
        valid_student_data["cpf"] = "529.982.247-25"  # Valid CPF

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 201

    def test_response_includes_course_access_info(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
        valid_student_data: dict,
    ) -> None:
        """Response should include course access information."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 201
        data = response.json()

        # Response should have course access fields
        assert "course_access_granted" in data
        assert "acquisition_id" in data
        assert "welcome_email_sent" in data


class TestAdminCreateStudentEndpoint:
    """Tests for admin access to student creation endpoint."""

    def test_admin_can_also_create_student(
        self,
        client_with_mock_service: TestClient,
        admin_token: str,
        valid_student_data: dict,
    ) -> None:
        """Admin should also have access to create students via this endpoint."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["user"]["role"] == UserRole.STUDENT.value


class TestUnauthorizedCreateStudent:
    """Tests for unauthorized access to student creation endpoint."""

    def test_student_cannot_create_student(
        self,
        client_with_mock_service: TestClient,
        student_token: str,
        valid_student_data: dict,
    ) -> None:
        """Student should NOT have access to create students."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {student_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 403

    def test_user_cannot_create_student(
        self,
        client_with_mock_service: TestClient,
        user_token: str,
        valid_student_data: dict,
    ) -> None:
        """Regular user should NOT have access to create students."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {user_token}"},
            json=valid_student_data,
        )

        assert response.status_code == 403

    def test_unauthenticated_cannot_create_student(
        self,
        client_with_mock_service: TestClient,
        valid_student_data: dict,
    ) -> None:
        """Unauthenticated request should get 401."""
        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            json=valid_student_data,
        )

        assert response.status_code == 401


class TestCreateStudentValidation:
    """Tests for validation of student creation request."""

    def test_invalid_email_rejected(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Invalid email should be rejected."""
        invalid_data = {
            "email": "not-an-email",
            "password": "SecurePass123!",
        }

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=invalid_data,
        )

        assert response.status_code == 422

    def test_weak_password_rejected(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Weak password should be rejected."""
        invalid_data = {
            "email": "student@test.com",
            "password": "123",  # Too short and weak
        }

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=invalid_data,
        )

        assert response.status_code == 422

    def test_invalid_cpf_rejected(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Invalid CPF should be rejected."""
        invalid_data = {
            "email": "student@test.com",
            "password": "SecurePass123!",
            "cpf": "123.456.789-00",  # Invalid CPF
        }

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=invalid_data,
        )

        assert response.status_code == 422

    def test_invalid_phone_rejected(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Invalid phone should be rejected."""
        invalid_data = {
            "email": "student@test.com",
            "password": "SecurePass123!",
            "phone": "123",  # Too short
        }

        response = client_with_mock_service.post(
            "/v1/auth/users/student",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json=invalid_data,
        )

        assert response.status_code == 422
