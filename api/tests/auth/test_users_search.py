"""Tests for teacher user search endpoint (GET /auth/users/search).

TDD RED Phase tests for the new endpoint that allows teachers
to search for users (only USER/STUDENT roles are visible).
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
        role: UserRole = UserRole.USER,
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
def sample_users(mock_user_factory) -> list[UserResponse]:
    """Create a sample list of users with different roles."""
    return [
        mock_user_factory(UserRole.USER, "user1@test.com", "User One"),
        mock_user_factory(UserRole.USER, "user2@test.com", "User Two"),
        mock_user_factory(UserRole.STUDENT, "student1@test.com", "Student One"),
        mock_user_factory(UserRole.STUDENT, "student2@test.com", "Student Two"),
        mock_user_factory(UserRole.TEACHER, "teacher1@test.com", "Teacher Hidden"),
        mock_user_factory(UserRole.ADMIN, "admin1@test.com", "Admin Hidden"),
    ]


@pytest.fixture
def mock_auth_service(sample_users):
    """Create a mock AuthService with sample users."""
    from src.auth.models import User

    service = MagicMock()

    # Convert UserResponse to mock User models for service
    mock_users = []
    for ur in sample_users:
        user = MagicMock(spec=User)
        user.id = ur.id
        user.email = ur.email
        user.name = ur.name
        user.phone = ur.phone
        user.role = ur.role
        user.is_active = ur.is_active
        user.cpf = None
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
        user.created_at = ur.created_at
        user.updated_at = None
        mock_users.append(user)

    async def mock_search_users(
        search: str | None = None,
        role: UserRole | None = None,
        limit: int = 50,
    ) -> list[Any]:
        result = mock_users
        if search:
            search_lower = search.lower()
            result = [
                u
                for u in result
                if search_lower in u.email.lower()
                or (u.name and search_lower in u.name.lower())
            ]
        if role:
            result = [u for u in result if u.role == role.value]
        return result[:limit]

    service.search_users = AsyncMock(side_effect=mock_search_users)
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


# ==============================================================================
# Tests - Teacher Search Users Endpoint
# ==============================================================================


class TestTeacherSearchUsersEndpoint:
    """Tests for GET /v1/auth/users/search endpoint."""

    def test_teacher_can_access_search_endpoint(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher should have access to /users/search endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )

        # Endpoint should exist and be accessible
        assert response.status_code == 200

    def test_teacher_search_users_returns_only_students_and_users(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher should only see USER and STUDENT roles in search results."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "items" in data
        assert "total" in data

        # All returned users should be USER or STUDENT
        for user in data["items"]:
            assert user["role"] in [UserRole.USER.value, UserRole.STUDENT.value]

    def test_teacher_search_users_excludes_teachers_and_admins(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher should NOT see TEACHER or ADMIN roles in search results."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # No TEACHER or ADMIN users should be present
        for user in data["items"]:
            assert user["role"] not in [UserRole.TEACHER.value, UserRole.ADMIN.value]

        # Should have 4 users (2 USER + 2 STUDENT from sample_users)
        assert data["total"] == 4

    def test_teacher_search_with_filter(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher search should filter by search term."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {teacher_token}"},
            params={"search": "student"},
        )

        assert response.status_code == 200
        data = response.json()

        # Should only return students matching the search term
        assert data["total"] >= 1
        for user in data["items"]:
            assert (
                "student" in user["email"].lower() or "student" in user["name"].lower()
            )

    def test_teacher_search_with_limit(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher search should respect limit parameter."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {teacher_token}"},
            params={"limit": 2},
        )

        assert response.status_code == 200
        data = response.json()

        # Should return at most 2 items
        assert len(data["items"]) <= 2


class TestAdminSearchUsersEndpoint:
    """Tests for admin access to /users/search endpoint."""

    def test_admin_can_access_search_endpoint(
        self,
        client_with_mock_service: TestClient,
        admin_token: str,
    ) -> None:
        """Admin should have access to /users/search endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200

    def test_admin_search_also_filters_to_user_student(
        self,
        client_with_mock_service: TestClient,
        admin_token: str,
    ) -> None:
        """Admin using /users/search should also only see USER and STUDENT.

        The /users/search endpoint is designed for grant access flow,
        so it always filters to USER/STUDENT regardless of caller role.
        Admin can use /users endpoint for full access.
        """
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        for user in data["items"]:
            assert user["role"] in [UserRole.USER.value, UserRole.STUDENT.value]


class TestUnauthorizedSearchUsers:
    """Tests for unauthorized access to /users/search endpoint."""

    def test_student_cannot_access_search_endpoint(
        self,
        client_with_mock_service: TestClient,
        student_token: str,
    ) -> None:
        """Student should NOT have access to /users/search endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {student_token}"},
        )

        assert response.status_code == 403

    def test_user_cannot_access_search_endpoint(
        self,
        client_with_mock_service: TestClient,
        user_token: str,
    ) -> None:
        """Regular user should NOT have access to /users/search endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users/search",
            headers={"Authorization": f"Bearer {user_token}"},
        )

        assert response.status_code == 403

    def test_unauthenticated_cannot_access_search_endpoint(
        self,
        client_with_mock_service: TestClient,
    ) -> None:
        """Unauthenticated request should get 401."""
        response = client_with_mock_service.get("/v1/auth/users/search")

        assert response.status_code == 401


class TestOriginalUsersEndpointUnchanged:
    """Tests to ensure original /users endpoint still works for admin."""

    def test_admin_can_still_use_original_users_endpoint(
        self,
        client_with_mock_service: TestClient,
        admin_token: str,
    ) -> None:
        """Admin should still have access to original /users endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200

    def test_teacher_cannot_use_original_users_endpoint(
        self,
        client_with_mock_service: TestClient,
        teacher_token: str,
    ) -> None:
        """Teacher should NOT have access to original /users endpoint."""
        response = client_with_mock_service.get(
            "/v1/auth/users",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )

        assert response.status_code == 403
