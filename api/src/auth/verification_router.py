"""Verification Router for Password Reset and Email Change.

Endpoints:
- POST /v1/auth/password/forgot - Request password reset code
- POST /v1/auth/password/verify-code - Verify reset code
- POST /v1/auth/password/reset - Reset password with code
- POST /v1/auth/email/request-change - Request email change (authenticated)
- POST /v1/auth/email/confirm-change - Confirm email change (authenticated)
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.auth.dependencies import get_current_user
from src.auth.models import User
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
    RequestEmailChangeRequest,
    RequestEmailChangeResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    VerifyCodeRequest,
    VerifyCodeResponse,
)
from src.core.logging import get_logger


logger = get_logger(__name__)

# Constants
MIN_LOCAL_EMAIL_LENGTH = 2

router = APIRouter(prefix="/v1/auth", tags=["verification"])

# Module-level getter for dependency injection
_verification_service_getter: Callable[[], VerificationService] | None = None


def set_verification_service_getter(getter: Callable[[], VerificationService]) -> None:
    """Set the verification service getter for dependency injection."""
    global _verification_service_getter  # noqa: PLW0603
    _verification_service_getter = getter


def get_verification_service() -> VerificationService:
    """Get the verification service instance."""
    if _verification_service_getter is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification service not available",
        )
    return _verification_service_getter()


# =============================================================================
# Password Reset Endpoints (Public)
# =============================================================================


@router.post(
    "/password/forgot",
    response_model=ForgotPasswordResponse,
    summary="Request password reset code",
    description="Sends a 6-digit verification code to the email if it exists.",
)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    verification_service: Annotated[
        VerificationService, Depends(get_verification_service)
    ],
) -> ForgotPasswordResponse:
    """Request a password reset code.

    Always returns success to avoid revealing if email exists.
    """
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        await verification_service.request_password_reset(
            email=body.email,
            ip=ip,
            user_agent=user_agent,
        )
    except RateLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        ) from e

    return ForgotPasswordResponse()


@router.post(
    "/password/verify-code",
    response_model=VerifyCodeResponse,
    summary="Verify password reset code",
    description="Validates the verification code without using it.",
)
async def verify_password_reset_code(
    body: VerifyCodeRequest,
    verification_service: Annotated[
        VerificationService, Depends(get_verification_service)
    ],
) -> VerifyCodeResponse:
    """Verify a password reset code."""
    try:
        valid = await verification_service.verify_reset_code(
            email=body.email,
            code=body.code,
        )
        return VerifyCodeResponse(valid=valid, message="Code is valid")
    except InvalidCodeError:
        return VerifyCodeResponse(valid=False, message="Invalid or expired code")
    except MaxAttemptsExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        ) from e


@router.post(
    "/password/reset",
    response_model=ResetPasswordResponse,
    summary="Reset password with code",
    description="Resets the password using the verification code.",
)
async def reset_password(
    body: ResetPasswordRequest,
    verification_service: Annotated[
        VerificationService, Depends(get_verification_service)
    ],
) -> ResetPasswordResponse:
    """Reset password using verification code."""
    try:
        await verification_service.reset_password(
            email=body.email,
            code=body.code,
            new_password=body.new_password,
        )
        return ResetPasswordResponse(
            success=True,
            message="Password reset successfully",
        )
    except InvalidCodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except MaxAttemptsExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        ) from e


# =============================================================================
# Email Change Endpoints (Authenticated)
# =============================================================================


@router.post(
    "/email/request-change",
    response_model=RequestEmailChangeResponse,
    summary="Request email change",
    description="Sends a verification code to the new email address.",
)
async def request_email_change(
    request: Request,
    body: RequestEmailChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    verification_service: Annotated[
        VerificationService, Depends(get_verification_service)
    ],
) -> RequestEmailChangeResponse:
    """Request email change (requires current password)."""
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        await verification_service.request_email_change(
            user_id=current_user.id,
            new_email=body.new_email,
            password=body.password,
            ip=ip,
            user_agent=user_agent,
        )

        # Mask email for response
        local, domain = body.new_email.split("@")
        masked = (
            f"{local[0]}***@{domain}"
            if len(local) > MIN_LOCAL_EMAIL_LENGTH
            else f"{local[0]}*@{domain}"
        )

        return RequestEmailChangeResponse(
            message="Verification code sent to new email",
            email_masked=masked,
        )
    except VerificationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except EmailNotAvailableError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e
    except RateLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        ) from e


@router.post(
    "/email/confirm-change",
    response_model=ConfirmEmailChangeResponse,
    summary="Confirm email change",
    description="Confirms the email change using the verification code.",
)
async def confirm_email_change(
    body: ConfirmEmailChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    verification_service: Annotated[
        VerificationService, Depends(get_verification_service)
    ],
) -> ConfirmEmailChangeResponse:
    """Confirm email change with verification code."""
    try:
        new_email = await verification_service.confirm_email_change(
            user_id=current_user.id,
            code=body.code,
        )
        return ConfirmEmailChangeResponse(
            success=True,
            message="Email changed successfully",
            new_email=new_email,
        )
    except InvalidCodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except MaxAttemptsExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        ) from e
    except EmailNotAvailableError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e
    except VerificationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
