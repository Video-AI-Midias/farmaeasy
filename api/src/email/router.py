"""Email API endpoints.

Provides endpoints for:
- Sending emails (admin only)
- Checking email service status
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from src.auth.dependencies import get_current_user, require_admin
from src.auth.models import User
from src.config import get_settings
from src.core.logging import get_logger

from .schemas import (
    EmailStatusResponse,
    SendEmailRequest,
    SendEmailResponse,
)
from .service import EmailService


logger = get_logger(__name__)

router = APIRouter(prefix="/v1/email", tags=["email"])

# Admin-only router for email operations
admin_router = APIRouter(
    prefix="/v1/admin/email",
    tags=["admin", "email"],
)


def get_email_service(request: Request) -> EmailService:
    """Get EmailService from app state."""
    if not hasattr(request.app.state, "email_service"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service not available",
        )
    return request.app.state.email_service


# ==============================================================================
# Public Endpoints
# ==============================================================================


@router.get(
    "/status",
    response_model=EmailStatusResponse,
    summary="Get email service status",
)
async def get_email_status(
    _: Annotated[User, Depends(get_current_user)],
) -> EmailStatusResponse:
    """Get email service configuration status.

    Returns whether email service is enabled and configured.
    """
    settings = get_settings()

    return EmailStatusResponse(
        enabled=settings.email_enabled,
        configured=settings.email_configured,
        sender_address=settings.email_sender_address
        if settings.email_configured
        else None,
    )


# ==============================================================================
# Admin Endpoints
# ==============================================================================


@admin_router.post(
    "/send",
    response_model=SendEmailResponse,
    summary="Send email (admin only)",
)
async def send_email(
    request: SendEmailRequest,
    _: Annotated[User, Depends(require_admin)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> SendEmailResponse:
    """Send an email via Gmail API.

    Admin only. Allows sending arbitrary emails to any recipient.

    Args:
        request: Email details (recipients, subject, body, etc.)

    Returns:
        SendEmailResponse with success status and message ID
    """
    logger.info(
        "admin_email_send_requested",
        to=[r.email for r in request.to],
        subject=request.subject[:50],
    )

    return await email_service.send_email(request)


@admin_router.post(
    "/test",
    response_model=SendEmailResponse,
    summary="Send test email (admin only)",
)
async def send_test_email(
    admin: Annotated[User, Depends(require_admin)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> SendEmailResponse:
    """Send a test email to the admin's email address.

    Useful for verifying email configuration is working.
    """
    settings = get_settings()

    logger.info(
        "admin_test_email_requested",
        to=admin.email,
    )

    return await email_service.send_simple_email(
        to=admin.email,
        subject="[TESTE] Email de teste - FarmaEasy",
        body_html=f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #10b981; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f9fafb; }}
                .success {{ background-color: #d1fae5; border-left: 4px solid #10b981; padding: 10px; margin: 15px 0; }}
                .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Email de Teste</h1>
                </div>
                <div class="content">
                    <div class="success">
                        <strong>Sucesso!</strong> O serviço de email está funcionando corretamente.
                    </div>
                    <p><strong>Configuração:</strong></p>
                    <ul>
                        <li>Remetente: {settings.email_sender_address}</li>
                        <li>Nome: {settings.email_sender_name}</li>
                        <li>Ambiente: {settings.environment}</li>
                    </ul>
                    <p>Este é um email de teste enviado pelo painel administrativo do FarmaEasy.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 FarmaEasy. Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """,
        body_text=f"""
Email de Teste - FarmaEasy

Sucesso! O serviço de email está funcionando corretamente.

Configuração:
- Remetente: {settings.email_sender_address}
- Nome: {settings.email_sender_name}
- Ambiente: {settings.environment}

Este é um email de teste enviado pelo painel administrativo do FarmaEasy.
        """,
        to_name=admin.name,
    )
