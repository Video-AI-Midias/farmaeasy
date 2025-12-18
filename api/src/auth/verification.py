"""Verification service for password reset and email change.

Implements secure verification code flow with:
- 6-digit codes with SHA-256 hashing
- Rate limiting per email and IP
- Expiration (15 minutes default)
- Maximum attempts (3 per code)
- Audit logging
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from cassandra.query import SimpleStatement

from src.core.logging import get_logger


if TYPE_CHECKING:
    from cassandra.cluster import Session

    from src.auth.service import AuthService
    from src.email.service import EmailService


logger = get_logger(__name__)


# ==============================================================================
# Exceptions
# ==============================================================================


class VerificationError(Exception):
    """Base verification error."""

    def __init__(self, message: str, code: str = "verification_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class RateLimitExceededError(VerificationError):
    """Rate limit exceeded."""

    def __init__(self, message: str, retry_after_seconds: int = 900):
        super().__init__(message, "rate_limit_exceeded")
        self.retry_after_seconds = retry_after_seconds


class InvalidCodeError(VerificationError):
    """Invalid or expired verification code."""

    def __init__(self, message: str = "Codigo invalido ou expirado"):
        super().__init__(message, "invalid_code")


class MaxAttemptsExceededError(VerificationError):
    """Maximum verification attempts exceeded."""

    def __init__(self, message: str = "Numero maximo de tentativas excedido"):
        super().__init__(message, "max_attempts_exceeded")


class EmailNotAvailableError(VerificationError):
    """Email already in use."""

    def __init__(self, message: str = "Este email ja esta em uso"):
        super().__init__(message, "email_not_available")


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class VerificationCode:
    """Verification code entity."""

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


@dataclass
class RateLimit:
    """Rate limit tracking."""

    key: str
    request_count: int
    failed_attempts: int
    blocked_until: datetime | None
    last_request_at: datetime


# ==============================================================================
# CQL Statements
# ==============================================================================

CQL_CREATE_VERIFICATION_CODES = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_codes (
    id UUID,
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
    user_agent TEXT,
    PRIMARY KEY (id)
) WITH default_time_to_live = 3600
"""

CQL_CREATE_VERIFICATION_CODES_BY_EMAIL = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_codes_by_email (
    email TEXT,
    code_type TEXT,
    id UUID,
    expires_at TIMESTAMP,
    PRIMARY KEY ((email, code_type), id)
) WITH CLUSTERING ORDER BY (id DESC)
AND default_time_to_live = 3600
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


class VerificationService:
    """Service for verification code operations."""

    # Configuration
    CODE_EXPIRE_MINUTES = 15
    MAX_ATTEMPTS = 3
    MAX_REQUESTS_PER_HOUR = 5
    BLOCK_DURATION_MINUTES = 15

    def __init__(
        self,
        session: "Session",
        keyspace: str,
        email_service: "EmailService",
        auth_service: "AuthService",
    ):
        """Initialize verification service.

        Args:
            session: Cassandra session
            keyspace: Cassandra keyspace
            email_service: Email service for sending codes
            auth_service: Auth service for user operations
        """
        self.session = session
        self.keyspace = keyspace
        self.email_service = email_service
        self.auth_service = auth_service

        # Ensure tables exist
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        """Create tables if they don't exist."""
        statements = [
            CQL_CREATE_VERIFICATION_CODES,
            CQL_CREATE_VERIFICATION_CODES_BY_EMAIL,
            CQL_CREATE_RATE_LIMITS,
        ]
        for stmt in statements:
            try:
                self.session.execute(stmt.format(keyspace=self.keyspace))
            except Exception as e:
                logger.warning("table_creation_skipped", error=str(e))

    # ==========================================================================
    # Code Generation
    # ==========================================================================

    def _generate_code(self) -> tuple[str, str]:
        """Generate a 6-digit code and its hash.

        Returns:
            Tuple of (plain_code, hashed_code)
        """
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        return code, code_hash

    def _verify_code_hash(self, plain_code: str, code_hash: str) -> bool:
        """Verify a code against its hash."""
        return hashlib.sha256(plain_code.encode()).hexdigest() == code_hash

    def _mask_email(self, email: str) -> str:
        """Mask email for display (e.g., t***@example.com)."""
        min_local_length = 2
        local, domain = email.split("@")
        if len(local) <= min_local_length:
            masked_local = local[0] + "***"
        else:
            masked_local = local[0] + "***" + local[-1]
        return f"{masked_local}@{domain}"

    # ==========================================================================
    # Rate Limiting
    # ==========================================================================

    async def _check_rate_limit(self, email: str, ip_address: str | None) -> None:
        """Check rate limits for email and IP.

        Raises:
            RateLimitExceededError: If rate limit exceeded
        """
        keys_to_check = [f"email:{email}"]
        if ip_address:
            keys_to_check.append(f"ip:{ip_address}")

        for key in keys_to_check:
            limit = self._get_rate_limit(key)
            if not limit:
                continue

            # Check if blocked
            if limit.blocked_until and limit.blocked_until > datetime.now(UTC):
                remaining = int((limit.blocked_until - datetime.now(UTC)).total_seconds())
                logger.warning(
                    "rate_limit_blocked",
                    key=key,
                    blocked_until=limit.blocked_until.isoformat(),
                )
                raise RateLimitExceededError(
                    f"Muitas tentativas. Tente novamente em {remaining // 60} minutos.",
                    retry_after_seconds=remaining,
                )

            # Check request count
            if limit.request_count >= self.MAX_REQUESTS_PER_HOUR:
                block_until = datetime.now(UTC) + timedelta(
                    minutes=self.BLOCK_DURATION_MINUTES
                )
                self._block_key(key, block_until)
                logger.warning("rate_limit_exceeded", key=key)
                raise RateLimitExceededError(
                    "Limite de solicitacoes excedido. Tente novamente mais tarde.",
                    retry_after_seconds=self.BLOCK_DURATION_MINUTES * 60,
                )

    def _get_rate_limit(self, key: str) -> RateLimit | None:
        """Get rate limit record for key."""
        # keyspace comes from settings, not user input - safe from SQL injection
        query = SimpleStatement(
            f"SELECT * FROM {self.keyspace}  # noqa: S608
            .verification_rate_limits WHERE key = %s"  # noqa: S608
        )
        row = self.session.execute(query, (key,)).one()
        if not row:
            return None
        return RateLimit(
            key=row.key,
            request_count=row.request_count or 0,
            failed_attempts=row.failed_attempts or 0,
            blocked_until=row.blocked_until,
            last_request_at=row.last_request_at,
        )

    def _increment_rate_limit(self, key: str) -> None:
        """Increment request count for key."""
        limit = self._get_rate_limit(key)
        new_count = (limit.request_count + 1) if limit else 1

        query = SimpleStatement(f"""
            INSERT INTO {self.keyspace}.verification_rate_limits
            (key, request_count, failed_attempts, last_request_at)
            VALUES (%s, %s, %s, %s)
        """)
        self.session.execute(query, (key, new_count, 0, datetime.now(UTC)))

    def _block_key(self, key: str, until: datetime) -> None:
        """Block a key until specified time."""
        query = SimpleStatement(f"""
            UPDATE {self.keyspace}.verification_rate_limits
            SET blocked_until = %s
            WHERE key = %s
        """)
        self.session.execute(query, (until, key))

    # ==========================================================================
    # Verification Code Operations
    # ==========================================================================

    def _save_verification_code(self, code: VerificationCode) -> None:
        """Save verification code to database."""
        # Main table
        query1 = SimpleStatement(f"""
            INSERT INTO {self.keyspace}.verification_codes
            (id, user_id, email, code_hash, code_type, new_email, attempts,
             is_used, expires_at, created_at, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """)
        self.session.execute(
            query1,
            (
                code.id,
                code.user_id,
                code.email,
                code.code_hash,
                code.code_type,
                code.new_email,
                code.attempts,
                code.is_used,
                code.expires_at,
                code.created_at,
                code.ip_address,
                code.user_agent,
            ),
        )

        # Lookup table
        query2 = SimpleStatement(f"""
            INSERT INTO {self.keyspace}.verification_codes_by_email
            (email, code_type, id, expires_at)
            VALUES (%s, %s, %s, %s)
        """)
        self.session.execute(query2, (code.email, code.code_type, code.id, code.expires_at))

    def _get_verification_code(self, code_id: UUID) -> VerificationCode | None:
        """Get verification code by ID."""
        query = SimpleStatement(
            f"SELECT * FROM {self.keyspace}  # noqa: S608
            .verification_codes WHERE id = %s"
        )
        row = self.session.execute(query, (code_id,)).one()
        if not row:
            return None
        return VerificationCode(
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

    def _get_active_code(self, email: str, code_type: str) -> VerificationCode | None:
        """Get active (non-expired, non-used) code for email."""
        # Get latest code ID from lookup table
        query = SimpleStatement(f"""
            SELECT id, expires_at FROM {self.keyspace}.verification_codes_by_email
            WHERE email = %s AND code_type = %s
            LIMIT 1
        """)
        row = self.session.execute(query, (email, code_type)).one()
        if not row:
            return None

        # Check if expired
        if row.expires_at < datetime.now(UTC):
            return None

        # Get full code
        code = self._get_verification_code(row.id)
        if code and not code.is_used:
            return code
        return None

    def _invalidate_existing_codes(self, email: str, code_type: str) -> None:
        """Invalidate all existing codes for email/type."""
        query = SimpleStatement(f"""
            SELECT id FROM {self.keyspace}.verification_codes_by_email
            WHERE email = %s AND code_type = %s
        """)
        rows = self.session.execute(query, (email, code_type))
        for row in rows:
            update = SimpleStatement(
                f"UPDATE {self.keyspace}.verification_codes SET is_used = true WHERE id = %s"
            )
            self.session.execute(update, (row.id,))

    def _increment_attempts(self, code_id: UUID) -> int:
        """Increment attempt count and return new value."""
        code = self._get_verification_code(code_id)
        if not code:
            return 0
        new_attempts = code.attempts + 1
        query = SimpleStatement(
            f"UPDATE {self.keyspace}.verification_codes SET attempts = %s WHERE id = %s"
        )
        self.session.execute(query, (new_attempts, code_id))
        return new_attempts

    def _mark_code_used(self, code_id: UUID) -> None:
        """Mark code as used."""
        query = SimpleStatement(
            f"UPDATE {self.keyspace}.verification_codes SET is_used = true WHERE id = %s"
        )
        self.session.execute(query, (code_id,))

    # ==========================================================================
    # Password Reset
    # ==========================================================================

    async def request_password_reset(
        self,
        email: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Request password reset code.

        Always returns True to not reveal if email exists.

        Args:
            email: User email
            ip_address: Client IP for rate limiting
            user_agent: Client user agent

        Returns:
            True (always, for security)

        Raises:
            RateLimitExceededError: If rate limit exceeded
        """
        # Check rate limit
        await self._check_rate_limit(email, ip_address)

        # Increment rate limit counter
        self._increment_rate_limit(f"email:{email}")
        if ip_address:
            self._increment_rate_limit(f"ip:{ip_address}")

        # Check if user exists
        user = self.auth_service.get_user_by_email(email)
        if not user:
            logger.info("password_reset_user_not_found", email=email)
            return True  # Don't reveal if email exists

        # Invalidate existing codes
        self._invalidate_existing_codes(email, "password_reset")

        # Generate new code
        plain_code, code_hash = self._generate_code()

        # Save code
        verification = VerificationCode(
            id=uuid4(),
            user_id=user.id,
            email=email,
            code_hash=code_hash,
            code_type="password_reset",
            new_email=None,
            attempts=0,
            is_used=False,
            expires_at=datetime.now(UTC) + timedelta(minutes=self.CODE_EXPIRE_MINUTES),
            created_at=datetime.now(UTC),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self._save_verification_code(verification)

        # Send email
        await self.email_service.send_password_reset_code(
            to=email,
            user_name=user.name or email.split("@")[0],
            code=plain_code,
        )

        logger.info(
            "password_reset_code_sent",
            email=email,
            user_id=str(user.id),
        )

        return True

    async def verify_reset_code(self, email: str, code: str) -> bool:
        """Verify reset code without using it.

        Args:
            email: User email
            code: 6-digit code

        Returns:
            True if code is valid

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        verification = self._get_active_code(email, "password_reset")
        if not verification:
            raise InvalidCodeError

        # Check attempts
        if verification.attempts >= self.MAX_ATTEMPTS:
            raise MaxAttemptsExceededError

        # Verify code
        if not self._verify_code_hash(code, verification.code_hash):
            self._increment_attempts(verification.id)
            raise InvalidCodeError

        return True

    async def reset_password(
        self,
        email: str,
        code: str,
        new_password: str,
    ) -> bool:
        """Reset password using verification code.

        Args:
            email: User email
            code: 6-digit code
            new_password: New password

        Returns:
            True if successful

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        verification = self._get_active_code(email, "password_reset")
        if not verification:
            raise InvalidCodeError

        # Check attempts
        if verification.attempts >= self.MAX_ATTEMPTS:
            raise MaxAttemptsExceededError

        # Verify code
        if not self._verify_code_hash(code, verification.code_hash):
            self._increment_attempts(verification.id)
            raise InvalidCodeError

        # Get user
        user = self.auth_service.get_user_by_email(email)
        if not user:
            raise InvalidCodeError("Usuario nao encontrado")

        # Update password
        self.auth_service.reset_password(user.id, new_password)

        # Mark code as used
        self._mark_code_used(verification.id)

        # Send notification email
        await self.email_service.send_password_changed_notification(
            to=email,
            user_name=user.name or email.split("@")[0],
        )

        logger.info(
            "password_reset_completed",
            email=email,
            user_id=str(user.id),
        )

        return True

    # ==========================================================================
    # Email Change
    # ==========================================================================

    async def request_email_change(
        self,
        user_id: UUID,
        new_email: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> str:
        """Request email change verification.

        Args:
            user_id: Current user ID
            new_email: New email address
            password: Current password for verification
            ip_address: Client IP
            user_agent: Client user agent

        Returns:
            Masked new email for display

        Raises:
            InvalidCodeError: If password is wrong
            EmailNotAvailableError: If new email is already in use
            RateLimitExceededError: If rate limit exceeded
        """
        # Get user
        user = self.auth_service.get_user_by_id(user_id)
        if not user:
            raise InvalidCodeError("Usuario nao encontrado")

        # Verify password
        if not self.auth_service.verify_password(password, user.password_hash):
            raise InvalidCodeError("Senha incorreta")

        # Check if new email is available
        if not self.auth_service.is_email_available(new_email):
            raise EmailNotAvailableError

        # Check rate limit
        await self._check_rate_limit(user.email, ip_address)

        # Increment rate limit
        self._increment_rate_limit(f"email:{user.email}")
        if ip_address:
            self._increment_rate_limit(f"ip:{ip_address}")

        # Invalidate existing codes
        self._invalidate_existing_codes(user.email, "email_change")

        # Generate code
        plain_code, code_hash = self._generate_code()

        # Save code
        verification = VerificationCode(
            id=uuid4(),
            user_id=user_id,
            email=user.email,
            code_hash=code_hash,
            code_type="email_change",
            new_email=new_email,
            attempts=0,
            is_used=False,
            expires_at=datetime.now(UTC) + timedelta(minutes=self.CODE_EXPIRE_MINUTES),
            created_at=datetime.now(UTC),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self._save_verification_code(verification)

        # Send code to NEW email
        await self.email_service.send_email_change_code(
            to=new_email,
            user_name=user.name or user.email.split("@")[0],
            code=plain_code,
        )

        logger.info(
            "email_change_code_sent",
            user_id=str(user_id),
            new_email=new_email,
        )

        return self._mask_email(new_email)

    async def confirm_email_change(
        self,
        user_id: UUID,
        code: str,
    ) -> str:
        """Confirm email change with verification code.

        Args:
            user_id: Current user ID
            code: 6-digit verification code

        Returns:
            New email address

        Raises:
            InvalidCodeError: If code is invalid
            MaxAttemptsExceededError: If max attempts exceeded
        """
        # Get user
        user = self.auth_service.get_user_by_id(user_id)
        if not user:
            raise InvalidCodeError("Usuario nao encontrado")

        # Get active code
        verification = self._get_active_code(user.email, "email_change")
        if not verification or verification.user_id != user_id:
            raise InvalidCodeError

        # Check attempts
        if verification.attempts >= self.MAX_ATTEMPTS:
            raise MaxAttemptsExceededError

        # Verify code
        if not self._verify_code_hash(code, verification.code_hash):
            self._increment_attempts(verification.id)
            raise InvalidCodeError

        new_email = verification.new_email
        if not new_email:
            raise InvalidCodeError("Novo email nao encontrado")

        # Check if still available
        if not self.auth_service.is_email_available(new_email):
            raise EmailNotAvailableError

        old_email = user.email

        # Update email
        self.auth_service.update_user_email(user_id, new_email)

        # Mark code as used
        self._mark_code_used(verification.id)

        # Send notifications
        await self.email_service.send_email_changed_notification(
            to=old_email,
            user_name=user.name or old_email.split("@")[0],
            new_email=new_email,
            is_new_email=False,
        )
        await self.email_service.send_email_changed_notification(
            to=new_email,
            user_name=user.name or new_email.split("@")[0],
            new_email=new_email,
            is_new_email=True,
        )

        logger.info(
            "email_change_completed",
            user_id=str(user_id),
            old_email=old_email,
            new_email=new_email,
        )

        return new_email
