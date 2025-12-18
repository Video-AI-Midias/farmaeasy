"""Verification API endpoints for password reset and email change.

Provides routes for:
- Password reset flow (forgot, verify, reset)
- Email change flow (request, confirm)
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.auth.dependencies import CurrentUser
from src.auth.validators import validate_password
from src.auth.verification import (
    EmailNotAvailableError,
    InvalidCodeError,
    MaxAttemptsExceededError,
    RateLimitExceededError,
    VerificationError,
    VerificationService,
)
from src.auth.verification_schemas import (
    ConfirmEmailChangeRequest,
    ConfirmEmailChangeResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    RateLimitResponse,
    RequestEmailChangeRequest,
    RequestEmailChangeResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
)


router = APIRouter(prefix="/v1/auth", tags=["verification"])


# ==============================================================================
# Dependency for VerificationService
# ==============================================================================

_verification_service_getter: Callable[[], VerificationService] | None = None


def set_verification_service_getter(getter: Callable[[], VerificationService]) -> None:
    """Set the verification service getter function.

    Called by main.py during app initialization.
    """
    global _verification_service_getter  # noqa: PLW0603 - Required for DI pattern
    _verification_service_getter = getter


def get_verification_service() -> VerificationService:
    """Get VerificationService instance."""
    if _verification_service_getter is None:
        raise RuntimeError(
            "VerificationService not configured - call set_verification_service_getter first"
        )
    return _verification_service_getter()


VerificationServiceDep = Annotated[VerificationService, Depends(get_verification_service)]


# ==============================================================================
# Error Handling
# ==============================================================================


def handle_verification_error(error: VerificationError) -> HTTPException:
    """Convert VerificationError to HTTPException."""
    status_map = {
        "rate_limit_exceeded": status.HTTP_429_TOO_MANY_REQUESTS,
        "invalid_code": status.HTTP_400_BAD_REQUEST,
        "max_attempts_exceeded": status.HTTP_400_BAD_REQUEST,
        "email_not_available": status.HTTP_409_CONFLICT,
        "verification_error": status.HTTP_400_BAD_REQUEST,
    }

    if isinstance(error, RateLimitExceededError):
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": True,
                "message": error.message,
                "retry_after_seconds": error.retry_after_seconds,
            },
        )

    return HTTPException(
        status_code=status_map.get(error.code, status.HTTP_400_BAD_REQUEST),
        detail=error.message,
    )


def get_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract client IP and user agent from request."""
    ip_address = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
    if ip_address and "," in ip_address:
        ip_address = ip_address.split(",")[0].strip()
    user_agent = request.headers.get("User-Agent")
    return ip_address, user_agent


# ==============================================================================
# Password Reset Endpoints (Public)
# ==============================================================================


@router.post(
    "/password/forgot",
    response_model=ForgotPasswordResponse,
    summary="Request password reset code",
    responses={
        429: {"model": RateLimitResponse, "description": "Rate limit exceeded"},
    },
)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    verification_service: VerificationServiceDep,
) -> ForgotPasswordResponse:
    """Request a password reset code.

    Sends a 6-digit code to the provided email if it exists.
    Always returns success to not reveal if email exists.
    """
    ip_address, user_agent = get_client_info(request)

    try:
        await verification_service.request_password_reset(
            email=data.email,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except RateLimitExceededError as e:
        raise handle_verification_error(e) from e

    return ForgotPasswordResponse()


@router.post(
    "/password/verify-code",
    response_model=VerifyCodeResponse,
    summary="Verify reset code",
    responses={
        400: {"description": "Invalid or expired code"},
    },
)
async def verify_reset_code(
    data: VerifyCodeRequest,
    verification_service: VerificationServiceDep,
) -> VerifyCodeResponse:
    """Verify a password reset code without using it.

    Use this to validate the code before showing the new password form.
    """
    try:
        await verification_service.verify_reset_code(
            email=data.email,
            code=data.code,
        )
        return VerifyCodeResponse(valid=True, message="Codigo valido")
    except (InvalidCodeError, MaxAttemptsExceededError) as e:
        return VerifyCodeResponse(valid=False, message=e.message)


@router.post(
    "/password/reset",
    response_model=ResetPasswordResponse,
    summary="Reset password with code",
    responses={
        400: {"description": "Invalid code or password"},
        422: {"description": "Password validation failed"},
    },
)
async def reset_password(
    data: ResetPasswordRequest,
    verification_service: VerificationServiceDep,
) -> ResetPasswordResponse:
    """Reset password using verification code.

    Validates the code and updates the password.
    Sends a notification email after success.
    """
    # Validate new password
    password_result = validate_password(data.new_password)
    if not password_result.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Senha invalida",
                "errors": password_result.errors,
            },
        )

    try:
        await verification_service.reset_password(
            email=data.email,
            code=data.code,
            new_password=data.new_password,
        )
        return ResetPasswordResponse(
            success=True,
            message="Senha alterada com sucesso",
        )
    except (InvalidCodeError, MaxAttemptsExceededError) as e:
        raise handle_verification_error(e) from e


# ==============================================================================
# Email Change Endpoints (Authenticated)
# ==============================================================================


@router.post(
    "/email/request-change",
    response_model=RequestEmailChangeResponse,
    summary="Request email change",
    responses={
        400: {"description": "Invalid password"},
        409: {"description": "Email already in use"},
        429: {"model": RateLimitResponse, "description": "Rate limit exceeded"},
    },
)
async def request_email_change(
    data: RequestEmailChangeRequest,
    request: Request,
    user: CurrentUser,
    verification_service: VerificationServiceDep,
) -> RequestEmailChangeResponse:
    """Request to change email address.

    Requires current password for verification.
    Sends a code to the NEW email address.
    """
    ip_address, user_agent = get_client_info(request)

    try:
        masked_email = await verification_service.request_email_change(
            user_id=user.id,
            new_email=data.new_email,
            password=data.password,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return RequestEmailChangeResponse(
            message="Codigo enviado para o novo email",
            email_masked=masked_email,
        )
    except (InvalidCodeError, EmailNotAvailableError, RateLimitExceededError) as e:
        raise handle_verification_error(e) from e


@router.post(
    "/email/confirm-change",
    response_model=ConfirmEmailChangeResponse,
    summary="Confirm email change",
    responses={
        400: {"description": "Invalid or expired code"},
        409: {"description": "Email no longer available"},
    },
)
async def confirm_email_change(
    data: ConfirmEmailChangeRequest,
    user: CurrentUser,
    verification_service: VerificationServiceDep,
) -> ConfirmEmailChangeResponse:
    """Confirm email change with verification code.

    After confirmation:
    - Email is updated
    - Notification sent to both old and new email
    - User should re-login
    """
    try:
        new_email = await verification_service.confirm_email_change(
            user_id=user.id,
            code=data.code,
        )
        return ConfirmEmailChangeResponse(
            success=True,
            message="Email alterado com sucesso. Faca login novamente.",
            new_email=new_email,
        )
    except (InvalidCodeError, MaxAttemptsExceededError, EmailNotAvailableError) as e:
        raise handle_verification_error(e) from e
