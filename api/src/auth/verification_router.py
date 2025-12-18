"""REST endpoints for verification operations.

Provides endpoints for:
- Password reset flow (public)
- Email change flow (authenticated)
"""

from typing import Annotated, Callable

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.auth.dependencies import get_current_user
from src.auth.models import User
from src.auth.service import AuthService
from src.auth.verification import (
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
from src.core.logging import get_logger


logger = get_logger(__name__)


# ==============================================================================
# Router Setup
# ==============================================================================

router = APIRouter(prefix="/v1/auth", tags=["verification"])


# ==============================================================================
# Dependency Injection Setup
# ==============================================================================

_verification_service_getter: Callable[[], VerificationService] | None = None
_auth_service_getter: Callable[[], AuthService] | None = None


def set_verification_service_getter(getter: Callable[[], VerificationService]) -> None:
    """Set the function that provides VerificationService instances."""
    global _verification_service_getter
    _verification_service_getter = getter


def set_auth_service_getter(getter: Callable[[], AuthService]) -> None:
    """Set the function that provides AuthService instances."""
    global _auth_service_getter
    _auth_service_getter = getter


def get_verification_service() -> VerificationService:
    """Get VerificationService instance."""
    if _verification_service_getter is None:
        msg = "VerificationService not configured"
        raise RuntimeError(msg)
    return _verification_service_getter()


def get_auth_service() -> AuthService:
    """Get AuthService instance."""
    if _auth_service_getter is None:
        msg = "AuthService not configured"
        raise RuntimeError(msg)
    return _auth_service_getter()


# ==============================================================================
# Helper Functions
# ==============================================================================


def get_client_ip(request: Request) -> str | None:
    """Extract client IP from request headers or connection."""
    # Check X-Forwarded-For header (for proxies/load balancers)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP header (nginx)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip

    # Fall back to direct connection
    if request.client:
        return request.client.host

    return None


def get_user_agent(request: Request) -> str | None:
    """Extract user agent from request headers."""
    return request.headers.get("user-agent")


# ==============================================================================
# Password Reset Endpoints (Public)
# ==============================================================================


@router.post(
    "/password/forgot",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Request password reset code",
    description="Send a verification code to the email address for password reset. "
    "Always returns success to avoid revealing if email exists.",
)
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    verification_service: Annotated[VerificationService, Depends(get_verification_service)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> ForgotPasswordResponse:
    """Request a password reset code.

    Security: Always returns success to prevent email enumeration.
    """
    try:
        await verification_service.request_password_reset(
            email=data.email,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
            auth_service=auth_service,
        )
    except RateLimitExceededError as e:
        # Return rate limit response instead of generic success
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": True,
                "message": e.message,
                "retry_after_minutes": e.retry_after_minutes,
            },
        ) from e
    except Exception as e:
        # Log but don't reveal errors to user
        logger.exception(
            "forgot_password_error",
            email=data.email[:3] + "***",
            error=str(e),
        )

    return ForgotPasswordResponse()


@router.post(
    "/password/verify-code",
    response_model=VerifyCodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify reset code",
    description="Verify if a password reset code is valid without using it.",
)
async def verify_reset_code(
    request: Request,
    data: VerifyCodeRequest,
    verification_service: Annotated[VerificationService, Depends(get_verification_service)],
) -> VerifyCodeResponse:
    """Verify a password reset code (without resetting password)."""
    try:
        is_valid = await verification_service.verify_reset_code(
            email=data.email,
            code=data.code,
            ip_address=get_client_ip(request),
        )
        return VerifyCodeResponse(valid=is_valid, message="Código válido")
    except InvalidCodeError:
        return VerifyCodeResponse(valid=False, message="Código inválido ou expirado")
    except MaxAttemptsExceededError:
        return VerifyCodeResponse(
            valid=False,
            message="Número máximo de tentativas excedido. Solicite um novo código.",
        )


@router.post(
    "/password/reset",
    response_model=ResetPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset password with code",
    description="Reset password using verification code and new password.",
)
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    verification_service: Annotated[VerificationService, Depends(get_verification_service)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> ResetPasswordResponse:
    """Reset password using verification code."""
    try:
        success = await verification_service.reset_password(
            email=data.email,
            code=data.code,
            new_password=data.new_password,
            ip_address=get_client_ip(request),
            auth_service=auth_service,
        )
        if success:
            return ResetPasswordResponse(
                success=True,
                message="Senha redefinida com sucesso! Faça login com sua nova senha.",
            )
        return ResetPasswordResponse(
            success=False,
            message="Falha ao redefinir senha. Tente novamente.",
        )
    except InvalidCodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": True, "message": e.message},
        ) from e
    except MaxAttemptsExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": True, "message": e.message},
        ) from e
    except RateLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": True,
                "message": e.message,
                "retry_after_minutes": e.retry_after_minutes,
            },
        ) from e


# ==============================================================================
# Email Change Endpoints (Authenticated)
# ==============================================================================


@router.post(
    "/email/request-change",
    response_model=RequestEmailChangeResponse,
    status_code=status.HTTP_200_OK,
    summary="Request email change",
    description="Request to change email address. Requires current password. "
    "A verification code will be sent to the new email.",
)
async def request_email_change(
    request: Request,
    data: RequestEmailChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    verification_service: Annotated[VerificationService, Depends(get_verification_service)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> RequestEmailChangeResponse:
    """Request an email change (authenticated)."""
    try:
        masked_email = await verification_service.request_email_change(
            user_id=current_user.id,
            current_email=current_user.email,
            new_email=data.new_email,
            password=data.password,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
            auth_service=auth_service,
        )
        return RequestEmailChangeResponse(
            message="Um código de verificação foi enviado para o novo email.",
            masked_email=masked_email,
        )
    except VerificationError as e:
        if e.code == "invalid_password":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": True, "message": "Senha incorreta"},
            ) from e
        if e.code == "email_taken":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": True, "message": "Este email já está em uso"},
            ) from e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": True, "message": e.message},
        ) from e
    except RateLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": True,
                "message": e.message,
                "retry_after_minutes": e.retry_after_minutes,
            },
        ) from e


@router.post(
    "/email/confirm-change",
    response_model=ConfirmEmailChangeResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm email change",
    description="Confirm email change using verification code sent to new email.",
)
async def confirm_email_change(
    request: Request,
    data: ConfirmEmailChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    verification_service: Annotated[VerificationService, Depends(get_verification_service)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> ConfirmEmailChangeResponse:
    """Confirm email change with verification code (authenticated)."""
    try:
        new_email = await verification_service.confirm_email_change(
            user_id=current_user.id,
            code=data.code,
            ip_address=get_client_ip(request),
            auth_service=auth_service,
        )
        return ConfirmEmailChangeResponse(
            success=True,
            message=f"Email alterado para {new_email}. Por favor, faça login novamente.",
            requires_relogin=True,
        )
    except InvalidCodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": True, "message": e.message},
        ) from e
    except MaxAttemptsExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": True, "message": e.message},
        ) from e
    except RateLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": True,
                "message": e.message,
                "retry_after_minutes": e.retry_after_minutes,
            },
        ) from e
