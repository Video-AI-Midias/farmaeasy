"""Tests for auth permissions."""

import pytest

from src.auth.permissions import (
    ROLE_HIERARCHY,
    UserRole,
    can_manage_role,
    get_role_level,
    has_permission,
)


class TestUserRole:
    """Tests for UserRole enum."""

    def test_role_values(self) -> None:
        """Roles should have correct string values."""
        assert UserRole.USER.value == "user"
        assert UserRole.STUDENT.value == "student"
        assert UserRole.TEACHER.value == "teacher"
        assert UserRole.ADMIN.value == "admin"

    def test_role_hierarchy(self) -> None:
        """Roles should have correct hierarchy levels."""
        assert ROLE_HIERARCHY[UserRole.USER] == 0
        assert ROLE_HIERARCHY[UserRole.STUDENT] == 1
        assert ROLE_HIERARCHY[UserRole.TEACHER] == 2
        assert ROLE_HIERARCHY[UserRole.ADMIN] == 3

    def test_all_roles_have_levels(self) -> None:
        """All UserRole members should have defined levels."""
        for role in UserRole:
            assert role in ROLE_HIERARCHY


class TestGetRoleLevel:
    """Tests for get_role_level function."""

    @pytest.mark.parametrize(
        "role,expected_level",
        [
            (UserRole.USER, 0),
            (UserRole.STUDENT, 1),
            (UserRole.TEACHER, 2),
            (UserRole.ADMIN, 3),
        ],
    )
    def test_enum_roles(self, role: UserRole, expected_level: int) -> None:
        """Should return correct level for enum roles."""
        assert get_role_level(role) == expected_level

    @pytest.mark.parametrize(
        "role,expected_level",
        [
            ("user", 0),
            ("student", 1),
            ("teacher", 2),
            ("admin", 3),
        ],
    )
    def test_string_roles(self, role: str, expected_level: int) -> None:
        """Should return correct level for string roles."""
        assert get_role_level(role) == expected_level

    def test_invalid_role_returns_zero(self) -> None:
        """Invalid roles should return level 0."""
        assert get_role_level("invalid") == 0
        assert get_role_level("superadmin") == 0


class TestHasPermission:
    """Tests for has_permission function."""

    def test_admin_has_all_permissions(self) -> None:
        """Admin should have access to all role levels."""
        assert has_permission(UserRole.ADMIN, UserRole.USER) is True
        assert has_permission(UserRole.ADMIN, UserRole.STUDENT) is True
        assert has_permission(UserRole.ADMIN, UserRole.TEACHER) is True
        assert has_permission(UserRole.ADMIN, UserRole.ADMIN) is True

    def test_teacher_permissions(self) -> None:
        """Teacher should have access up to teacher level."""
        assert has_permission(UserRole.TEACHER, UserRole.USER) is True
        assert has_permission(UserRole.TEACHER, UserRole.STUDENT) is True
        assert has_permission(UserRole.TEACHER, UserRole.TEACHER) is True
        assert has_permission(UserRole.TEACHER, UserRole.ADMIN) is False

    def test_student_permissions(self) -> None:
        """Student should have access up to student level."""
        assert has_permission(UserRole.STUDENT, UserRole.USER) is True
        assert has_permission(UserRole.STUDENT, UserRole.STUDENT) is True
        assert has_permission(UserRole.STUDENT, UserRole.TEACHER) is False
        assert has_permission(UserRole.STUDENT, UserRole.ADMIN) is False

    def test_user_permissions(self) -> None:
        """User should only have base access."""
        assert has_permission(UserRole.USER, UserRole.USER) is True
        assert has_permission(UserRole.USER, UserRole.STUDENT) is False
        assert has_permission(UserRole.USER, UserRole.TEACHER) is False
        assert has_permission(UserRole.USER, UserRole.ADMIN) is False

    def test_string_roles(self) -> None:
        """Should work with string role values."""
        assert has_permission("admin", "user") is True
        assert has_permission("user", "admin") is False
        assert has_permission("teacher", "student") is True


class TestCanManageRole:
    """Tests for can_manage_role function."""

    def test_admin_can_manage_lower_roles(self) -> None:
        """Admin can assign roles below admin level."""
        assert can_manage_role(UserRole.ADMIN, UserRole.USER) is True
        assert can_manage_role(UserRole.ADMIN, UserRole.STUDENT) is True
        assert can_manage_role(UserRole.ADMIN, UserRole.TEACHER) is True

    def test_admin_cannot_manage_admin(self) -> None:
        """Admin cannot assign admin role (security constraint)."""
        assert can_manage_role(UserRole.ADMIN, UserRole.ADMIN) is False

    def test_teacher_can_manage_lower_roles(self) -> None:
        """Teacher can assign roles below teacher level."""
        assert can_manage_role(UserRole.TEACHER, UserRole.USER) is True
        assert can_manage_role(UserRole.TEACHER, UserRole.STUDENT) is True

    def test_teacher_cannot_manage_same_or_higher(self) -> None:
        """Teacher cannot assign teacher or admin roles."""
        assert can_manage_role(UserRole.TEACHER, UserRole.TEACHER) is False
        assert can_manage_role(UserRole.TEACHER, UserRole.ADMIN) is False

    def test_student_can_manage_user(self) -> None:
        """Student can assign user role."""
        assert can_manage_role(UserRole.STUDENT, UserRole.USER) is True

    def test_student_cannot_manage_same_or_higher(self) -> None:
        """Student cannot assign student or higher roles."""
        assert can_manage_role(UserRole.STUDENT, UserRole.STUDENT) is False
        assert can_manage_role(UserRole.STUDENT, UserRole.TEACHER) is False
        assert can_manage_role(UserRole.STUDENT, UserRole.ADMIN) is False

    def test_user_cannot_manage_any(self) -> None:
        """User cannot assign any roles (lowest level)."""
        assert can_manage_role(UserRole.USER, UserRole.USER) is False
        assert can_manage_role(UserRole.USER, UserRole.STUDENT) is False
        assert can_manage_role(UserRole.USER, UserRole.TEACHER) is False
        assert can_manage_role(UserRole.USER, UserRole.ADMIN) is False
