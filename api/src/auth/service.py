"""Authentication service layer.

Business logic for:
- User registration and login
- Token creation and refresh
- Password management
- User queries
"""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from src.auth.models import RefreshToken, RefreshTokenByUser, User
from src.auth.permissions import UserRole
from src.auth.schemas import AdminCreateUserRequest, RegisterRequest, UserResponse
from src.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from src.config.settings import get_settings


if TYPE_CHECKING:
    from cassandra.cluster import Session


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class AuthError(Exception):
    """Base authentication error."""

    def __init__(self, message: str, code: str = "auth_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class InvalidCredentialsError(AuthError):
    """Invalid email or password."""

    def __init__(self, message: str = "Email ou senha invalidos"):
        super().__init__(message, "invalid_credentials")


class UserExistsError(AuthError):
    """User already exists (email or CPF)."""

    def __init__(
        self,
        message: str = "Usuario ja existe",
        field: str | None = None,
    ):
        super().__init__(message, "user_exists")
        self.field = field  # Which field caused the conflict: "email" or "cpf"


class UserNotFoundError(AuthError):
    """User not found."""

    def __init__(self, message: str = "Usuario nao encontrado"):
        super().__init__(message, "user_not_found")


class UserInactiveError(AuthError):
    """User account is inactive."""

    def __init__(self, message: str = "Conta inativa"):
        super().__init__(message, "user_inactive")


class InvalidTokenError(AuthError):
    """Invalid or expired token."""

    def __init__(self, message: str = "Token invalido ou expirado"):
        super().__init__(message, "invalid_token")


class PermissionDeniedError(AuthError):
    """Permission denied for operation."""

    def __init__(self, message: str = "Permissao negada"):
        super().__init__(message, "permission_denied")


class SessionLimitExceededError(AuthError):
    """Maximum concurrent sessions limit exceeded."""

    def __init__(
        self,
        message: str = "Limite de acessos simultaneos atingido",
        current_sessions: int = 0,
        max_sessions: int = 0,
    ):
        super().__init__(message, "session_limit_exceeded")
        self.current_sessions = current_sessions
        self.max_sessions = max_sessions


# ==============================================================================
# Auth Service
# ==============================================================================


class AuthService:
    """Authentication service for user management and token operations."""

    def __init__(self, session: "Session", keyspace: str):
        """Initialize with Cassandra session.

        Args:
            session: Cassandra driver session
            keyspace: Keyspace name for queries
        """
        self.session = session
        self.keyspace = keyspace
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for better performance."""
        # User queries
        self._get_user_by_email = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.users WHERE email = ?"
        )
        self._get_user_by_cpf = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.users WHERE cpf = ?"
        )
        self._get_user_by_id = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.users WHERE id = ?"
        )
        self._get_user_by_name = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.users WHERE name = ?"
        )
        self._insert_user = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.users
            (id, email, cpf, rg, phone, name, password_hash, role, is_active,
             avatar_url, address_street, address_number, address_complement,
             address_neighborhood, address_city, address_state, address_zip_code,
             created_at, updated_at,
             cnpj, store_type, business_model, units_count, erp_system,
             instagram, monthly_revenue, birth_date, registration_link_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._update_user = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET name = ?, phone = ?, avatar_url = ?, updated_at = ?
            WHERE id = ?
        """)
        self._update_user_password = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET password_hash = ?, updated_at = ?
            WHERE id = ?
        """)
        self._update_user_role = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET role = ?, updated_at = ?
            WHERE id = ?
        """)
        self._deactivate_user = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET is_active = ?, updated_at = ?
            WHERE id = ?
        """)
        self._update_user_max_sessions = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET max_concurrent_sessions = ?, updated_at = ?
            WHERE id = ?
        """)
        self._update_user_email = self.session.prepare(f"""
            UPDATE {self.keyspace}.users
            SET email = ?, updated_at = ?
            WHERE id = ?
        """)
        self._list_users_by_role = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.users
            WHERE is_active = true AND role = ?
            ALLOW FILTERING
        """)

        # Refresh token queries
        self._get_token_by_jti = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.refresh_tokens WHERE jti = ?"
        )
        self._insert_token = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.refresh_tokens
            (jti, user_id, expires_at, revoked, revoked_at, created_at,
             user_agent, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """)
        self._revoke_token = self.session.prepare(f"""
            UPDATE {self.keyspace}.refresh_tokens
            SET revoked = true, revoked_at = ?
            WHERE jti = ?
        """)
        self._insert_token_by_user = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.refresh_tokens_by_user
            (user_id, jti, expires_at, revoked, created_at)
            VALUES (?, ?, ?, ?, ?)
        """)
        self._get_tokens_by_user = self.session.prepare(
            f"SELECT * FROM {self.keyspace}.refresh_tokens_by_user WHERE user_id = ?"
        )
        self._revoke_token_by_user = self.session.prepare(f"""
            UPDATE {self.keyspace}.refresh_tokens_by_user
            SET revoked = true
            WHERE user_id = ? AND jti = ?
        """)

    # ==========================================================================
    # User Operations
    # ==========================================================================

    async def get_user_by_email(self, email: str) -> User | None:
        """Find user by email address."""
        result = await self.session.aexecute(self._get_user_by_email, [email.lower()])
        row = result[0] if result else None
        return User.from_row(row) if row else None

    async def get_user_by_cpf(self, cpf: str) -> User | None:
        """Find user by CPF."""
        result = await self.session.aexecute(self._get_user_by_cpf, [cpf])
        row = result[0] if result else None
        return User.from_row(row) if row else None

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Find user by ID."""
        result = await self.session.aexecute(self._get_user_by_id, [user_id])
        row = result[0] if result else None
        return User.from_row(row) if row else None

    async def get_user_by_name(self, name: str) -> User | None:
        """Find user by name (exact match).

        Used for @mention resolution in comments.
        Returns the first matching user if multiple exist with same name.
        """
        result = await self.session.aexecute(self._get_user_by_name, [name])
        row = result[0] if result else None
        return User.from_row(row) if row else None

    async def register_user(self, data: RegisterRequest) -> User:
        """Register a new user.

        Args:
            data: Registration request data

        Returns:
            Created User instance

        Raises:
            UserExistsError: If email or CPF already exists
        """
        # Check email uniqueness
        if await self.get_user_by_email(data.email):
            raise UserExistsError("Email ja cadastrado", field="email")

        # Check CPF uniqueness (if provided)
        if data.cpf and await self.get_user_by_cpf(data.cpf):
            raise UserExistsError("CPF ja cadastrado", field="cpf")

        # Create user
        user = User(
            email=data.email,
            cpf=data.cpf,
            phone=data.phone,
            name=data.name,
            password_hash=hash_password(data.password),
            role=UserRole.USER.value,
            is_active=True,
        )

        await self._insert_user_to_db(user)
        return user

    async def admin_create_user(self, data: AdminCreateUserRequest) -> User:
        """Create a new user (admin only).

        Args:
            data: Admin create user request data

        Returns:
            Created User instance

        Raises:
            UserExistsError: If email or CPF already exists
        """
        # Check email uniqueness
        if await self.get_user_by_email(data.email):
            raise UserExistsError("Email ja cadastrado", field="email")

        # Check CPF uniqueness (if provided)
        if data.cpf and await self.get_user_by_cpf(data.cpf):
            raise UserExistsError("CPF ja cadastrado", field="cpf")

        # Extract address fields
        address = data.address
        address_street = address.street if address else None
        address_number = address.number if address else None
        address_complement = address.complement if address else None
        address_neighborhood = address.neighborhood if address else None
        address_city = address.city if address else None
        address_state = address.state if address else None
        address_zip_code = address.zip_code if address else None

        # Create user with all fields
        user = User(
            email=data.email,
            cpf=data.cpf,
            rg=data.rg,
            phone=data.phone or "",
            name=data.name or "",
            password_hash=hash_password(data.password),
            role=data.role.value,
            is_active=True,
            avatar_url=data.avatar_url,
            address_street=address_street,
            address_number=address_number,
            address_complement=address_complement,
            address_neighborhood=address_neighborhood,
            address_city=address_city,
            address_state=address_state,
            address_zip_code=address_zip_code,
        )

        await self._insert_user_to_db(user)
        return user

    async def create_user(
        self,
        email: str,
        password: str,
        name: str,
        phone: str = "",
        cpf: str | None = None,
        rg: str | None = None,
        role: str = UserRole.USER.value,
        avatar_url: str | None = None,
        address_street: str | None = None,
        address_number: str | None = None,
        address_complement: str | None = None,
        address_neighborhood: str | None = None,
        address_city: str | None = None,
        address_state: str | None = None,
        address_zip_code: str | None = None,
        # Company fields
        cnpj: str | None = None,
        store_type: str | None = None,
        business_model: str | None = None,
        units_count: int | None = None,
        erp_system: str | None = None,
        instagram: str | None = None,
        monthly_revenue: str | None = None,
        birth_date=None,
        registration_link_id=None,
    ) -> User:
        """Create a new user with all fields.

        This method is used by registration links to create users
        with company information.

        Args:
            email: User email
            password: Plain text password (will be hashed)
            name: Full name
            phone: Phone number
            cpf: Brazilian CPF
            rg: Brazilian RG
            role: User role
            avatar_url: Profile picture URL
            address_*: Address fields
            cnpj: Company CNPJ
            store_type: Type of store
            business_model: Business model
            units_count: Number of units
            erp_system: ERP system name
            instagram: Instagram handle
            monthly_revenue: Monthly revenue range
            birth_date: Birth date
            registration_link_id: ID of registration link used

        Returns:
            Created User instance

        Raises:
            UserExistsError: If email or CPF already exists
        """
        # Check email uniqueness
        if await self.get_user_by_email(email):
            raise UserExistsError("Email ja cadastrado", field="email")

        # Check CPF uniqueness (if provided)
        if cpf and await self.get_user_by_cpf(cpf):
            raise UserExistsError("CPF ja cadastrado", field="cpf")

        # Create user
        user = User(
            email=email,
            cpf=cpf,
            rg=rg,
            phone=phone,
            name=name,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
            avatar_url=avatar_url,
            address_street=address_street,
            address_number=address_number,
            address_complement=address_complement,
            address_neighborhood=address_neighborhood,
            address_city=address_city,
            address_state=address_state,
            address_zip_code=address_zip_code,
            cnpj=cnpj,
            store_type=store_type,
            business_model=business_model,
            units_count=units_count,
            erp_system=erp_system,
            instagram=instagram,
            monthly_revenue=monthly_revenue,
            birth_date=birth_date,
            registration_link_id=registration_link_id,
        )

        await self._insert_user_to_db(user)
        return user

    def create_access_token(self, user: User) -> str:
        """Create an access token for a user.

        Args:
            user: User to create token for

        Returns:
            JWT access token string
        """
        payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }
        return create_access_token(payload)

    async def _insert_user_to_db(self, user: User) -> None:
        """Insert user into database."""
        await self.session.aexecute(
            self._insert_user,
            [
                user.id,
                user.email,
                user.cpf,
                user.rg,
                user.phone,
                user.name,
                user.password_hash,
                user.role,
                user.is_active,
                user.avatar_url,
                user.address_street,
                user.address_number,
                user.address_complement,
                user.address_neighborhood,
                user.address_city,
                user.address_state,
                user.address_zip_code,
                user.created_at,
                user.updated_at,
                # Company fields
                user.cnpj,
                user.store_type,
                user.business_model,
                user.units_count,
                user.erp_system,
                user.instagram,
                user.monthly_revenue,
                user.birth_date,
                user.registration_link_id,
            ],
        )

    async def authenticate_user(self, email: str, password: str) -> User:
        """Authenticate user with email and password.

        Args:
            email: User email
            password: Plain text password

        Returns:
            Authenticated User instance

        Raises:
            InvalidCredentialsError: If email or password is wrong
            UserInactiveError: If user account is inactive
        """
        user = await self.get_user_by_email(email)
        if not user:
            raise InvalidCredentialsError

        is_valid, new_hash = verify_password(password, user.password_hash)
        if not is_valid:
            raise InvalidCredentialsError

        if not user.is_active:
            raise UserInactiveError

        # Update hash if needed (algorithm params changed)
        if new_hash:
            await self.session.aexecute(
                self._update_user_password,
                [new_hash, datetime.now(UTC), user.id],
            )
            user.password_hash = new_hash

        return user

    async def update_user_profile(
        self,
        user_id: UUID,
        name: str | None = None,
        phone: str | None = None,
        avatar_url: str | None = None,
    ) -> User:
        """Update user profile fields.

        Args:
            user_id: User ID
            name: New name (optional)
            phone: New phone (optional)
            avatar_url: New avatar URL (optional)

        Returns:
            Updated User instance

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        # Update fields if provided
        if name is not None:
            user.name = name
        if phone is not None:
            user.phone = phone
        if avatar_url is not None:
            user.avatar_url = avatar_url

        user.updated_at = datetime.now(UTC)

        await self.session.aexecute(
            self._update_user,
            [user.name, user.phone, user.avatar_url, user.updated_at, user.id],
        )

        return user

    async def change_password(
        self,
        user_id: UUID,
        current_password: str,
        new_password: str,
    ) -> None:
        """Change user password.

        Args:
            user_id: User ID
            current_password: Current password for verification
            new_password: New password

        Raises:
            UserNotFoundError: If user doesn't exist
            InvalidCredentialsError: If current password is wrong
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        is_valid, _ = verify_password(current_password, user.password_hash)
        if not is_valid:
            raise InvalidCredentialsError("Senha atual incorreta")

        new_hash = hash_password(new_password)
        await self.session.aexecute(
            self._update_user_password,
            [new_hash, datetime.now(UTC), user.id],
        )

    async def reset_password(self, user_id: UUID, new_password: str) -> None:
        """Reset user password (for password recovery).

        Unlike change_password, this doesn't require the current password.
        Use only after verifying user identity through verification code.

        Args:
            user_id: User ID
            new_password: New password

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        new_hash = hash_password(new_password)
        await self.session.aexecute(
            self._update_user_password,
            [new_hash, datetime.now(UTC), user.id],
        )

    async def update_user_email(self, user_id: UUID, new_email: str) -> User:
        """Update user email address.

        Use only after verifying the new email through verification code.

        Args:
            user_id: User ID
            new_email: New email address

        Returns:
            Updated User instance

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        user.email = new_email.lower()
        user.updated_at = datetime.now(UTC)

        await self.session.aexecute(
            self._update_user_email,
            [user.email, user.updated_at, user.id],
        )

        return user

    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify a password against a hash.

        Wrapper around security.verify_password for external use.

        Args:
            password: Plain text password
            password_hash: Stored password hash

        Returns:
            True if password matches
        """
        is_valid, _ = verify_password(password, password_hash)
        return is_valid

    async def update_user_role(self, user_id: UUID, new_role: UserRole) -> User:
        """Update user role (admin only).

        Args:
            user_id: User ID
            new_role: New role to assign

        Returns:
            Updated User instance

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        user.role = new_role.value
        user.updated_at = datetime.now(UTC)

        await self.session.aexecute(
            self._update_user_role,
            [user.role, user.updated_at, user.id],
        )

        return user

    async def deactivate_user(self, user_id: UUID) -> None:
        """Deactivate user account.

        Args:
            user_id: User ID

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        await self.session.aexecute(
            self._deactivate_user,
            [False, datetime.now(UTC), user_id],
        )

    async def update_user_max_sessions(
        self,
        user_id: UUID,
        max_sessions: int | None,
    ) -> User:
        """Update user's max concurrent sessions limit (admin only).

        Args:
            user_id: User ID
            max_sessions: New max sessions limit (None = use default)

        Returns:
            Updated User instance

        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError

        user.max_concurrent_sessions = max_sessions
        user.updated_at = datetime.now(UTC)

        await self.session.aexecute(
            self._update_user_max_sessions,
            [max_sessions, user.updated_at, user_id],
        )

        return user

    # ==========================================================================
    # Session Management
    # ==========================================================================

    async def count_active_sessions(self, user_id: UUID) -> int:
        """Count active (non-revoked, non-expired) sessions for a user.

        Args:
            user_id: User ID

        Returns:
            Number of active sessions
        """
        rows = await self.session.aexecute(self._get_tokens_by_user, [user_id])
        now = datetime.now(UTC)
        count = 0

        for row in rows:
            token = RefreshTokenByUser.from_row(row)
            # Check if not revoked and not expired
            if not token.revoked:
                expires_at = token.expires_at
                if expires_at and expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=UTC)
                if expires_at and expires_at > now:
                    count += 1

        return count

    def get_user_max_sessions(self, user: User) -> int:
        """Get max concurrent sessions limit for a user.

        Uses user-specific limit if set, otherwise uses default from settings.

        Args:
            user: User instance

        Returns:
            Max sessions limit
        """
        if user.max_concurrent_sessions is not None:
            return user.max_concurrent_sessions
        return get_settings().auth_default_max_concurrent_sessions

    async def check_session_limit(self, user: User) -> None:
        """Check if user can create a new session.

        Args:
            user: User instance

        Raises:
            SessionLimitExceededError: If limit is exceeded
        """
        max_sessions = self.get_user_max_sessions(user)
        current_sessions = await self.count_active_sessions(user.id)

        if current_sessions >= max_sessions:
            raise SessionLimitExceededError(
                current_sessions=current_sessions,
                max_sessions=max_sessions,
            )

    async def get_session_access_times(
        self, user_id: UUID
    ) -> tuple[datetime | None, datetime | None]:
        """Get first and last access times for a user based on refresh tokens.

        Args:
            user_id: User ID

        Returns:
            Tuple of (first_access, last_access) datetimes
        """
        rows = await self.session.aexecute(self._get_tokens_by_user, [user_id])
        first_access: datetime | None = None
        last_access: datetime | None = None

        for row in rows:
            token = RefreshTokenByUser.from_row(row)
            created_at = token.created_at
            if created_at and created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=UTC)

            if created_at:
                if first_access is None or created_at < first_access:
                    first_access = created_at
                if last_access is None or created_at > last_access:
                    last_access = created_at

        return first_access, last_access

    # ==========================================================================
    # Token Operations
    # ==========================================================================

    async def create_tokens(
        self,
        user: User,
        user_agent: str | None = None,
        ip_address: str | None = None,
        check_session_limit: bool = True,
    ) -> tuple[str, str]:
        """Create access and refresh tokens for user.

        Args:
            user: Authenticated user
            user_agent: Client user agent (for audit)
            ip_address: Client IP (for audit)
            check_session_limit: Whether to check session limit (default True)

        Returns:
            Tuple of (access_token, refresh_token)

        Raises:
            SessionLimitExceededError: If session limit is exceeded
        """
        # Check session limit before creating new token
        if check_session_limit:
            await self.check_session_limit(user)

        settings = get_settings()

        # Token payload
        payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }

        # Create access token
        access_token = create_access_token(payload)

        # Create refresh token (returns token and jti)
        refresh_token, jti = create_refresh_token(payload)

        # Calculate expiration
        expires_at = datetime.now(UTC) + timedelta(
            days=settings.auth_refresh_token_expire_days
        )

        # Store refresh token in database (dual-write pattern)
        now = datetime.now(UTC)

        # Main table (query by jti)
        await self.session.aexecute(
            self._insert_token,
            [
                UUID(jti),
                user.id,
                expires_at,
                False,  # revoked
                None,  # revoked_at
                now,
                user_agent,
                ip_address,
            ],
        )

        # Lookup table (query by user_id)
        await self.session.aexecute(
            self._insert_token_by_user,
            [user.id, UUID(jti), expires_at, False, now],
        )

        return access_token, refresh_token

    async def refresh_tokens(
        self,
        refresh_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[str, str]:
        """Refresh access token using refresh token.

        Implements token rotation: old token is revoked, new one created.

        Args:
            refresh_token: Current refresh token
            user_agent: Client user agent
            ip_address: Client IP

        Returns:
            Tuple of (new_access_token, new_refresh_token)

        Raises:
            InvalidTokenError: If token is invalid or revoked
            UserInactiveError: If user is inactive
        """
        # Decode and validate token
        try:
            payload = decode_refresh_token(refresh_token)
        except Exception as e:
            raise InvalidTokenError from e

        jti = UUID(payload["jti"])
        user_id = UUID(payload["sub"])

        # Check token in database
        result = await self.session.aexecute(self._get_token_by_jti, [jti])
        row = result[0] if result else None
        if not row:
            raise InvalidTokenError

        stored_token = RefreshToken.from_row(row)
        if not stored_token.is_valid():
            raise InvalidTokenError

        # Revoke old token (rotation)
        now = datetime.now(UTC)
        await self.session.aexecute(self._revoke_token, [now, jti])
        await self.session.aexecute(self._revoke_token_by_user, [user_id, jti])

        # Get user and verify active
        user = await self.get_user_by_id(user_id)
        if not user:
            raise InvalidTokenError
        if not user.is_active:
            raise UserInactiveError

        # Create new tokens (skip session limit check - this is a token rotation, not a new session)
        return await self.create_tokens(
            user, user_agent, ip_address, check_session_limit=False
        )

    async def revoke_token(self, refresh_token: str) -> None:
        """Revoke a specific refresh token.

        Args:
            refresh_token: Token to revoke

        Raises:
            InvalidTokenError: If token is invalid
        """
        try:
            payload = decode_refresh_token(refresh_token)
        except Exception as e:
            raise InvalidTokenError from e

        jti = UUID(payload["jti"])
        user_id = UUID(payload["sub"])

        now = datetime.now(UTC)
        await self.session.aexecute(self._revoke_token, [now, jti])
        await self.session.aexecute(self._revoke_token_by_user, [user_id, jti])

    async def revoke_all_user_tokens(self, user_id: UUID) -> int:
        """Revoke all refresh tokens for a user (logout from all devices).

        Args:
            user_id: User ID

        Returns:
            Number of tokens revoked
        """
        rows = await self.session.aexecute(self._get_tokens_by_user, [user_id])
        count = 0
        now = datetime.now(UTC)

        for row in rows:
            token = RefreshTokenByUser.from_row(row)
            if not token.revoked:
                await self.session.aexecute(self._revoke_token, [now, token.jti])
                await self.session.aexecute(
                    self._revoke_token_by_user, [user_id, token.jti]
                )
                count += 1

        return count

    async def get_token_by_jti(self, jti: UUID) -> RefreshToken | None:
        """Get refresh token by JTI."""
        result = await self.session.aexecute(self._get_token_by_jti, [jti])
        row = result[0] if result else None
        return RefreshToken.from_row(row) if row else None

    # ==========================================================================
    # Validation Operations
    # ==========================================================================

    async def is_email_available(self, email: str) -> bool:
        """Check if email is available for registration."""
        return await self.get_user_by_email(email) is None

    async def is_cpf_available(self, cpf: str) -> bool:
        """Check if CPF is available for registration."""
        return await self.get_user_by_cpf(cpf) is None

    async def list_active_users(self) -> list[User]:
        """List all active users for admin operations.

        Note: Uses ALLOW FILTERING which is OK for admin-only, low-frequency operations.
        For high-frequency queries, consider a materialized view or secondary table.

        Returns:
            List of active User instances
        """
        # Direct query with ALLOW FILTERING (safe for admin use)
        rows = await self.session.aexecute(
            f"SELECT * FROM {self.keyspace}.users WHERE is_active = true ALLOW FILTERING"
        )
        return [User.from_row(row) for row in rows]

    async def list_users_by_role(self, role: UserRole) -> list[User]:
        """List all active users with specific role.

        Args:
            role: Role to filter by

        Returns:
            List of User instances with the specified role
        """
        rows = await self.session.aexecute(self._list_users_by_role, [role.value])
        return [User.from_row(row) for row in rows]

    async def search_users(
        self,
        search: str | None = None,
        role: UserRole | None = None,
        limit: int = 50,
    ) -> list[User]:
        """Search users by email/name/cpf/rg/phone and optionally filter by role.

        Args:
            search: Search term (matches email, name, cpf, rg or phone - case-insensitive, partial match)
            role: Optional role filter
            limit: Max results to return

        Returns:
            List of matching User instances
        """
        # Get base list filtered by role if specified
        if role:
            users = await self.list_users_by_role(role)
        else:
            users = await self.list_active_users()

        # Apply search filter in memory (Cassandra doesn't support LIKE efficiently)
        if search:
            search_lower = search.lower()
            users = [
                u
                for u in users
                if (
                    search_lower in u.email.lower()
                    or (u.name and search_lower in u.name.lower())
                    or (u.cpf and search_lower in u.cpf.lower())
                    or (u.rg and search_lower in u.rg.lower())
                    or (u.phone and search_lower in u.phone.lower())
                )
            ]

        return users[:limit]

    def to_response(self, user: User) -> UserResponse:
        """Convert User model to UserResponse schema."""
        return UserResponse.from_user(user)
