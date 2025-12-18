"""Course acquisition models and Cassandra schema.

Tracks how users acquired access to courses:
- FREE: Auto-enrollment for free courses
- PURCHASE: Paid via payment gateway (future)
- ADMIN_GRANT: Manually granted by admin
- PROMO: Promotional code (future)
- GIFT: Gifted by another user (future)
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4


if TYPE_CHECKING:
    from cassandra.cluster import Row


class AcquisitionType(str, Enum):
    """How the user acquired access to the course."""

    FREE = "free"  # Free course, auto-enrollment
    PURCHASE = "purchase"  # Paid via payment gateway
    ADMIN_GRANT = "admin_grant"  # Manually granted by admin
    PROMO = "promo"  # Promotional code
    GIFT = "gift"  # Gifted by another user


class AcquisitionStatus(str, Enum):
    """Current status of the acquisition."""

    PENDING = "pending"  # Awaiting payment confirmation
    ACTIVE = "active"  # Access is active
    EXPIRED = "expired"  # Access has expired
    REVOKED = "revoked"  # Revoked by admin


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

COURSE_ACQUISITIONS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.course_acquisitions (
    user_id UUID,
    course_id UUID,
    acquisition_id UUID,
    acquisition_type TEXT,
    status TEXT,
    granted_by UUID,
    granted_at TIMESTAMP,
    expires_at TIMESTAMP,
    payment_id TEXT,
    payment_amount DECIMAL,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    PRIMARY KEY ((user_id), course_id, acquisition_id)
) WITH CLUSTERING ORDER BY (course_id ASC, acquisition_id DESC)
"""

ACQUISITIONS_BY_COURSE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.acquisitions_by_course (
    course_id UUID,
    user_id UUID,
    acquisition_id UUID,
    acquisition_type TEXT,
    status TEXT,
    granted_at TIMESTAMP,
    expires_at TIMESTAMP,
    PRIMARY KEY ((course_id), granted_at, user_id)
) WITH CLUSTERING ORDER BY (granted_at DESC, user_id ASC)
"""

# Index for filtering by status
ACQUISITIONS_STATUS_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS ON {keyspace}.course_acquisitions (status)
"""


# List of all CQL statements (format with keyspace before executing)
ACQUISITIONS_TABLES_CQL = [
    COURSE_ACQUISITIONS_TABLE_CQL,
    ACQUISITIONS_BY_COURSE_TABLE_CQL,
    ACQUISITIONS_STATUS_INDEX_CQL,
]


def get_acquisitions_tables_cql(keyspace: str) -> list[str]:
    """Get all CQL statements for acquisitions tables."""
    return [cql.format(keyspace=keyspace) for cql in ACQUISITIONS_TABLES_CQL]


# ==============================================================================
# Entity
# ==============================================================================


def ensure_utc_aware(dt: datetime | None) -> datetime | None:
    """Ensure datetime is UTC-aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


@dataclass
class CourseAcquisition:
    """Represents a user's acquisition of course access."""

    user_id: UUID
    course_id: UUID
    acquisition_type: AcquisitionType
    status: AcquisitionStatus = AcquisitionStatus.ACTIVE
    acquisition_id: UUID = field(default_factory=uuid4)
    granted_by: UUID | None = None
    granted_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None
    payment_id: str | None = None
    payment_amount: Decimal | None = None
    payment_method: str | None = None
    notes: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def from_row(cls, row: "Row") -> "CourseAcquisition":
        """Create instance from Cassandra row."""
        return cls(
            user_id=row.user_id,
            course_id=row.course_id,
            acquisition_id=row.acquisition_id,
            acquisition_type=AcquisitionType(row.acquisition_type),
            status=AcquisitionStatus(row.status),
            granted_by=row.granted_by,
            granted_at=ensure_utc_aware(row.granted_at) or datetime.now(UTC),
            expires_at=ensure_utc_aware(row.expires_at),
            payment_id=row.payment_id,
            payment_amount=row.payment_amount,
            payment_method=getattr(row, "payment_method", None),
            notes=row.notes,
            created_at=ensure_utc_aware(row.created_at) or datetime.now(UTC),
            updated_at=ensure_utc_aware(row.updated_at) or datetime.now(UTC),
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "user_id": self.user_id,
            "course_id": self.course_id,
            "acquisition_id": self.acquisition_id,
            "acquisition_type": self.acquisition_type.value,
            "status": self.status.value,
            "granted_by": self.granted_by,
            "granted_at": self.granted_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "payment_id": self.payment_id,
            "payment_amount": str(self.payment_amount) if self.payment_amount else None,
            "payment_method": self.payment_method,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def is_active(self) -> bool:
        """Check if acquisition grants active access."""
        if self.status != AcquisitionStatus.ACTIVE:
            return False
        return not (self.expires_at and datetime.now(UTC) > self.expires_at)


# ==============================================================================
# Factory Functions
# ==============================================================================


def create_free_acquisition(
    user_id: UUID,
    course_id: UUID,
) -> CourseAcquisition:
    """Create acquisition for free course enrollment."""
    return CourseAcquisition(
        user_id=user_id,
        course_id=course_id,
        acquisition_type=AcquisitionType.FREE,
        status=AcquisitionStatus.ACTIVE,
    )


def create_admin_grant(
    user_id: UUID,
    course_id: UUID,
    granted_by: UUID,
    expires_at: datetime | None = None,
    notes: str | None = None,
) -> CourseAcquisition:
    """Create acquisition granted by admin."""
    return CourseAcquisition(
        user_id=user_id,
        course_id=course_id,
        acquisition_type=AcquisitionType.ADMIN_GRANT,
        status=AcquisitionStatus.ACTIVE,
        granted_by=granted_by,
        expires_at=expires_at,
        notes=notes,
    )


def create_purchase_acquisition(
    user_id: UUID,
    course_id: UUID,
    payment_id: str,
    payment_amount: Decimal,
    payment_method: str,
) -> CourseAcquisition:
    """Create acquisition from purchase (for future payment integration)."""
    return CourseAcquisition(
        user_id=user_id,
        course_id=course_id,
        acquisition_type=AcquisitionType.PURCHASE,
        status=AcquisitionStatus.PENDING,  # Will be activated after payment confirmation
        payment_id=payment_id,
        payment_amount=payment_amount,
        payment_method=payment_method,
    )
