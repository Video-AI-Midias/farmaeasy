"""Role-based access control (RBAC) for FarmaEasy.

Re-exports from authorization-module for consistent permission management.
Provides:
- UserRole enum with hierarchical levels
- Permission checking functions
- Role management utilities
"""

from authorization.permissions import (
    ROLE_HIERARCHY,
    UserRole,
    can_manage_role,
    get_role_level,
    has_permission,
    is_admin,
    is_at_least_student,
    is_at_least_teacher,
    is_student,
    is_teacher,
)


__all__ = [
    "ROLE_HIERARCHY",
    "UserRole",
    "can_manage_role",
    "get_role_level",
    "has_permission",
    "is_admin",
    "is_at_least_student",
    "is_at_least_teacher",
    "is_student",
    "is_teacher",
]
