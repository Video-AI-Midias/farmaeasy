"""Verification service for password reset and email change.

Provides secure verification code management with:
- Rate limiting per email and IP
- Code hashing (SHA-256)
- Automatic expiration (15 minutes)
- Attempt tracking and blocking
- Audit logging
"""

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from src.auth.security import hash_password, verify_password
from src.core.logging import get_logger

if TYPE_CHECKING:
    from cassandra.cluster import Session

    from src.email.service import EmailService


logger = get_logger(__name__)


# ==============================================================================
# Constants
# ==============================================================================

VERIFICATION_CODE_LENGTH = 6
VERIFICATION_CODE_EXPIRE_MINUTES = 15
VERIFICATION_MAX_ATTEMPTS = 3
VERIFICATION_REQUESTS_PER_HOUR = 5
VERIFICATION_BLOCK_DURATION_MINUTES = 15


# ==============================================================================
# Data Models
# ==============================================================================


@dataclass
class VerificationCode:
    """Verification code model."""

    id: UUID
    user_id: UUID | None
    email: str
    code_hash: str
    code_type: str  # 'password_reset' | 'email_change'
    new_email: str | None
    attempts: int
    is_used: bool
    expires_at: datetime
    created_at: datetime
    ip_address: str | None
    user_agent: str | None

    @classmethod
    def from_row(cls, row: tuple) -> "VerificationCode":
        """Create from Cassandra row."""
        return cls(
            id=row.id,
            user_id=row.user_id,
            email=row.email,
            code_hash=row.code_hash,
            code_type=row.code_type,
            new_email=row.new_email,
            attempts=row.attempts or 0,
            is_used=row.is_used or False,
            expires_at=row.expires_at,
            created_at=row.created_at,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
        )

    def is_expired(self) -> bool:
        """Check if code is expired."""
        now = datetime.now(UTC)
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        return now > expires_at

    def is_valid(self) -> bool:
        """Check if code can still be used."""
        return (
            not self.is_used
            and not self.is_expired()
            and self.attempts < VERIFICATION_MAX_ATTEMPTS
        )


@dataclass
class RateLimit:
    """Rate limit tracking model."""

    key: str
    request_count: int = 0
    failed_attempts: int = 0
    blocked_until: datetime | None = None
    last_request_at: datetime | None = None

    @classmethod
    def from_row(cls, row: tuple) -> "RateLimit":
        """Create from Cassandra row."""
        return cls(
            key=row.key,
            request_count=row.request_count or 0,
            failed_attempts=row.failed_attempts or 0,
            blocked_until=row.blocked_until,
            last_request_at=row.last_request_at,
        )

    def is_blocked(self) -> bool:
        """Check if currently blocked."""
        if not self.blocked_until:
            return False
        now = datetime.now(UTC)
        blocked_until = self.blocked_until
        if blocked_until.tzinfo is None:
            blocked_until = blocked_until.replace(tzinfo=UTC)
        return now < blocked_until

    def get_remaining_block_minutes(self) -> int:
        """Get remaining block time in minutes."""
        if not self.blocked_until:
            return 0
        now = datetime.now(UTC)
        blocked_until = self.blocked_until
        if blocked_until.tzinfo is None:
            blocked_until = blocked_until.replace(tzinfo=UTC)
        if now >= blocked_until:
            return 0
        return int((blocked_until - now).total_seconds() / 60) + 1


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class VerificationError(Exception):
    """Base verification error."""

    def __init__(self, message: str, code: str = "verification_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class RateLimitExceededError(VerificationError):
    """Rate limit exceeded."""

    def __init__(
        self,
        message: str = "Muitas tentativas. Tente novamente mais tarde.",
        retry_after_minutes: int = 15,
    ):
        super().__init__(message, "rate_limit_exceeded")
        self.retry_after_minutes = retry_after_minutes


class InvalidCodeError(VerificationError):
    """Invalid or expired verification code."""

    def __init__(self, message: str = "Código inválido ou expirado"):
        super().__init__(message, "invalid_code")


class CodeExpiredError(VerificationError):
    """Verification code has expired."""

    def __init__(self, message: str = "Código expirado. Solicite um novo."):
        super().__init__(message, "code_expired")


class MaxAttemptsExceededError(VerificationError):
    """Maximum verification attempts exceeded."""

    def __init__(
        self,
        message: str = "Número máximo de tentativas excedido. Solicite um novo código.",
    ):
        super().__init__(message, "max_attempts_exceeded")


# ==============================================================================
# CQL Table Definitions (for schema creation)
# ==============================================================================

CQL_CREATE_VERIFICATION_CODES = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_codes (
    id UUID PRIMARY KEY,
    user_id UUID,
    email TEXT,
    code_hash TEXT,
    code_type TEXT,
    new_email TEXT,
    attempts INT,
    is_used BOOLEAN,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
)
"""

CQL_CREATE_VERIFICATION_CODES_BY_EMAIL = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_codes_by_email (
    email TEXT,
    code_type TEXT,
    id UUID,
    expires_at TIMESTAMP,
    is_used BOOLEAN,
    PRIMARY KEY ((email, code_type), id)
) WITH CLUSTERING ORDER BY (id DESC)
"""

CQL_CREATE_RATE_LIMITS = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_rate_limits (
    key TEXT PRIMARY KEY,
    request_count INT,
    failed_attempts INT,
    blocked_until TIMESTAMP,
    last_request_at TIMESTAMP
) WITH default_time_to_live = 3600
"""


# ==============================================================================
# Verification Service
# ==============================================================================


@dataclass
class VerificationService:
    """Service for verification code management.

    Handles password reset and email change verification flows
    with security measures including rate limiting, code hashing,
    and audit logging.
    """

    session: "Session"
    keyspace: str
    email_service: "EmailService | None" = None

    # Prepared statements (initialized in __post_init__)
    _insert_code: object = field(default=None, init=False, repr=False)
    _insert_code_by_email: object = field(default=None, init=False, repr=False)
    _get_code_by_id: object = field(default=None, init=False, repr=False)
    _get_codes_by_email: object = field(default=None, init=False, repr=False)
    _update_code_attempts: object = field(default=None, init=False, repr=False)
    _mark_code_used: object = field(default=None, init=False, repr=False)
    _get_rate_limit: object = field(default=None, init=False, repr=False)
    _upsert_rate_limit: object = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        """Prepare CQL statements after initialization."""
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for better performance."""
        # Verification codes
        self._insert_code = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.verification_codes
            (id, user_id, email, code_hash, code_type, new_email, attempts,
             is_used, expires_at, created_at, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        self._insert_code_by_email = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.verification_codes_by_email
            (email, code_type, id, expires_at, is_used)
            VALUES (?, ?, ?, ?, ?)
        """)

        self._get_code_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.verification_codes WHERE id = ?"
        )

        self._get_codes_by_email = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.verification_codes_by_email
            WHERE email = ? AND code_type = ?
        """)

        self._update_code_attempts = self.session.prepare(f"""
            UPDATE {self.keyspace}.verification_codes
            SET attempts = ?
            WHERE id = ?
        """)

        self._mark_code_used = self.session.prepare(f"""
            UPDATE {self.keyspace}.verification_codes
            SET is_used = true
            WHERE id = ?
        """)

        self._mark_code_used_by_email = self.session.prepare(f"""
            UPDATE {self.keyspace}.verification_codes_by_email
            SET is_used = true
            WHERE email = ? AND code_type = ? AND id = ?
        """)

        # Rate limits
        self._get_rate_limit = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.verification_rate_limits WHERE key = ?"
        )

        self._upsert_rate_limit = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.verification_rate_limits
            (key, request_count, failed_attempts, blocked_until, last_request_at)
            VALUES (?, ?, ?, ?, ?)
        """)

    # ==========================================================================
    # Code Generation & Verification
    # ==========================================================================

    def _generate_code(self) -> tuple[str, str]:
        """Generate a random 6-digit code and its hash.

        Returns:
            Tuple of (plain_code, hashed_code)
        """
        code = "".join(secrets.choice("0123456789") for _ in range(VERIFICATION_CODE_LENGTH))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        return code, code_hash

    def _verify_code_hash(self, plain_code: str, code_hash: str) -> bool:
        """Verify a code against its hash.

        Args:
            plain_code: The plain text code
            code_hash: The stored SHA-256 hash

        Returns:
            True if code matches hash
        """
        return hashlib.sha256(plain_code.encode()).hexdigest() == code_hash

    def _mask_email(self, email: str) -> str:
        """Mask email for display (e.g., s***@email.com).

        Args:
            email: Full email address

        Returns:
            Masked email string
        """
        parts = email.split("@")
        if len(parts) != 2:
            return "***@***.***"
        local, domain = parts
        if len(local) <= 1:
            return f"*@{domain}"
        return f"{local[0]}{'*' * (len(local) - 1)}@{domain}"

    # ==========================================================================
    # Rate Limiting
    # ==========================================================================

    def _get_rate_limit_record(self, key: str) -> RateLimit | None:
        """Get rate limit record for a key."""
        rows = self.session.execute(self._get_rate_limit, [key])
        row = rows.one()
        return RateLimit.from_row(row) if row else None

    def _check_rate_limit(self, email: str, ip_address: str | None) -> None:
        """Check rate limits for email and IP.

        Args:
            email: User email
            ip_address: Client IP address

        Raises:
            RateLimitExceededError: If rate limit is exceeded
        """
        keys_to_check = [f"email:{email.lower()}"]
        if ip_address:
            keys_to_check.append(f"ip:{ip_address}")

        for key in keys_to_check:
            limit = self._get_rate_limit_record(key)
            if limit:
                if limit.is_blocked():
                    remaining = limit.get_remaining_block_minutes()
                    raise RateLimitExceededError(
                        f"Muitas tentativas. Tente novamente em {remaining} minutos.",
                        retry_after_minutes=remaining,
                    )
                if limit.request_count >= VERIFICATION_REQUESTS_PER_HOUR:
                    # Block for configured duration
                    self._block_key(key)
                    raise RateLimitExceededError(
                        "Limite de solicitações excedido. Tente novamente mais tarde.",
                        retry_after_minutes=VERIFICATION_BLOCK_DURATION_MINUTES,
                    )

    def _increment_rate_limit(self, email: str, ip_address: str | None) -> None:
        """Increment rate limit counters.

        Args:
            email: User email
            ip_address: Client IP address
        """
        now = datetime.now(UTC)
        keys = [f"email:{email.lower()}"]
        if ip_address:
            keys.append(f"ip:{ip_address}")

        for key in keys:
            limit = self._get_rate_limit_record(key)
            new_count = (limit.request_count + 1) if limit else 1
            self.session.execute(
                self._upsert_rate_limit,
                [key, new_count, limit.failed_attempts if limit else 0, None, now],
            )

    def _block_key(self, key: str) -> None:
        """Block a rate limit key for the configured duration.

        Args:
            key: Rate limit key to block
        """
        now = datetime.now(UTC)
        blocked_until = now + timedelta(minutes=VERIFICATION_BLOCK_DURATION_MINUTES)
        limit = self._get_rate_limit_record(key)
        self.session.execute(
            self._upsert_rate_limit,
            [
                key,
                limit.request_count if limit else 0,
                limit.failed_attempts if limit else 0,
                blocked_until,
                now,
            ],
        )

    def _record_failed_attempt(self, code_id: UUID, email: str, ip: str | None) -> int:
        """Record a failed verification attempt.

        Args:
            code_id: Verification code ID
            email: User email
            ip: Client IP address

        Returns:
            New attempt count
        """
        # Get current code
        rows = self.session.execute(self._get_code_by_id, [code_id])
        row = rows.one()
        if not row:
            return 0

        code = VerificationCode.from_row(row)
        new_attempts = code.attempts + 1

        # Update attempt count
        self.session.execute(self._update_code_attempts, [new_attempts, code_id])

        # Track in rate limits
        now = datetime.now(UTC)
        for key in [f"email:{email.lower()}", f"ip:{ip}"]:
            if key.endswith(":None"):
                continue
            limit = self._get_rate_limit_record(key)
            new_failed = (limit.failed_attempts + 1) if limit else 1
            # Block after too many failed attempts
            blocked_until = None
            if new_failed >= 5:
                blocked_until = now + timedelta(minutes=VERIFICATION_BLOCK_DURATION_MINUTES)
            self.session.execute(
                self._upsert_rate_limit,
                [key, limit.request_count if limit else 0, new_failed, blocked_until, now],
            )

        logger.warning(
            "verification_failed_attempt",
            code_id=str(code_id),
            email=self._mask_email(email),
            attempt=new_attempts,
            ip=ip,
        )

        return new_attempts

    # ==========================================================================
    # Code Management
    # ==========================================================================

    def _invalidate_existing_codes(self, email: str, code_type: str) -> None:
        """Invalidate all existing codes for email and type.

        Args:
            email: User email
            code_type: Type of verification ('password_reset' or 'email_change')
        """
        rows = self.session.execute(self._get_codes_by_email, [email.lower(), code_type])
        for row in rows:
            self.session.execute(self._mark_code_used, [row.id])
            self.session.execute(
                self._mark_code_used_by_email,
                [email.lower(), code_type, row.id],
            )

    def _create_verification_code(
        self,
        email: str,
        code_type: str,
        user_id: UUID | None = None,
        new_email: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[UUID, str]:
        """Create a new verification code.

        Args:
            email: Target email address
            code_type: 'password_reset' or 'email_change'
            user_id: User ID (if known)
            new_email: New email (for email_change)
            ip_address: Client IP
            user_agent: Client user agent

        Returns:
            Tuple of (code_id, plain_code)
        """
        # Generate code
        plain_code, code_hash = self._generate_code()
        code_id = uuid4()
        now = datetime.now(UTC)
        expires_at = now + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)

        # Invalidate any existing codes
        self._invalidate_existing_codes(email, code_type)

        # Insert new code
        self.session.execute(
            self._insert_code,
            [
                code_id,
                user_id,
                email.lower(),
                code_hash,
                code_type,
                new_email,
                0,  # attempts
                False,  # is_used
                expires_at,
                now,
                ip_address,
                user_agent,
            ],
        )

        # Insert into lookup table
        self.session.execute(
            self._insert_code_by_email,
            [email.lower(), code_type, code_id, expires_at, False],
        )

        logger.info(
            "verification_code_created",
            code_id=str(code_id),
            email=self._mask_email(email),
            code_type=code_type,
            expires_at=expires_at.isoformat(),
        )

        return code_id, plain_code

    def _get_valid_code(
        self,
        email: str,
        code_type: str,
        plain_code: str,
    ) -> VerificationCode | None:
        """Get and validate a verification code.

        Args:
            email: User email
            code_type: Type of verification
            plain_code: Plain text code to verify

        Returns:
            VerificationCode if valid, None otherwise
        """
        # Get latest codes for this email/type
        rows = self.session.execute(self._get_codes_by_email, [email.lower(), code_type])

        for row in rows:
            # Get full code details
            code_rows = self.session.execute(self._get_code_by_id, [row.id])
            code_row = code_rows.one()
            if not code_row:
                continue

            code = VerificationCode.from_row(code_row)

            # Check if valid and code matches
            if code.is_valid() and self._verify_code_hash(plain_code, code.code_hash):
                return code

        return None

    def _mark_code_as_used(self, code: VerificationCode) -> None:
        """Mark a verification code as used.

        Args:
            code: The code to mark as used
        """
        self.session.execute(self._mark_code_used, [code.id])
        self.session.execute(
            self._mark_code_used_by_email,
            [code.email, code.code_type, code.id],
        )

        logger.info(
            "verification_code_used",
            code_id=str(code.id),
            email=self._mask_email(code.email),
            code_type=code.code_type,
        )

    # ==========================================================================
    # Password Reset Flow
    # ==========================================================================

    async def request_password_reset(
        self,
        email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        auth_service: "object | None" = None,
    ) -> bool:
        """Request a password reset code.

        Always returns True to avoid revealing if email exists.

        Args:
            email: User email address
            ip_address: Client IP for rate limiting
            user_agent: Client user agent
            auth_service: AuthService for user lookup

        Returns:
            True (always, for security)
        """
        # Check rate limits
        try:
            self._check_rate_limit(email, ip_address)
        except RateLimitExceededError:
            # Log but don't reveal to user
            logger.warning(
                "password_reset_rate_limited",
                email=self._mask_email(email),
                ip=ip_address,
            )
            return True  # Still return True to not reveal rate limiting

        # Increment rate limit
        self._increment_rate_limit(email, ip_address)

        # Check if user exists (silently)
        user = None
        if auth_service and hasattr(auth_service, "get_user_by_email"):
            user = auth_service.get_user_by_email(email)

        if not user:
            logger.info(
                "password_reset_unknown_email",
                email=self._mask_email(email),
            )
            return True  # Don't reveal email doesn't exist

        # Create verification code
        code_id, plain_code = self._create_verification_code(
            email=email,
            code_type="password_reset",
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Send email
        if self.email_service:
            try:
                await self.email_service.send_password_reset_code(
                    to=email,
                    user_name=user.name or "Usuário",
                    code=plain_code,
                )
                logger.info(
                    "password_reset_email_sent",
                    email=self._mask_email(email),
                    code_id=str(code_id),
                )
            except Exception as e:
                logger.exception(
                    "password_reset_email_failed",
                    email=self._mask_email(email),
                    error=str(e),
                )

        return True

    async def verify_reset_code(
        self,
        email: str,
        code: str,
        ip_address: str | None = None,
    ) -> bool:
        """Verify a password reset code without using it.

        Args:
            email: User email
            code: 6-digit code
            ip_address: Client IP

        Returns:
            True if code is valid

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        verification = self._get_valid_code(email, "password_reset", code)

        if not verification:
            # Try to find any code to record failed attempt
            rows = self.session.execute(
                self._get_codes_by_email, [email.lower(), "password_reset"]
            )
            for row in rows:
                code_rows = self.session.execute(self._get_code_by_id, [row.id])
                code_row = code_rows.one()
                if code_row:
                    code_obj = VerificationCode.from_row(code_row)
                    if not code_obj.is_used and not code_obj.is_expired():
                        attempts = self._record_failed_attempt(row.id, email, ip_address)
                        if attempts >= VERIFICATION_MAX_ATTEMPTS:
                            raise MaxAttemptsExceededError
                        break

            raise InvalidCodeError

        return True

    async def reset_password(
        self,
        email: str,
        code: str,
        new_password: str,
        ip_address: str | None = None,
        auth_service: "object | None" = None,
    ) -> bool:
        """Reset password using verification code.

        Args:
            email: User email
            code: 6-digit code
            new_password: New password (already validated)
            ip_address: Client IP
            auth_service: AuthService for password update

        Returns:
            True if password was reset

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        # Verify code first
        verification = self._get_valid_code(email, "password_reset", code)

        if not verification:
            # Record failed attempt
            rows = self.session.execute(
                self._get_codes_by_email, [email.lower(), "password_reset"]
            )
            for row in rows:
                code_rows = self.session.execute(self._get_code_by_id, [row.id])
                code_row = code_rows.one()
                if code_row:
                    code_obj = VerificationCode.from_row(code_row)
                    if not code_obj.is_used and not code_obj.is_expired():
                        attempts = self._record_failed_attempt(row.id, email, ip_address)
                        if attempts >= VERIFICATION_MAX_ATTEMPTS:
                            raise MaxAttemptsExceededError
                        break

            raise InvalidCodeError

        # Get user
        if not auth_service or not hasattr(auth_service, "get_user_by_email"):
            raise InvalidCodeError("Serviço de autenticação não disponível")

        user = auth_service.get_user_by_email(email)
        if not user:
            raise InvalidCodeError

        # Update password
        new_hash = hash_password(new_password)
        if hasattr(auth_service, "_update_user_password"):
            auth_service.session.execute(
                auth_service._update_user_password,
                [new_hash, datetime.now(UTC), user.id],
            )

        # Mark code as used
        self._mark_code_as_used(verification)

        # Send notification email
        if self.email_service:
            try:
                await self.email_service.send_password_changed_notification(
                    to=email,
                    user_name=user.name or "Usuário",
                )
            except Exception as e:
                logger.warning(
                    "password_changed_notification_failed",
                    email=self._mask_email(email),
                    error=str(e),
                )

        logger.info(
            "password_reset_completed",
            email=self._mask_email(email),
            user_id=str(user.id),
        )

        return True

    # ==========================================================================
    # Email Change Flow
    # ==========================================================================

    async def request_email_change(
        self,
        user_id: UUID,
        current_email: str,
        new_email: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        auth_service: "object | None" = None,
    ) -> str:
        """Request an email change.

        Args:
            user_id: Current user ID
            current_email: Current email
            new_email: Desired new email
            password: Current password for verification
            ip_address: Client IP
            user_agent: Client user agent
            auth_service: AuthService for validation

        Returns:
            Masked new email for display

        Raises:
            VerificationError: If password is wrong or email unavailable
            RateLimitExceededError: If rate limited
        """
        # Check rate limits
        self._check_rate_limit(new_email, ip_address)
        self._increment_rate_limit(new_email, ip_address)

        # Verify password
        if not auth_service or not hasattr(auth_service, "get_user_by_id"):
            raise VerificationError("Serviço de autenticação não disponível")

        user = auth_service.get_user_by_id(user_id)
        if not user:
            raise VerificationError("Usuário não encontrado")

        is_valid, _ = verify_password(password, user.password_hash)
        if not is_valid:
            raise VerificationError("Senha incorreta", code="invalid_password")

        # Check if new email is available
        existing = auth_service.get_user_by_email(new_email)
        if existing:
            raise VerificationError("Este email já está em uso", code="email_taken")

        # Create verification code
        code_id, plain_code = self._create_verification_code(
            email=new_email,  # Code is sent to NEW email
            code_type="email_change",
            user_id=user_id,
            new_email=new_email,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Send email to new address
        if self.email_service:
            try:
                await self.email_service.send_email_change_code(
                    to=new_email,
                    user_name=user.name or "Usuário",
                    code=plain_code,
                )
                logger.info(
                    "email_change_code_sent",
                    user_id=str(user_id),
                    new_email=self._mask_email(new_email),
                    code_id=str(code_id),
                )
            except Exception as e:
                logger.exception(
                    "email_change_code_send_failed",
                    user_id=str(user_id),
                    new_email=self._mask_email(new_email),
                    error=str(e),
                )
                raise VerificationError("Falha ao enviar email de verificação") from e

        return self._mask_email(new_email)

    async def confirm_email_change(
        self,
        user_id: UUID,
        code: str,
        ip_address: str | None = None,
        auth_service: "object | None" = None,
    ) -> str:
        """Confirm email change with verification code.

        Args:
            user_id: User ID
            code: 6-digit verification code
            ip_address: Client IP
            auth_service: AuthService for email update

        Returns:
            New email address

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        if not auth_service or not hasattr(auth_service, "get_user_by_id"):
            raise VerificationError("Serviço de autenticação não disponível")

        user = auth_service.get_user_by_id(user_id)
        if not user:
            raise InvalidCodeError("Usuário não encontrado")

        # Find valid email change code for this user
        # Need to search all codes for this user
        verification = None
        rows = self.session.execute(f"""
            SELECT * FROM {self.keyspace}.verification_codes
            WHERE user_id = ? AND code_type = 'email_change'
            ALLOW FILTERING
        """, [user_id])

        for row in rows:
            code_obj = VerificationCode.from_row(row)
            if code_obj.is_valid() and self._verify_code_hash(code, code_obj.code_hash):
                verification = code_obj
                break

        if not verification:
            # Record failed attempt for the user's pending email change
            pending_rows = self.session.execute(f"""
                SELECT * FROM {self.keyspace}.verification_codes
                WHERE user_id = ? AND code_type = 'email_change' AND is_used = false
                ALLOW FILTERING
            """, [user_id])

            for row in pending_rows:
                code_obj = VerificationCode.from_row(row)
                if not code_obj.is_expired():
                    attempts = self._record_failed_attempt(
                        row.id, code_obj.email, ip_address
                    )
                    if attempts >= VERIFICATION_MAX_ATTEMPTS:
                        raise MaxAttemptsExceededError
                    break

            raise InvalidCodeError

        new_email = verification.new_email
        if not new_email:
            raise InvalidCodeError("Novo email não encontrado")

        # Update user email in database
        old_email = user.email
        now = datetime.now(UTC)

        # Update user email (direct CQL since AuthService may not have this method)
        self.session.execute(f"""
            UPDATE {self.keyspace}.users
            SET email = ?, updated_at = ?
            WHERE id = ?
        """, [new_email, now, user_id])

        # Mark code as used
        self._mark_code_as_used(verification)

        # Send notifications
        if self.email_service:
            try:
                # Notify old email
                await self.email_service.send_email_changed_notification(
                    to=old_email,
                    user_name=user.name or "Usuário",
                    new_email=new_email,
                )
                # Notify new email
                await self.email_service.send_email_changed_notification(
                    to=new_email,
                    user_name=user.name or "Usuário",
                    new_email=new_email,
                    is_new_email=True,
                )
            except Exception as e:
                logger.warning(
                    "email_change_notification_failed",
                    user_id=str(user_id),
                    error=str(e),
                )

        logger.info(
            "email_change_completed",
            user_id=str(user_id),
            old_email=self._mask_email(old_email),
            new_email=self._mask_email(new_email),
        )

        return new_email


# ==============================================================================
# Schema Management
# ==============================================================================


def create_verification_tables(session: "Session", keyspace: str) -> None:
    """Create verification tables in Cassandra.

    Args:
        session: Cassandra session
        keyspace: Keyspace name
    """
    tables = [
        CQL_CREATE_VERIFICATION_CODES,
        CQL_CREATE_VERIFICATION_CODES_BY_EMAIL,
        CQL_CREATE_RATE_LIMITS,
    ]

    for cql in tables:
        session.execute(cql.format(keyspace=keyspace))

    logger.info("verification_tables_created", keyspace=keyspace)
