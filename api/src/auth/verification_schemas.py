"""Pydantic schemas for verification operations.

Request and response models for:
- Password reset flow
- Email change flow
- Verification code validation
"""

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.auth.validators import validate_password


# ==============================================================================
# Password Reset Schemas
# ==============================================================================


class ForgotPasswordRequest(BaseModel):
    """Request to initiate password reset.

    Note: We always return success to avoid revealing if email exists.
    """

    email: EmailStr = Field(..., description="Email address")


class ForgotPasswordResponse(BaseModel):
    """Response for password reset request.

    Always returns success message to avoid revealing if email exists.
    """

    message: str = Field(
        default="Se o email estiver cadastrado, você receberá um código de verificação.",
        description="Generic success message",
    )


class VerifyCodeRequest(BaseModel):
    """Request to verify a code (without taking action)."""

    email: EmailStr = Field(..., description="Email address")
    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit verification code",
    )


class VerifyCodeResponse(BaseModel):
    """Response for code verification."""

    valid: bool = Field(..., description="Whether the code is valid")
    message: str = Field(..., description="Status message")


class ResetPasswordRequest(BaseModel):
    """Request to reset password with verification code."""

    email: EmailStr = Field(..., description="Email address")
    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit verification code",
    )
    new_password: str = Field(..., min_length=8, description="New password")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        result = validate_password(v)
        if not result.valid:
            msg = result.message or "Senha invalida"
            raise ValueError(msg)
        return v


class ResetPasswordResponse(BaseModel):
    """Response for password reset."""

    success: bool = Field(..., description="Whether password was reset")
    message: str = Field(..., description="Status message")


# ==============================================================================
# Email Change Schemas
# ==============================================================================


class RequestEmailChangeRequest(BaseModel):
    """Request to initiate email change.

    Requires current password for identity confirmation.
    """

    new_email: EmailStr = Field(..., description="New email address")
    password: str = Field(..., description="Current password for confirmation")


class RequestEmailChangeResponse(BaseModel):
    """Response for email change request."""

    message: str = Field(
        default="Um código de verificação foi enviado para o novo email.",
        description="Success message",
    )
    masked_email: str | None = Field(
        None,
        description="Masked version of new email (e.g., n***@email.com)",
    )


class ConfirmEmailChangeRequest(BaseModel):
    """Request to confirm email change with verification code."""

    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit verification code",
    )


class ConfirmEmailChangeResponse(BaseModel):
    """Response for email change confirmation."""

    success: bool = Field(..., description="Whether email was changed")
    message: str = Field(..., description="Status message")
    requires_relogin: bool = Field(
        default=True,
        description="Whether user needs to login again",
    )


# ==============================================================================
# Rate Limit Response
# ==============================================================================


class RateLimitResponse(BaseModel):
    """Response when rate limit is exceeded."""

    error: bool = Field(default=True, description="Error flag")
    message: str = Field(..., description="Error message")
    retry_after_minutes: int = Field(
        ...,
        description="Minutes until retry is allowed",
    )
