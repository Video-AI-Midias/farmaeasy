"""Registration link models and Cassandra schema.

Provides:
- RegistrationLink entity
- Cassandra table definitions for links and lookup
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4


if TYPE_CHECKING:
    from cassandra.cluster import Row


class LinkStatus(str, Enum):
    """Status of a registration link."""

    PENDING = "pending"  # Link created, not yet used
    USED = "used"  # Link has been used successfully
    EXPIRED = "expired"  # Link has expired (unused)
    REVOKED = "revoked"  # Link was revoked by admin


class LinkSource(str, Enum):
    """Source of the registration link."""

    WHATSAPP = "whatsapp"  # Created for WhatsApp customer
    MANUAL = "manual"  # Manually created by admin
    API = "api"  # Created via API integration


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

REGISTRATION_LINKS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.registration_links (
    id UUID PRIMARY KEY,
    shortcode TEXT,
    token_hash TEXT,
    status TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    created_by UUID,
    source TEXT,
    notes TEXT,
    prefill_phone TEXT,
    course_ids SET<UUID>,
    user_id UUID,
    used_at TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
)
"""

REGISTRATION_LINKS_SHORTCODE_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS registration_links_shortcode_idx
ON {keyspace}.registration_links (shortcode)
"""

REGISTRATION_LINKS_STATUS_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS registration_links_status_idx
ON {keyspace}.registration_links (status)
"""

REGISTRATION_LINKS_BY_SHORTCODE_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.registration_links_by_shortcode (
    shortcode TEXT PRIMARY KEY,
    link_id UUID,
    token_hash TEXT,
    status TEXT,
    expires_at TIMESTAMP,
    course_ids SET<UUID>,
    prefill_phone TEXT
)
"""

# All CQL statements
REGISTRATION_LINKS_TABLES_CQL = [
    REGISTRATION_LINKS_TABLE_CQL,
    REGISTRATION_LINKS_SHORTCODE_INDEX_CQL,
    REGISTRATION_LINKS_STATUS_INDEX_CQL,
    REGISTRATION_LINKS_BY_SHORTCODE_TABLE_CQL,
]


def get_registration_links_tables_cql(keyspace: str) -> list[str]:
    """Get all CQL statements for registration links tables."""
    return [cql.format(keyspace=keyspace) for cql in REGISTRATION_LINKS_TABLES_CQL]


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
class RegistrationLink:
    """Represents a registration link for automated signup."""

    shortcode: str
    token_hash: str
    course_ids: set[UUID]
    id: UUID = field(default_factory=uuid4)
    status: LinkStatus = LinkStatus.PENDING
    expires_at: datetime | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    created_by: UUID | None = None
    source: LinkSource = LinkSource.API
    notes: str | None = None
    prefill_phone: str | None = None
    # After use
    user_id: UUID | None = None
    used_at: datetime | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    @classmethod
    def from_row(cls, row: "Row") -> "RegistrationLink":
        """Create instance from Cassandra row."""
        return cls(
            id=row.id,
            shortcode=row.shortcode,
            token_hash=row.token_hash,
            status=LinkStatus(row.status),
            expires_at=ensure_utc_aware(row.expires_at),
            created_at=ensure_utc_aware(row.created_at) or datetime.now(UTC),
            created_by=row.created_by,
            source=LinkSource(row.source) if row.source else LinkSource.API,
            notes=row.notes,
            prefill_phone=getattr(row, "prefill_phone", None),
            course_ids=set(row.course_ids) if row.course_ids else set(),
            user_id=row.user_id,
            used_at=ensure_utc_aware(row.used_at),
            ip_address=row.ip_address,
            user_agent=row.user_agent,
        )

    @classmethod
    def from_lookup_row(cls, row: "Row") -> "RegistrationLink":
        """Create partial instance from lookup table row."""
        return cls(
            id=row.link_id,
            shortcode=row.shortcode,
            token_hash=row.token_hash,
            status=LinkStatus(row.status),
            expires_at=ensure_utc_aware(row.expires_at),
            course_ids=set(row.course_ids) if row.course_ids else set(),
            prefill_phone=getattr(row, "prefill_phone", None),
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "shortcode": self.shortcode,
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat(),
            "created_by": self.created_by,
            "source": self.source.value,
            "notes": self.notes,
            "prefill_phone": self.prefill_phone,
            "course_ids": list(self.course_ids),
            "user_id": self.user_id,
            "used_at": self.used_at.isoformat() if self.used_at else None,
        }

    def is_valid(self) -> bool:
        """Check if link is valid (pending and not expired)."""
        if self.status != LinkStatus.PENDING:
            return False
        return not (self.expires_at and datetime.now(UTC) > self.expires_at)

    def is_expired(self) -> bool:
        """Check if link has expired."""
        if self.expires_at is None:
            return False
        return datetime.now(UTC) > self.expires_at
