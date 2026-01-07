"""Role-based access control (RBAC) for FarmaEasy.

Re-exports from authorization-module for consistent permission management.
Provides:
- UserRole enum with hierarchical levels
- Permission checking functions
- Role management utilities
"""

from authorization.permissions import (
    UserRole,
    ROLE_HIERARCHY,
    get_role_level,
    has_permission,
    can_manage_role,
    is_admin,
    is_teacher,
    is_student,
    is_at_least_teacher,
    is_at_least_student,
)

__all__ = [
    "UserRole",
    "ROLE_HIERARCHY",
    "get_role_level",
    "has_permission",
    "can_manage_role",
    "is_admin",
    "is_teacher",
    "is_student",
    "is_at_least_teacher",
    "is_at_least_student",
]
