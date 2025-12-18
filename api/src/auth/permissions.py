"""Role-based access control (RBAC) for FarmaEasy.

Hierarchical permission system:
- ADMIN (level 3): Full system access
- TEACHER (level 2): Manage own courses, view enrolled students
- STUDENT (level 1): Access courses with active subscription
- USER (level 0): Registered user without subscription
"""

from enum import Enum


class UserRole(str, Enum):
    """User roles with hierarchical levels.

    Higher level = more permissions.
    ADMIN can do everything TEACHER can do, and more.
    TEACHER can do everything STUDENT can do, and more.
    """

    USER = "user"  # Level 0: Basic registered user
    STUDENT = "student"  # Level 1: User with active subscription
    TEACHER = "teacher"  # Level 2: Course instructor
    ADMIN = "admin"  # Level 3: System administrator


# Role hierarchy mapping (role -> permission level)
ROLE_HIERARCHY: dict[UserRole, int] = {
    UserRole.USER: 0,
    UserRole.STUDENT: 1,
    UserRole.TEACHER: 2,
    UserRole.ADMIN: 3,
}


def get_role_level(role: UserRole | str) -> int:
    """Get the permission level for a role.

    Args:
        role: UserRole enum or string representation

    Returns:
        Permission level (0-3), defaults to 0 for unknown roles
    """
    if isinstance(role, str):
        try:
            role = UserRole(role)
        except ValueError:
            return 0
    return ROLE_HIERARCHY.get(role, 0)


def has_permission(user_role: UserRole | str, required_role: UserRole | str) -> bool:
    """Check if user has at least the required permission level.

    Uses hierarchical comparison: ADMIN >= TEACHER >= STUDENT >= USER

    Args:
        user_role: The user's current role
        required_role: The minimum required role

    Returns:
        True if user_role level >= required_role level

    Examples:
        >>> has_permission(UserRole.ADMIN, UserRole.TEACHER)
        True
        >>> has_permission(UserRole.STUDENT, UserRole.TEACHER)
        False
        >>> has_permission("admin", "student")
        True
    """
    return get_role_level(user_role) >= get_role_level(required_role)


def can_manage_role(user_role: UserRole | str, target_role: UserRole | str) -> bool:
    """Check if user can manage (promote/demote) another user's role.

    Users can only manage roles BELOW their own level.
    ADMIN can manage TEACHER, STUDENT, USER.
    TEACHER cannot manage anyone (same or lower level).

    Args:
        user_role: The managing user's role
        target_role: The role to be assigned

    Returns:
        True if user can assign target_role

    Examples:
        >>> can_manage_role(UserRole.ADMIN, UserRole.TEACHER)
        True
        >>> can_manage_role(UserRole.TEACHER, UserRole.STUDENT)
        False
    """
    return get_role_level(user_role) > get_role_level(target_role)


def is_admin(role: UserRole | str) -> bool:
    """Check if role is ADMIN."""
    if isinstance(role, str):
        return role == UserRole.ADMIN.value
    return role == UserRole.ADMIN


def is_teacher(role: UserRole | str) -> bool:
    """Check if role is TEACHER."""
    if isinstance(role, str):
        return role == UserRole.TEACHER.value
    return role == UserRole.TEACHER


def is_student(role: UserRole | str) -> bool:
    """Check if role is STUDENT."""
    if isinstance(role, str):
        return role == UserRole.STUDENT.value
    return role == UserRole.STUDENT


def is_at_least_teacher(role: UserRole | str) -> bool:
    """Check if role is TEACHER or higher (ADMIN)."""
    return has_permission(role, UserRole.TEACHER)


def is_at_least_student(role: UserRole | str) -> bool:
    """Check if role is STUDENT or higher (TEACHER, ADMIN)."""
    return has_permission(role, UserRole.STUDENT)
