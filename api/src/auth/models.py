"""Database models for authentication.

Cassandra table definitions for:
- Users: Main user table with indexed lookups
- RefreshTokens: Token storage for revocation tracking
- RefreshTokensByUser: Lookup table for logout-all functionality

Note: Uses cassandra-driver directly (not ORM) for flexibility.
Tables are created via CQL statements in the database module.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from src.auth.permissions import UserRole


# CQL statements for table creation
USER_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.users (
    id UUID PRIMARY KEY,
    email TEXT,
    cpf TEXT,
    rg TEXT,
    phone TEXT,
    name TEXT,
    password_hash TEXT,
    role TEXT,
    is_active BOOLEAN,
    avatar_url TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip_code TEXT,
    max_concurrent_sessions INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

USER_EMAIL_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS users_email_idx ON {keyspace}.users (email)
"""

USER_CPF_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS users_cpf_idx ON {keyspace}.users (cpf)
"""

USER_NAME_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS users_name_idx ON {keyspace}.users (name)
"""

REFRESH_TOKEN_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.refresh_tokens (
    jti UUID PRIMARY KEY,
    user_id UUID,
    expires_at TIMESTAMP,
    revoked BOOLEAN,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP,
    user_agent TEXT,
    ip_address TEXT
)
"""

REFRESH_TOKEN_USER_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
ON {keyspace}.refresh_tokens (user_id)
"""

REFRESH_TOKEN_BY_USER_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.refresh_tokens_by_user (
    user_id UUID,
    jti UUID,
    expires_at TIMESTAMP,
    revoked BOOLEAN,
    created_at TIMESTAMP,
    PRIMARY KEY (user_id, jti)
) WITH CLUSTERING ORDER BY (jti ASC)
"""

# All CQL statements for table setup
AUTH_TABLES_CQL = [
    USER_TABLE_CQL,
    USER_EMAIL_INDEX_CQL,
    USER_CPF_INDEX_CQL,
    USER_NAME_INDEX_CQL,
    REFRESH_TOKEN_TABLE_CQL,
    REFRESH_TOKEN_USER_INDEX_CQL,
    REFRESH_TOKEN_BY_USER_TABLE_CQL,
]


def ensure_utc_aware(dt: datetime | None) -> datetime | None:
    """Ensure datetime is UTC-aware (Cassandra returns naive datetimes)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


class User:
    """User entity for authentication and authorization.

    Attributes:
        id: Unique identifier (UUID)
        email: Unique email address
        cpf: Brazilian CPF (optional, for nationals)
        rg: Brazilian RG identity document (optional)
        phone: Phone number
        name: Full name
        password_hash: Argon2id hashed password
        role: User role (user, student, teacher, admin)
        is_active: Account status
        avatar_url: Profile picture URL
        address_*: Address fields (street, number, complement, etc.)
        max_concurrent_sessions: Max allowed concurrent sessions (None = use default)
        created_at: Account creation timestamp
        updated_at: Last update timestamp
    """

    def __init__(
        self,
        id: UUID | None = None,
        email: str = "",
        cpf: str | None = None,
        rg: str | None = None,
        phone: str = "",
        name: str = "",
        password_hash: str = "",
        role: str = UserRole.USER.value,
        is_active: bool = True,
        avatar_url: str | None = None,
        address_street: str | None = None,
        address_number: str | None = None,
        address_complement: str | None = None,
        address_neighborhood: str | None = None,
        address_city: str | None = None,
        address_state: str | None = None,
        address_zip_code: str | None = None,
        max_concurrent_sessions: int | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ):
        self.id = id or uuid4()
        self.email = email.lower().strip()
        self.cpf = cpf
        self.rg = rg
        self.phone = phone
        self.name = name
        self.password_hash = password_hash
        self.role = role
        self.is_active = is_active
        self.avatar_url = avatar_url
        self.address_street = address_street
        self.address_number = address_number
        self.address_complement = address_complement
        self.address_neighborhood = address_neighborhood
        self.address_city = address_city
        self.address_state = address_state
        self.address_zip_code = address_zip_code
        self.max_concurrent_sessions = max_concurrent_sessions
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.updated_at = ensure_utc_aware(updated_at)

    @classmethod
    def from_row(cls, row: Any) -> "User":
        """Create User instance from Cassandra row."""
        return cls(
            id=row.id,
            email=row.email,
            cpf=row.cpf,
            rg=getattr(row, "rg", None),
            phone=row.phone,
            name=row.name,
            password_hash=row.password_hash,
            role=row.role,
            is_active=row.is_active,
            avatar_url=row.avatar_url,
            address_street=getattr(row, "address_street", None),
            address_number=getattr(row, "address_number", None),
            address_complement=getattr(row, "address_complement", None),
            address_neighborhood=getattr(row, "address_neighborhood", None),
            address_city=getattr(row, "address_city", None),
            address_state=getattr(row, "address_state", None),
            address_zip_code=getattr(row, "address_zip_code", None),
            max_concurrent_sessions=getattr(row, "max_concurrent_sessions", None),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_dict(self, include_password: bool = False) -> dict[str, Any]:
        """Convert to dictionary (excludes password_hash by default)."""
        data = {
            "id": self.id,
            "email": self.email,
            "cpf": self.cpf,
            "rg": self.rg,
            "phone": self.phone,
            "name": self.name,
            "role": self.role,
            "is_active": self.is_active,
            "avatar_url": self.avatar_url,
            "address_street": self.address_street,
            "address_number": self.address_number,
            "address_complement": self.address_complement,
            "address_neighborhood": self.address_neighborhood,
            "address_city": self.address_city,
            "address_state": self.address_state,
            "address_zip_code": self.address_zip_code,
            "max_concurrent_sessions": self.max_concurrent_sessions,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if include_password:
            data["password_hash"] = self.password_hash
        return data

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


class RefreshToken:
    """Refresh token entity for JWT revocation tracking.

    Attributes:
        jti: Unique token identifier (JWT ID)
        user_id: Owner user ID
        expires_at: Token expiration timestamp
        revoked: Whether token has been revoked
        revoked_at: Revocation timestamp
        created_at: Token creation timestamp
        user_agent: Client user agent (audit trail)
        ip_address: Client IP address (audit trail)
    """

    def __init__(
        self,
        jti: UUID,
        user_id: UUID,
        expires_at: datetime,
        revoked: bool = False,
        revoked_at: datetime | None = None,
        created_at: datetime | None = None,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ):
        self.jti = jti
        self.user_id = user_id
        self.expires_at = ensure_utc_aware(expires_at)
        self.revoked = revoked
        self.revoked_at = ensure_utc_aware(revoked_at)
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)
        self.user_agent = user_agent
        self.ip_address = ip_address

    @classmethod
    def from_row(cls, row: Any) -> "RefreshToken":
        """Create RefreshToken instance from Cassandra row."""
        return cls(
            jti=row.jti,
            user_id=row.user_id,
            expires_at=row.expires_at,
            revoked=row.revoked,
            revoked_at=row.revoked_at,
            created_at=row.created_at,
            user_agent=row.user_agent,
            ip_address=row.ip_address,
        )

    def is_valid(self) -> bool:
        """Check if token is valid (not revoked and not expired)."""
        if self.revoked:
            return False
        expires_at = ensure_utc_aware(self.expires_at)
        if expires_at is None:
            return False
        return expires_at >= datetime.now(UTC)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "jti": self.jti,
            "user_id": self.user_id,
            "expires_at": self.expires_at,
            "revoked": self.revoked,
            "revoked_at": self.revoked_at,
            "created_at": self.created_at,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
        }

    def __repr__(self) -> str:
        status = "revoked" if self.revoked else "active"
        return f"<RefreshToken {self.jti} ({status})>"


class RefreshTokenByUser:
    """Lookup table for refresh tokens by user.

    Enables efficient queries for:
    - List all tokens for a user
    - Logout from all devices (revoke all user tokens)

    Primary key: (user_id, jti) - user_id is partition key
    """

    def __init__(
        self,
        user_id: UUID,
        jti: UUID,
        expires_at: datetime,
        revoked: bool = False,
        created_at: datetime | None = None,
    ):
        self.user_id = user_id
        self.jti = jti
        self.expires_at = ensure_utc_aware(expires_at)
        self.revoked = revoked
        self.created_at = ensure_utc_aware(created_at) or datetime.now(UTC)

    @classmethod
    def from_row(cls, row: Any) -> "RefreshTokenByUser":
        """Create RefreshTokenByUser instance from Cassandra row."""
        return cls(
            user_id=row.user_id,
            jti=row.jti,
            expires_at=row.expires_at,
            revoked=row.revoked,
            created_at=row.created_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "user_id": self.user_id,
            "jti": self.jti,
            "expires_at": self.expires_at,
            "revoked": self.revoked,
            "created_at": self.created_at,
        }

    def __repr__(self) -> str:
        return f"<RefreshTokenByUser user={self.user_id} jti={self.jti}>"
