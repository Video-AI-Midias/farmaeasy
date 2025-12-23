"""Verification Service for Password Reset and Email Change.

Security Features:
- 6-digit codes with SHA-256 hashing
- 15-minute expiration
- Maximum 3 attempts per code
- Rate limiting: 5 requests/hour per email/IP
- 15-minute block after exceeded attempts
- Audit logging for all operations
- Never reveals if email exists in system
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from src.core.logging import get_logger


if TYPE_CHECKING:
    from cassandra.cluster import Session

    from src.auth.service import AuthService
    from src.email.service import EmailService

logger = get_logger(__name__)


# =============================================================================
# Exceptions
# =============================================================================


class VerificationError(Exception):
    """Base exception for verification errors."""


class RateLimitExceededError(VerificationError):
    """Raised when rate limit is exceeded."""


class InvalidCodeError(VerificationError):
    """Raised when verification code is invalid."""


class MaxAttemptsExceededError(VerificationError):
    """Raised when max attempts are exceeded."""


class CodeExpiredError(VerificationError):
    """Raised when verification code has expired."""


class EmailNotAvailableError(VerificationError):
    """Raised when new email is already in use."""


# =============================================================================
# Enums
# =============================================================================


class CodeType(str, Enum):
    """Types of verification codes."""

    PASSWORD_RESET = "password_reset"  # noqa: S105
    EMAIL_CHANGE = "email_change"


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class VerificationCode:
    """Verification code entity."""

    id: UUID
    user_id: UUID | None
    email: str
    code_hash: str
    code_type: CodeType
    new_email: str | None
    attempts: int
    is_used: bool
    expires_at: datetime
    created_at: datetime
    ip_address: str | None
    user_agent: str | None


@dataclass
class RateLimit:
    """Rate limit tracking entity."""

    key: str
    request_count: int
    failed_attempts: int
    blocked_until: datetime | None
    last_request_at: datetime


# =============================================================================
# CQL Table Definitions
# =============================================================================

CREATE_VERIFICATION_CODES_TABLE = """
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
)
"""

CREATE_VERIFICATION_CODES_BY_EMAIL_TABLE = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_codes_by_email (
    email TEXT,
    code_type TEXT,
    id UUID,
    code_hash TEXT,
    user_id UUID,
    new_email TEXT,
    attempts INT,
    is_used BOOLEAN,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    PRIMARY KEY ((email, code_type), id)
) WITH CLUSTERING ORDER BY (id DESC)
"""

CREATE_RATE_LIMITS_TABLE = """
CREATE TABLE IF NOT EXISTS {keyspace}.verification_rate_limits (
    key TEXT PRIMARY KEY,
    request_count INT,
    failed_attempts INT,
    blocked_until TIMESTAMP,
    last_request_at TIMESTAMP
) WITH default_time_to_live = 3600
"""


# =============================================================================
# Verification Service
# =============================================================================


class VerificationService:
    """Service for handling verification codes."""

    # Configuration constants
    CODE_EXPIRE_MINUTES = 15
    MAX_ATTEMPTS = 3
    MAX_REQUESTS_PER_HOUR = 5
    BLOCK_DURATION_MINUTES = 15
    MIN_LOCAL_EMAIL_LENGTH = 2

    _initialized: bool = False

    def __init__(
        self,
        session: "Session",
        keyspace: str,
        email_service: "EmailService",
        auth_service: "AuthService",
    ) -> None:
        """Initialize verification service."""
        self.session = session
        self.keyspace = keyspace
        self.email_service = email_service
        self.auth_service = auth_service
        self._prepare_statements()

    async def initialize(self) -> None:
        """Initialize tables (async). Call once after construction."""
        if not self._initialized:
            await self._ensure_tables()
            self._initialized = True

    async def _ensure_tables(self) -> None:
        """Create tables if they don't exist (async)."""
        tables = [
            CREATE_VERIFICATION_CODES_TABLE,
            CREATE_VERIFICATION_CODES_BY_EMAIL_TABLE,
            CREATE_RATE_LIMITS_TABLE,
        ]
        for table_cql in tables:
            await self.session.aexecute(table_cql.format(keyspace=self.keyspace))

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for better performance."""
        # Insert verification code
        self._insert_code = self.session.prepare(
            f"""
            INSERT INTO {self.keyspace}.verification_codes
            (id, user_id, email, code_hash, code_type, new_email, attempts,
             is_used, expires_at, created_at, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        )

        # Insert verification code by email
        self._insert_code_by_email = self.session.prepare(
            f"""
            INSERT INTO {self.keyspace}.verification_codes_by_email
            (email, code_type, id, code_hash, user_id, new_email, attempts,
             is_used, expires_at, created_at, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        )

        # Get code by id
        self._get_code_by_id = self.session.prepare(
            f"""
            SELECT * FROM {self.keyspace}.verification_codes WHERE id = ?
            """
        )

        # Get codes by email and type
        self._get_codes_by_email = self.session.prepare(
            f"""
            SELECT * FROM {self.keyspace}.verification_codes_by_email
            WHERE email = ? AND code_type = ?
            LIMIT 10
            """
        )

        # Update attempts
        self._update_attempts = self.session.prepare(
            f"""
            UPDATE {self.keyspace}.verification_codes
            SET attempts = ?
            WHERE id = ?
            """
        )

        # Update attempts by email
        self._update_attempts_by_email = self.session.prepare(
            f"""
            UPDATE {self.keyspace}.verification_codes_by_email
            SET attempts = ?
            WHERE email = ? AND code_type = ? AND id = ?
            """
        )

        # Mark code as used
        self._mark_code_used = self.session.prepare(
            f"""
            UPDATE {self.keyspace}.verification_codes
            SET is_used = true
            WHERE id = ?
            """
        )

        # Mark code as used by email
        self._mark_code_used_by_email = self.session.prepare(
            f"""
            UPDATE {self.keyspace}.verification_codes_by_email
            SET is_used = true
            WHERE email = ? AND code_type = ? AND id = ?
            """
        )

        # Get rate limit
        self._get_rate_limit = self.session.prepare(
            f"""
            SELECT * FROM {self.keyspace}.verification_rate_limits
            WHERE key = ?
            """
        )

        # Upsert rate limit
        self._upsert_rate_limit = self.session.prepare(
            f"""
            INSERT INTO {self.keyspace}.verification_rate_limits
            (key, request_count, failed_attempts, blocked_until, last_request_at)
            VALUES (?, ?, ?, ?, ?)
            """
        )

    # =========================================================================
    # Code Generation & Verification
    # =========================================================================

    def _generate_code(self) -> tuple[str, str]:
        """Generate a 6-digit code and its hash."""
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        return code, code_hash

    def _verify_code_hash(self, plain_code: str, code_hash: str) -> bool:
        """Verify a code against its hash."""
        computed_hash = hashlib.sha256(plain_code.encode()).hexdigest()
        return secrets.compare_digest(computed_hash, code_hash)

    def _mask_email(self, email: str) -> str:
        """Mask email for display."""
        local, domain = email.split("@")
        if len(local) <= self.MIN_LOCAL_EMAIL_LENGTH:
            masked_local = local[0] + "*"
        else:
            masked_local = local[0] + "***"
        return f"{masked_local}@{domain}"

    # =========================================================================
    # Rate Limiting
    # =========================================================================

    async def _check_rate_limit(self, email: str, ip: str | None) -> None:
        """Check rate limits for email and IP."""
        keys_to_check = [f"email:{email}"]
        if ip:
            keys_to_check.append(f"ip:{ip}")

        now = datetime.now(UTC)

        for key in keys_to_check:
            result = await self.session.aexecute(self._get_rate_limit, [key])
            row = result.one()

            if row:
                # Check if blocked
                if row.blocked_until:
                    blocked_until = row.blocked_until
                    if blocked_until.tzinfo is None:
                        blocked_until = blocked_until.replace(tzinfo=UTC)
                    if blocked_until > now:
                        remaining = int((blocked_until - now).total_seconds() / 60) + 1
                        logger.warning(
                            "rate_limit_blocked",
                            key=key,
                            blocked_until=blocked_until.isoformat(),
                        )
                        msg = f"Too many attempts. Try again in {remaining} minutes."
                        raise RateLimitExceededError(msg)

                # Check request count
                if row.request_count >= self.MAX_REQUESTS_PER_HOUR:
                    blocked_until = now + timedelta(minutes=self.BLOCK_DURATION_MINUTES)
                    await self.session.aexecute(
                        self._upsert_rate_limit,
                        [
                            key,
                            row.request_count,
                            row.failed_attempts,
                            blocked_until,
                            now,
                        ],
                    )
                    logger.warning(
                        "rate_limit_exceeded",
                        key=key,
                        request_count=row.request_count,
                    )
                    msg = "Request limit exceeded. Try again later."
                    raise RateLimitExceededError(msg)

    async def _increment_rate_limit(self, email: str, ip: str | None) -> None:
        """Increment rate limit counters."""
        keys = [f"email:{email}"]
        if ip:
            keys.append(f"ip:{ip}")

        now = datetime.now(UTC)

        for key in keys:
            result = await self.session.aexecute(self._get_rate_limit, [key])
            row = result.one()

            if row:
                new_count = row.request_count + 1
                await self.session.aexecute(
                    self._upsert_rate_limit,
                    [key, new_count, row.failed_attempts, row.blocked_until, now],
                )
            else:
                await self.session.aexecute(
                    self._upsert_rate_limit, [key, 1, 0, None, now]
                )

    async def _record_failed_attempt(
        self, code_id: UUID, email: str, code_type: CodeType
    ) -> int:
        """Record a failed verification attempt."""
        result = await self.session.aexecute(self._get_code_by_id, [code_id])
        row = result.one()

        if row:
            new_attempts = row.attempts + 1
            await self.session.aexecute(self._update_attempts, [new_attempts, code_id])
            await self.session.aexecute(
                self._update_attempts_by_email,
                [new_attempts, email, code_type.value, code_id],
            )

            logger.warning(
                "verification_attempt_failed",
                code_id=str(code_id),
                attempts=new_attempts,
                max_attempts=self.MAX_ATTEMPTS,
            )

            return new_attempts
        return 0

    # =========================================================================
    # Password Reset Flow
    # =========================================================================

    async def request_password_reset(
        self,
        email: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Request a password reset code."""
        logger.info("password_reset_requested", email=self._mask_email(email))

        # Check rate limit
        await self._check_rate_limit(email, ip)

        # Increment rate limit
        await self._increment_rate_limit(email, ip)

        # Check if user exists (but don't reveal this to caller)
        user = await self.auth_service.get_user_by_email(email)
        if not user:
            logger.info(
                "password_reset_email_not_found",
                email=self._mask_email(email),
            )
            return True

        # Invalidate existing codes
        await self._invalidate_existing_codes(email, CodeType.PASSWORD_RESET)

        # Generate new code
        plain_code, code_hash = self._generate_code()
        code_id = uuid4()
        now = datetime.now(UTC)
        expires_at = now + timedelta(minutes=self.CODE_EXPIRE_MINUTES)

        # Store code
        await self.session.aexecute(
            self._insert_code,
            [
                code_id,
                user.id,
                email,
                code_hash,
                CodeType.PASSWORD_RESET.value,
                None,
                0,
                False,
                expires_at,
                now,
                ip,
                user_agent,
            ],
        )

        await self.session.aexecute(
            self._insert_code_by_email,
            [
                email,
                CodeType.PASSWORD_RESET.value,
                code_id,
                code_hash,
                user.id,
                None,
                0,
                False,
                expires_at,
                now,
                ip,
                user_agent,
            ],
        )

        # Send email
        try:
            await self.email_service.send_password_reset_code(
                to=email,
                user_name=user.name or "Usuario",
                code=plain_code,
            )
            logger.info(
                "password_reset_code_sent",
                email=self._mask_email(email),
                code_id=str(code_id),
            )
        except Exception as e:
            logger.error(
                "password_reset_email_failed",
                email=self._mask_email(email),
                error=str(e),
            )

        return True

    async def verify_reset_code(self, email: str, code: str) -> bool:
        """Verify a password reset code without using it."""
        result = await self.session.aexecute(
            self._get_codes_by_email, [email, CodeType.PASSWORD_RESET.value]
        )
        rows = list(result)

        now = datetime.now(UTC)

        for row in rows:
            if row.is_used:
                continue

            expires_at = row.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at < now:
                continue

            if row.attempts >= self.MAX_ATTEMPTS:
                raise MaxAttemptsExceededError(
                    "Maximum verification attempts exceeded."
                )

            if self._verify_code_hash(code, row.code_hash):
                logger.info(
                    "password_reset_code_verified",
                    email=self._mask_email(email),
                    code_id=str(row.id),
                )
                return True
            await self._record_failed_attempt(row.id, email, CodeType.PASSWORD_RESET)

        raise InvalidCodeError("Invalid or expired verification code.")

    async def reset_password(self, email: str, code: str, new_password: str) -> bool:
        """Reset password using verification code."""
        result = await self.session.aexecute(
            self._get_codes_by_email, [email, CodeType.PASSWORD_RESET.value]
        )
        rows = list(result)

        now = datetime.now(UTC)

        for row in rows:
            if row.is_used:
                continue

            expires_at = row.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at < now:
                continue

            if row.attempts >= self.MAX_ATTEMPTS:
                raise MaxAttemptsExceededError(
                    "Maximum verification attempts exceeded."
                )

            if self._verify_code_hash(code, row.code_hash):
                user = await self.auth_service.get_user_by_email(email)
                if not user:
                    raise InvalidCodeError("User not found.")

                await self.auth_service.reset_password(user.id, new_password)

                # Mark code as used
                await self.session.aexecute(self._mark_code_used, [row.id])
                await self.session.aexecute(
                    self._mark_code_used_by_email,
                    [email, CodeType.PASSWORD_RESET.value, row.id],
                )

                # Send notification email
                try:
                    await self.email_service.send_password_changed_notification(
                        to_email=email,
                        user_name=user.name or "Usuario",
                    )
                except Exception as e:
                    logger.error(
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
            await self._record_failed_attempt(row.id, email, CodeType.PASSWORD_RESET)

        raise InvalidCodeError("Invalid or expired verification code.")

    # =========================================================================
    # Email Change Flow
    # =========================================================================

    async def request_email_change(
        self,
        user_id: UUID,
        new_email: str,
        password: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """Request an email change."""
        user = await self.auth_service.get_user_by_id(user_id)
        if not user:
            raise VerificationError("User not found.")

        # Verify current password
        if not self.auth_service.verify_password(password, user.password_hash):
            logger.warning(
                "email_change_wrong_password",
                user_id=str(user_id),
            )
            raise VerificationError("Invalid password.")

        # Check if new email is available
        existing_user = await self.auth_service.get_user_by_email(new_email)
        if existing_user:
            raise EmailNotAvailableError("This email is already in use.")

        # Check rate limit
        await self._check_rate_limit(user.email, ip)
        await self._increment_rate_limit(user.email, ip)

        # Invalidate existing codes
        await self._invalidate_existing_codes(user.email, CodeType.EMAIL_CHANGE)

        # Generate code
        plain_code, code_hash = self._generate_code()
        code_id = uuid4()
        now = datetime.now(UTC)
        expires_at = now + timedelta(minutes=self.CODE_EXPIRE_MINUTES)

        # Store code
        await self.session.aexecute(
            self._insert_code,
            [
                code_id,
                user_id,
                user.email,
                code_hash,
                CodeType.EMAIL_CHANGE.value,
                new_email,
                0,
                False,
                expires_at,
                now,
                ip,
                user_agent,
            ],
        )

        await self.session.aexecute(
            self._insert_code_by_email,
            [
                user.email,
                CodeType.EMAIL_CHANGE.value,
                code_id,
                code_hash,
                user_id,
                new_email,
                0,
                False,
                expires_at,
                now,
                ip,
                user_agent,
            ],
        )

        # Send code to NEW email
        try:
            await self.email_service.send_email_change_code(
                to_email=new_email,
                user_name=user.name or "Usuario",
                code=plain_code,
            )
            logger.info(
                "email_change_code_sent",
                user_id=str(user_id),
                new_email=self._mask_email(new_email),
            )
        except Exception as e:
            logger.error(
                "email_change_code_send_failed",
                user_id=str(user_id),
                error=str(e),
            )
            raise VerificationError("Failed to send verification code.") from e

        return True

    async def confirm_email_change(self, user_id: UUID, code: str) -> str:
        """Confirm email change with verification code."""
        user = await self.auth_service.get_user_by_id(user_id)
        if not user:
            raise VerificationError("User not found.")

        result = await self.session.aexecute(
            self._get_codes_by_email, [user.email, CodeType.EMAIL_CHANGE.value]
        )
        rows = list(result)

        now = datetime.now(UTC)

        for row in rows:
            if row.is_used:
                continue

            if row.user_id != user_id:
                continue

            expires_at = row.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at < now:
                continue

            if row.attempts >= self.MAX_ATTEMPTS:
                raise MaxAttemptsExceededError(
                    "Maximum verification attempts exceeded."
                )

            if self._verify_code_hash(code, row.code_hash):
                new_email = row.new_email

                # Check again if new email is still available
                if await self.auth_service.get_user_by_email(new_email):
                    raise EmailNotAvailableError("This email is no longer available.")

                # Update email
                await self.auth_service.update_user_email(user_id, new_email)

                # Mark code as used
                await self.session.aexecute(self._mark_code_used, [row.id])
                await self.session.aexecute(
                    self._mark_code_used_by_email,
                    [user.email, CodeType.EMAIL_CHANGE.value, row.id],
                )

                # Send notification to OLD email
                try:
                    await self.email_service.send_email_changed_notification(
                        to_email=user.email,
                        user_name=user.name or "Usuario",
                        new_email=new_email,
                    )
                except Exception as e:
                    logger.error(
                        "email_changed_notification_failed",
                        user_id=str(user_id),
                        error=str(e),
                    )

                logger.info(
                    "email_change_completed",
                    user_id=str(user_id),
                    old_email=self._mask_email(user.email),
                    new_email=self._mask_email(new_email),
                )

                return new_email
            await self._record_failed_attempt(row.id, user.email, CodeType.EMAIL_CHANGE)

        raise InvalidCodeError("Invalid or expired verification code.")

    # =========================================================================
    # Helpers
    # =========================================================================

    async def _invalidate_existing_codes(self, email: str, code_type: CodeType) -> None:
        """Invalidate all existing codes for email and type."""
        result = await self.session.aexecute(
            self._get_codes_by_email, [email, code_type.value]
        )

        for row in result:
            if not row.is_used:
                await self.session.aexecute(self._mark_code_used, [row.id])
                await self.session.aexecute(
                    self._mark_code_used_by_email,
                    [email, code_type.value, row.id],
                )

        logger.debug(
            "existing_codes_invalidated",
            email=self._mask_email(email),
            code_type=code_type.value,
        )
