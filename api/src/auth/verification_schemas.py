"""Verification schemas for password reset and email change."""

from pydantic import BaseModel, EmailStr, Field


# ==============================================================================
# Password Reset Schemas
# ==============================================================================


class ForgotPasswordRequest(BaseModel):
    """Request to initiate password reset."""

    email: EmailStr = Field(..., description="Email address to send reset code")


class ForgotPasswordResponse(BaseModel):
    """Response for password reset request.

    Always returns success message to not reveal if email exists.
    """

    message: str = Field(
        default="Se o email existir, um codigo sera enviado",
        description="Generic success message",
    )


class VerifyCodeRequest(BaseModel):
    """Request to verify a reset code."""

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

    valid: bool = Field(..., description="Whether code is valid")
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
    new_password: str = Field(
        ...,
        min_length=8,
        description="New password (validated by password_validator)",
    )


class ResetPasswordResponse(BaseModel):
    """Response for password reset."""

    success: bool = Field(..., description="Whether reset was successful")
    message: str = Field(..., description="Status message")


# ==============================================================================
# Email Change Schemas
# ==============================================================================


class RequestEmailChangeRequest(BaseModel):
    """Request to initiate email change."""

    new_email: EmailStr = Field(..., description="New email address")
    password: str = Field(..., description="Current password for verification")


class RequestEmailChangeResponse(BaseModel):
    """Response for email change request."""

    message: str = Field(..., description="Status message")
    email_masked: str = Field(
        ..., description="Masked version of new email for display"
    )


class ConfirmEmailChangeRequest(BaseModel):
    """Request to confirm email change with code."""

    code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit verification code",
    )


class ConfirmEmailChangeResponse(BaseModel):
    """Response for email change confirmation."""

    success: bool = Field(..., description="Whether change was successful")
    message: str = Field(..., description="Status message")
    new_email: str | None = Field(None, description="New email if successful")


# ==============================================================================
# Rate Limit Schema
# ==============================================================================


class RateLimitResponse(BaseModel):
    """Response when rate limit is exceeded."""

    error: bool = Field(default=True)
    message: str = Field(..., description="Rate limit error message")
    retry_after_seconds: int = Field(
        ..., description="Seconds to wait before retrying"
    )
