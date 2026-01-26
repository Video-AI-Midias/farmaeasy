"""Pydantic schemas for registration links.

Request/Response models for:
- Creating registration links
- Validating links
- Completing registration
"""

from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from .models import LinkSource, LinkStatus, RegistrationLink


# ==============================================================================
# Validation Constants
# ==============================================================================

# CPF/CNPJ
CPF_LENGTH = 11
CNPJ_LENGTH = 14
CHECKSUM_MODULO = 11
CHECKSUM_THRESHOLD = 10

# Age validation
MIN_AGE_YEARS = 18
MAX_AGE_YEARS = 130

# Password validation
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:,.<>?~`'\"\\/"
# Minimum length for email/name parts to check against password
MIN_SUBSTRING_CHECK_LENGTH = 4

# Common weak passwords to reject (lowercase for comparison)
COMMON_WEAK_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "123456",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty",
        "qwerty123",
        "abc123",
        "letmein",
        "welcome",
        "admin",
        "admin123",
        "root",
        "toor",
        "pass",
        "pass123",
        "teste",
        "teste123",
        "senha",
        "senha123",
        "mudar123",
        "trocar123",
        "farmacia",
        "farmacia123",
    }
)


# ==============================================================================
# CPF/CNPJ Validation Helpers
# ==============================================================================


def validate_cpf_checksum(cpf: str) -> bool:
    """Validate CPF checksum (Brazilian individual tax ID).

    CPF format: 11 digits where last 2 are check digits.
    Algorithm: Weighted sum modulo 11.

    Args:
        cpf: CPF string (digits only)

    Returns:
        True if valid checksum, False otherwise
    """
    # Must be 11 digits
    if len(cpf) != CPF_LENGTH or not cpf.isdigit():
        return False

    # Reject known invalid patterns (all same digits)
    if cpf == cpf[0] * CPF_LENGTH:
        return False

    # Calculate first check digit
    weights1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
    sum1 = sum(int(cpf[i]) * weights1[i] for i in range(9))
    digit1 = (sum1 * CHECKSUM_THRESHOLD) % CHECKSUM_MODULO
    if digit1 == CHECKSUM_THRESHOLD:
        digit1 = 0

    if digit1 != int(cpf[9]):
        return False

    # Calculate second check digit
    weights2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    sum2 = sum(int(cpf[i]) * weights2[i] for i in range(10))
    digit2 = (sum2 * CHECKSUM_THRESHOLD) % CHECKSUM_MODULO
    if digit2 == CHECKSUM_THRESHOLD:
        digit2 = 0

    return digit2 == int(cpf[10])


def validate_cnpj_checksum(cnpj: str) -> bool:
    """Validate CNPJ checksum (Brazilian company tax ID).

    CNPJ format: 14 digits where last 2 are check digits.
    Algorithm: Weighted sum modulo 11.

    Args:
        cnpj: CNPJ string (digits only)

    Returns:
        True if valid checksum, False otherwise
    """
    # Must be 14 digits
    if len(cnpj) != CNPJ_LENGTH or not cnpj.isdigit():
        return False

    # Reject known invalid patterns (all same digits)
    if cnpj == cnpj[0] * CNPJ_LENGTH:
        return False

    # Calculate first check digit
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    sum1 = sum(int(cnpj[i]) * weights1[i] for i in range(12))
    digit1 = CHECKSUM_MODULO - (sum1 % CHECKSUM_MODULO)
    if digit1 >= CHECKSUM_THRESHOLD:
        digit1 = 0

    if digit1 != int(cnpj[12]):
        return False

    # Calculate second check digit
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    sum2 = sum(int(cnpj[i]) * weights2[i] for i in range(13))
    digit2 = CHECKSUM_MODULO - (sum2 % CHECKSUM_MODULO)
    if digit2 >= CHECKSUM_THRESHOLD:
        digit2 = 0

    return digit2 == int(cnpj[13])


# ==============================================================================
# Enums for Registration Form
# ==============================================================================


class StoreType(str, Enum):
    """Type of pharmacy store."""

    ASSOCIADA = "associada"  # Associated with a network
    INDEPENDENTE = "independente"  # Independent store


class BusinessModel(str, Enum):
    """Business model of the pharmacy."""

    FARMACIA = "farmacia"  # Traditional pharmacy
    MANIPULACAO = "manipulacao"  # Compounding pharmacy
    ECOMMERCE = "ecommerce"  # E-commerce only


class MonthlyRevenue(str, Enum):
    """Monthly revenue ranges."""

    ATE_30K = "ate_30k"  # Up to R$ 30.000
    DE_30K_50K = "30k_50k"  # R$ 30.000 - R$ 50.000
    DE_50K_100K = "50k_100k"  # R$ 50.000 - R$ 100.000
    DE_100K_200K = "100k_200k"  # R$ 100.000 - R$ 200.000
    DE_200K_500K = "200k_500k"  # R$ 200.000 - R$ 500.000
    DE_500K_1M = "500k_1m"  # R$ 500.000 - R$ 1.000.000
    ACIMA_1M = "acima_1m"  # Above R$ 1.000.000


# ==============================================================================
# Request Schemas
# ==============================================================================


class ValidateLinkRequest(BaseModel):
    """Request to validate a registration link.

    Token is passed in the body (not URL) to prevent:
    - Logging in server access logs
    - Browser history exposure
    - Referer header leaks
    - Proxy log visibility
    """

    token: str = Field(
        ...,
        min_length=32,
        description="Registration link token (from the link URL)",
    )


class CreateRegistrationLinkRequest(BaseModel):
    """Request to create a new registration link."""

    course_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of course IDs to grant access upon registration",
    )
    expires_in_days: int = Field(
        default=7,
        ge=1,
        le=30,
        description="Days until link expires (1-30)",
    )
    prefill_phone: str | None = Field(
        default=None,
        max_length=20,
        description="Pre-fill phone number for the registration form",
    )
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Internal notes about this link",
    )
    source: LinkSource = Field(
        default=LinkSource.API,
        description="Source of the link",
    )


class CompleteRegistrationRequest(BaseModel):
    """Request to complete registration using a link.

    5 sections:
    1. Access Data (email, password, whatsapp)
    2. Responsible Data (full_name, birth_date, cpf)
    3. Company Data (cnpj, store_type, business_model, units_count, erp_system)
    4. Address (zip_code, state, city, neighborhood, street, number, complement)
    5. Digital Presence (instagram, monthly_revenue)
    """

    # Token for verification
    token: str = Field(..., min_length=32, description="Registration link token")

    # Section 1: Access Data
    email: EmailStr = Field(..., description="User email for login")
    password: str = Field(
        ...,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=MAX_PASSWORD_LENGTH,
        description=f"Password (min {MIN_PASSWORD_LENGTH} chars, requires uppercase, "
        "lowercase, digit, special character)",
    )
    confirm_password: str = Field(..., description="Password confirmation")
    whatsapp: str = Field(
        ...,
        min_length=10,
        max_length=20,
        description="WhatsApp number with DDD",
    )

    # Section 2: Responsible Data
    full_name: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description="Full name of the responsible person",
    )
    birth_date: date = Field(..., description="Birth date of the responsible person")
    cpf: str = Field(
        ...,
        min_length=11,
        max_length=14,
        description="Brazilian CPF (with or without formatting)",
    )

    # Section 3: Company Data
    cnpj: str = Field(
        ...,
        min_length=14,
        max_length=18,
        description="Brazilian CNPJ (with or without formatting)",
    )
    store_type: StoreType = Field(..., description="Type of store")
    business_model: BusinessModel = Field(..., description="Business model")
    units_count: int = Field(
        ...,
        ge=1,
        le=10000,
        description="Number of store units",
    )
    erp_system: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="ERP system name",
    )

    # Section 4: Address
    zip_code: str = Field(
        ...,
        min_length=8,
        max_length=9,
        description="CEP (with or without hyphen)",
    )
    state: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="State code (UF)",
    )
    city: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="City name",
    )
    neighborhood: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Neighborhood name",
    )
    street: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Street name",
    )
    number: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Street number",
    )
    complement: str | None = Field(
        default=None,
        max_length=100,
        description="Address complement (optional)",
    )

    # Section 5: Digital Presence
    instagram: str = Field(
        ...,
        min_length=1,
        max_length=30,
        description="Instagram handle (with or without @)",
    )
    monthly_revenue: MonthlyRevenue = Field(..., description="Monthly revenue range")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password strength.

        Checks:
        - Contains uppercase, lowercase, digit, and special character
        - Not a common weak password
        """
        # Check character requirements
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in SPECIAL_CHARACTERS for c in v)

        if not all([has_upper, has_lower, has_digit, has_special]):
            msg = (
                "A senha deve conter: letra maiúscula, letra minúscula, "
                "número e caractere especial"
            )
            raise ValueError(msg)

        # Check against common weak passwords
        if v.lower() in COMMON_WEAK_PASSWORDS:
            msg = "Esta senha é muito comum. Por favor, escolha uma senha mais segura."
            raise ValueError(msg)

        return v

    @model_validator(mode="after")
    def validate_password_context(self) -> "CompleteRegistrationRequest":
        """Validate password in context of other fields.

        Checks:
        - Password matches confirm_password
        - Password doesn't contain email
        - Password doesn't contain name parts
        """
        # Check password confirmation
        if self.password != self.confirm_password:
            msg = "As senhas não coincidem"
            raise ValueError(msg)

        # Check password doesn't contain email
        email_local = self.email.split("@")[0].lower()
        if (
            len(email_local) >= MIN_SUBSTRING_CHECK_LENGTH
            and email_local in self.password.lower()
        ):
            msg = "A senha não pode conter seu email"
            raise ValueError(msg)

        # Check password doesn't contain name parts
        name_parts = self.full_name.lower().split()
        for part in name_parts:
            if (
                len(part) >= MIN_SUBSTRING_CHECK_LENGTH
                and part in self.password.lower()
            ):
                msg = "A senha não pode conter partes do seu nome"
                raise ValueError(msg)

        return self

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        """Normalize and validate CPF with checksum verification."""
        # Normalize to digits only
        cpf = "".join(c for c in v if c.isdigit())

        # Validate length
        if len(cpf) != CPF_LENGTH:
            msg = f"CPF deve ter {CPF_LENGTH} dígitos"
            raise ValueError(msg)

        # Validate checksum
        if not validate_cpf_checksum(cpf):
            msg = "CPF inválido"
            raise ValueError(msg)

        return cpf

    @field_validator("cnpj")
    @classmethod
    def validate_cnpj(cls, v: str) -> str:
        """Normalize and validate CNPJ with checksum verification."""
        # Normalize to digits only
        cnpj = "".join(c for c in v if c.isdigit())

        # Validate length
        if len(cnpj) != CNPJ_LENGTH:
            msg = f"CNPJ deve ter {CNPJ_LENGTH} dígitos"
            raise ValueError(msg)

        # Validate checksum
        if not validate_cnpj_checksum(cnpj):
            msg = "CNPJ inválido"
            raise ValueError(msg)

        return cnpj

    @field_validator("zip_code")
    @classmethod
    def normalize_zip_code(cls, v: str) -> str:
        """Normalize CEP to digits only."""
        return "".join(c for c in v if c.isdigit())

    @field_validator("whatsapp")
    @classmethod
    def normalize_whatsapp(cls, v: str) -> str:
        """Normalize phone to digits only."""
        return "".join(c for c in v if c.isdigit())

    @field_validator("instagram")
    @classmethod
    def normalize_instagram(cls, v: str) -> str:
        """Remove @ from Instagram handle if present."""
        return v.lstrip("@")

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, v: date) -> date:
        """Validate birth date - must be 18+ years old and not in future."""
        today = date.today()

        # Check for future date
        if v > today:
            msg = "Data de nascimento não pode ser no futuro"
            raise ValueError(msg)

        # Calculate age
        age = today.year - v.year
        # Adjust if birthday hasn't occurred this year
        if (today.month, today.day) < (v.month, v.day):
            age -= 1

        # Must be at least MIN_AGE_YEARS years old
        if age < MIN_AGE_YEARS:
            msg = f"Você deve ter pelo menos {MIN_AGE_YEARS} anos para se cadastrar"
            raise ValueError(msg)

        # Reasonable upper limit (MAX_AGE_YEARS years)
        if age > MAX_AGE_YEARS:
            msg = "Data de nascimento inválida"
            raise ValueError(msg)

        return v


# ==============================================================================
# Response Schemas
# ==============================================================================


class CoursePreview(BaseModel):
    """Minimal course info for registration preview."""

    id: UUID
    title: str
    thumbnail_url: str | None = None


class RegistrationLinkResponse(BaseModel):
    """Response after creating a registration link."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shortcode: str
    status: LinkStatus
    expires_at: datetime | None
    created_at: datetime
    source: LinkSource
    notes: str | None
    prefill_phone: str | None
    course_ids: list[UUID]
    url: str = Field(description="Full URL for the registration link")

    # Usage info (only populated after use)
    user_id: UUID | None = None
    used_at: datetime | None = None

    @classmethod
    def from_link(
        cls,
        link: RegistrationLink,
        base_url: str,
        token: str | None = None,
    ) -> "RegistrationLinkResponse":
        """Create response from link entity.

        Args:
            link: The registration link entity
            base_url: Base URL for the registration page
            token: Raw token (only included when creating new link)
        """
        # Build URL with token in fragment (not query param)
        # Fragments are more secure because:
        # - They are NOT sent to the server in HTTP requests
        # - They are NOT logged in server access logs
        # - They are processed client-side only
        url = f"{base_url}/{link.shortcode}"
        if token:
            url = f"{url}#t={token}"

        return cls(
            id=link.id,
            shortcode=link.shortcode,
            status=link.status,
            expires_at=link.expires_at,
            created_at=link.created_at,
            source=link.source,
            notes=link.notes,
            prefill_phone=link.prefill_phone,
            course_ids=list(link.course_ids),
            url=url,
            user_id=link.user_id,
            used_at=link.used_at,
        )


class ValidateLinkResponse(BaseModel):
    """Response when validating a registration link."""

    valid: bool
    shortcode: str
    status: LinkStatus
    expires_at: datetime | None = None
    courses: list[CoursePreview] = Field(default_factory=list)
    prefill_phone: str | None = None
    error: str | None = None


class RegistrationLinkListResponse(BaseModel):
    """Response for listing registration links."""

    items: list[RegistrationLinkResponse]
    total: int
    has_more: bool = False


class CompleteRegistrationResponse(BaseModel):
    """Response after completing registration.

    Supports multiple scenarios:
    - New user success: success=True, existing_user=False, partial_success=False
    - Existing user: success=True, existing_user=True (course access granted)
    - Partial success: success=True, partial_success=True, failed_courses=[...]

    In partial success, the user is created and can login, but some courses
    failed to grant. The user should contact support.
    """

    success: bool = Field(description="Whether operation completed successfully")
    user_id: UUID
    email: str
    name: str
    courses_granted: list[CoursePreview]
    access_token: str = Field(description="JWT access token for immediate login")
    message: str = "Registration completed successfully"

    # Existing user scenario
    existing_user: bool = Field(
        default=False,
        description="True if user already existed and course access was granted",
    )

    # Partial success fields
    partial_success: bool = Field(
        default=False,
        description="True if registration succeeded but some courses failed to grant",
    )
    failed_courses: list[UUID] = Field(
        default_factory=list,
        description="Course IDs that failed to grant (if partial_success=True)",
    )
    warning: str | None = Field(
        default=None,
        description="Warning message for partial success scenarios",
    )
