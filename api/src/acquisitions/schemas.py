"""Pydantic schemas for course acquisitions.

Request/Response models for:
- Checking course access
- Granting access (admin)
- Listing acquisitions
- Enrollment in free courses
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .models import AcquisitionStatus, AcquisitionType, CourseAcquisition


# ==============================================================================
# Enums
# ==============================================================================


class AccessReason(str, Enum):
    """Reason for course access grant."""

    ACQUISITION = "acquisition"  # Student has valid acquisition
    ADMIN_ROLE = "admin_role"  # Admin viewing any course
    COURSE_OWNER = "course_owner"  # Teacher viewing their own course


# ==============================================================================
# Response Schemas
# ==============================================================================


class AcquisitionResponse(BaseModel):
    """Response schema for a single acquisition."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Acquisition ID")
    user_id: UUID
    course_id: UUID
    acquisition_type: AcquisitionType
    status: AcquisitionStatus
    granted_by: UUID | None = None
    granted_at: datetime
    expires_at: datetime | None = None
    payment_id: str | None = None
    payment_amount: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    is_active: bool = Field(..., description="Whether access is currently active")

    @classmethod
    def from_acquisition(cls, acq: CourseAcquisition) -> "AcquisitionResponse":
        """Create response from CourseAcquisition entity."""
        return cls(
            id=acq.acquisition_id,
            user_id=acq.user_id,
            course_id=acq.course_id,
            acquisition_type=acq.acquisition_type,
            status=acq.status,
            granted_by=acq.granted_by,
            granted_at=acq.granted_at,
            expires_at=acq.expires_at,
            payment_id=acq.payment_id,
            payment_amount=acq.payment_amount,
            notes=acq.notes,
            created_at=acq.created_at,
            is_active=acq.is_active(),
        )


class AcquisitionListResponse(BaseModel):
    """Response schema for listing acquisitions."""

    items: list[AcquisitionResponse]
    total: int
    has_more: bool = False
    next_cursor: str | None = None


class CheckAccessResponse(BaseModel):
    """Response for checking course access."""

    has_access: bool = Field(..., description="Whether user has active access")
    access_reason: AccessReason | None = Field(
        None, description="Why user has access (if has_access=True)"
    )
    acquisition_type: AcquisitionType | None = Field(
        None, description="How access was acquired (only for ACQUISITION reason)"
    )
    expires_at: datetime | None = Field(
        None, description="When access expires (if temporary acquisition)"
    )
    acquisition_id: UUID | None = Field(
        None, description="Acquisition ID (only for ACQUISITION reason)"
    )
    can_enroll: bool = Field(
        default=True,
        description="Whether user can enroll (for students without access)",
    )
    is_preview_mode: bool = Field(
        default=False, description="True if access is via role (not acquisition)"
    )


class CourseStudentResponse(BaseModel):
    """Response for listing students with course access."""

    user_id: UUID
    user_name: str
    user_email: str
    user_avatar: str | None = None
    acquisition_type: AcquisitionType
    status: AcquisitionStatus
    granted_at: datetime
    expires_at: datetime | None = None
    progress_percent: float = 0.0
    is_active: bool


class CourseStudentsListResponse(BaseModel):
    """Response for listing all students in a course."""

    items: list[CourseStudentResponse]
    total: int
    active_count: int
    has_more: bool = False
    next_cursor: str | None = None


# ==============================================================================
# Request Schemas
# ==============================================================================


class GrantAccessRequest(BaseModel):
    """Request to grant course access (admin)."""

    user_id: UUID = Field(..., description="User to grant access to")
    course_id: UUID = Field(..., description="Course to grant access to")
    expires_in_days: int | None = Field(
        None, description="Days until access expires (None = permanent)"
    )
    notes: str | None = Field(None, description="Admin notes", max_length=500)


class RevokeAccessRequest(BaseModel):
    """Request to revoke course access (admin)."""

    reason: str | None = Field(
        None, description="Reason for revocation", max_length=500
    )


class EnrollFreeRequest(BaseModel):
    """Request to enroll in a free course."""

    course_id: UUID = Field(..., description="Course to enroll in")


class BatchGrantAccessRequest(BaseModel):
    """Request to grant access to multiple users."""

    user_ids: list[UUID] = Field(
        ..., description="Users to grant access to", min_length=1
    )
    course_id: UUID = Field(..., description="Course to grant access to")
    expires_in_days: int | None = Field(None, description="Days until access expires")
    notes: str | None = Field(None, description="Admin notes", max_length=500)


class BatchGrantAccessResponse(BaseModel):
    """Response for batch grant operation."""

    granted: int = Field(..., description="Number of accesses granted")
    skipped: int = Field(..., description="Number skipped (already had access)")
    errors: list[str] = Field(default_factory=list, description="Error messages if any")


# ==============================================================================
# Course Extension Schemas
# ==============================================================================


class CoursePricingInfo(BaseModel):
    """Pricing information for a course."""

    price: Decimal | None = Field(None, description="Price in BRL (None = free)")
    is_free: bool = Field(True, description="Whether course is free")
    requires_enrollment: bool = Field(
        True, description="Whether enrollment is required"
    )


class CourseAccessInfo(BaseModel):
    """Access information for a course (from user perspective)."""

    has_access: bool = Field(..., description="Whether current user has access")
    acquisition_type: AcquisitionType | None = None
    expires_at: datetime | None = None
    can_enroll: bool = Field(..., description="Whether user can self-enroll")
