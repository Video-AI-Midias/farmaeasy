"""Pydantic schemas for authentication.

Request and response models for:
- User registration and login
- Token responses
- User profile
- Validation endpoints
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from src.auth.permissions import UserRole
from src.auth.validators import (
    normalize_cpf,
    normalize_phone,
    validate_cpf,
    validate_password,
    validate_phone,
)


# ==============================================================================
# Request Schemas
# ==============================================================================


class RegisterRequest(BaseModel):
    """User registration request."""

    email: EmailStr = Field(..., description="Email address")
    cpf: str | None = Field(None, description="Brazilian CPF (optional)")
    name: str = Field(..., min_length=2, max_length=100, description="Full name")
    phone: str = Field(..., description="Phone number")
    password: str = Field(..., min_length=8, description="Password")

    @field_validator("cpf")
    @classmethod
    def validate_cpf_format(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        result = validate_cpf(v)
        if not result.valid:
            msg = result.message or "CPF invalido"
            raise ValueError(msg)
        return normalize_cpf(v)

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str) -> str:
        result = validate_phone(v)
        if not result.valid:
            msg = result.message or "Telefone invalido"
            raise ValueError(msg)
        return normalize_phone(v)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        result = validate_password(v)
        if not result.valid:
            msg = result.message or "Senha invalida"
            raise ValueError(msg)
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    """User login request."""

    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., description="Password")


class RefreshTokenRequest(BaseModel):
    """Token refresh request (optional, usually from cookie)."""

    refresh_token: str | None = Field(None, description="Refresh token")


class ChangePasswordRequest(BaseModel):
    """Password change request."""

    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        result = validate_password(v)
        if not result.valid:
            msg = result.message or "Senha invalida"
            raise ValueError(msg)
        return v


class UpdateProfileRequest(BaseModel):
    """Profile update request."""

    name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = Field(None)
    avatar_url: str | None = Field(None, max_length=500)

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        result = validate_phone(v)
        if not result.valid:
            msg = result.message or "Telefone invalido"
            raise ValueError(msg)
        return normalize_phone(v)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip()


class ValidateCPFRequest(BaseModel):
    """CPF validation request."""

    cpf: str = Field(..., description="CPF to validate")


class ValidateEmailRequest(BaseModel):
    """Email availability check request."""

    email: EmailStr = Field(..., description="Email to check")


class UpdateRoleRequest(BaseModel):
    """Role update request (admin only)."""

    role: UserRole = Field(..., description="New role")


class UpdateMaxSessionsRequest(BaseModel):
    """Max concurrent sessions update request (admin only)."""

    max_concurrent_sessions: int | None = Field(
        ...,
        ge=1,
        le=100,
        description="Max concurrent sessions (1-100, or null for default)",
    )


# Brazilian CEP (ZIP code) length
CEP_LENGTH = 8


class AddressInput(BaseModel):
    """Address input schema."""

    street: str | None = Field(None, max_length=200, description="Street name")
    number: str | None = Field(None, max_length=20, description="Street number")
    complement: str | None = Field(None, max_length=100, description="Complement")
    neighborhood: str | None = Field(None, max_length=100, description="Neighborhood")
    city: str | None = Field(None, max_length=100, description="City")
    state: str | None = Field(None, max_length=2, description="State (UF)")
    zip_code: str | None = Field(None, max_length=9, description="ZIP code (CEP)")

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        return v.upper().strip()

    @field_validator("zip_code")
    @classmethod
    def validate_zip_code(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        # Remove non-digits
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) != CEP_LENGTH:
            msg = f"CEP deve ter {CEP_LENGTH} digitos"
            raise ValueError(msg)
        return f"{digits[:5]}-{digits[5:]}"


class AdminCreateUserRequest(BaseModel):
    """Admin user creation request.

    Only email and password are required.
    All other fields are optional.
    """

    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")
    role: UserRole = Field(default=UserRole.USER, description="User role")

    # Optional fields
    name: str | None = Field(
        None, min_length=2, max_length=100, description="Full name"
    )
    phone: str | None = Field(None, description="Phone number")
    cpf: str | None = Field(None, description="Brazilian CPF")
    rg: str | None = Field(None, max_length=20, description="Brazilian RG")
    avatar_url: str | None = Field(
        None, max_length=500, description="Profile picture URL"
    )
    address: AddressInput | None = Field(None, description="Address")

    @field_validator("cpf")
    @classmethod
    def validate_cpf_format(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        result = validate_cpf(v)
        if not result.valid:
            msg = result.message or "CPF invalido"
            raise ValueError(msg)
        return normalize_cpf(v)

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        result = validate_phone(v)
        if not result.valid:
            msg = result.message or "Telefone invalido"
            raise ValueError(msg)
        return normalize_phone(v)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        result = validate_password(v)
        if not result.valid:
            msg = result.message or "Senha invalida"
            raise ValueError(msg)
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip()


class CreateStudentRequest(BaseModel):
    """Teacher request to create a student.

    Simplified version of AdminCreateUserRequest.
    Role is always STUDENT (enforced).
    """

    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")

    # Optional fields
    name: str | None = Field(
        None, min_length=2, max_length=100, description="Full name"
    )
    phone: str | None = Field(None, description="Phone number")
    cpf: str | None = Field(None, description="Brazilian CPF")

    # Course access (optional)
    course_id: UUID | None = Field(
        None, description="Course ID to grant access automatically"
    )
    send_welcome_email: bool = Field(
        default=True, description="Send welcome email with credentials"
    )

    @field_validator("cpf")
    @classmethod
    def validate_cpf_format(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        result = validate_cpf(v)
        if not result.valid:
            msg = result.message or "CPF invalido"
            raise ValueError(msg)
        return normalize_cpf(v)

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        result = validate_phone(v)
        if not result.valid:
            msg = result.message or "Telefone invalido"
            raise ValueError(msg)
        return normalize_phone(v)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        result = validate_password(v)
        if not result.valid:
            msg = result.message or "Senha invalida"
            raise ValueError(msg)
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip()


class CreateStudentResponse(BaseModel):
    """Response for student creation.

    Includes user data and optional course access info.
    """

    user: "UserResponse"
    course_access_granted: bool = False
    acquisition_id: UUID | None = None
    welcome_email_sent: bool = False


# ==============================================================================
# Response Schemas
# ==============================================================================


class AddressResponse(BaseModel):
    """Address response schema."""

    street: str | None = None
    number: str | None = None
    complement: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class UserResponse(BaseModel):
    """User response (public profile)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    cpf: str | None = None
    rg: str | None = None
    name: str | None = None
    phone: str | None = None
    role: str
    is_active: bool
    avatar_url: str | None = None
    address: AddressResponse | None = None
    max_concurrent_sessions: int | None = None
    created_at: datetime
    updated_at: datetime | None = None

    @classmethod
    def from_user(cls, user: "User") -> "UserResponse":  # noqa: F821
        """Create response from User model."""
        # Build address if any field is set
        address = None
        if any(
            [
                user.address_street,
                user.address_number,
                user.address_complement,
                user.address_neighborhood,
                user.address_city,
                user.address_state,
                user.address_zip_code,
            ]
        ):
            address = AddressResponse(
                street=user.address_street,
                number=user.address_number,
                complement=user.address_complement,
                neighborhood=user.address_neighborhood,
                city=user.address_city,
                state=user.address_state,
                zip_code=user.address_zip_code,
            )

        return cls(
            id=user.id,
            email=user.email,
            cpf=user.cpf,
            rg=user.rg,
            name=user.name,
            phone=user.phone,
            role=user.role,
            is_active=user.is_active,
            avatar_url=user.avatar_url,
            address=address,
            max_concurrent_sessions=user.max_concurrent_sessions,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )


class TokenResponse(BaseModel):
    """Access token response."""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int = Field(..., description="Token expiration in seconds")


class ValidateCPFResponse(BaseModel):
    """CPF validation response."""

    valid: bool
    formatted: str | None = None
    available: bool | None = None


class ValidateEmailResponse(BaseModel):
    """Email availability response."""

    available: bool


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


class UserListResponse(BaseModel):
    """Paginated list of users."""

    items: list[UserResponse]
    total: int


# ==============================================================================
# Extended Response Schemas (Admin)
# ==============================================================================


class LastLessonInfo(BaseModel):
    """Last accessed lesson info."""

    course_id: UUID | None = None
    module_id: UUID | None = None
    lesson_id: UUID | None = None
    last_accessed_at: datetime | None = None


class UserProgressSummary(BaseModel):
    """User progress summary across all courses."""

    total_courses_enrolled: int = 0
    total_lessons_completed: int = 0
    total_lessons_total: int = 0
    total_watch_time_seconds: int = 0
    last_lesson: LastLessonInfo | None = None


class UserSessionInfo(BaseModel):
    """User session information."""

    active_sessions: int = 0
    max_sessions: int = 10
    first_access: datetime | None = None
    last_access: datetime | None = None


class UserDetailsResponse(BaseModel):
    """Extended user details for admin panel.

    Includes session info, progress summary, and comment count.
    """

    model_config = ConfigDict(from_attributes=True)

    # Basic user info
    user: UserResponse

    # Session info
    session_info: UserSessionInfo

    # Progress info
    progress: UserProgressSummary

    # Comments count
    comments_count: int = 0


# ==============================================================================
# Internal Schemas (not exposed in API)
# ==============================================================================


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str  # User ID
    email: str
    role: str
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"
    jti: str | None = None  # Only for refresh tokens
