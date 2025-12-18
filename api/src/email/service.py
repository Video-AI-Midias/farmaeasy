"""Email service using Gmail API with Service Account.

Uses domain-wide delegation to send emails on behalf of a Google Workspace user.
The service account must have domain-wide delegation enabled in Google Admin Console.

Required Google Admin Console setup:
1. Go to Security > Access and data control > API controls > Domain-wide delegation
2. Add the service account client_id with scope: https://www.googleapis.com/auth/gmail.send
"""

import base64
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import TYPE_CHECKING

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from src.core.logging import get_logger

from .schemas import (
    EmailAttachment,
    EmailRecipient,
    SendEmailRequest,
    SendEmailResponse,
)


if TYPE_CHECKING:
    from googleapiclient._apis.gmail.v1 import GmailResource


logger = get_logger(__name__)

# Gmail API scope for sending emails
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


class EmailService:
    """Service for sending emails via Gmail API.

    Uses a service account with domain-wide delegation to impersonate
    a Google Workspace user (e.g., contato@farmaeasy.com.br).
    """

    def __init__(
        self,
        credentials_path: str,
        sender_address: str,
        sender_name: str = "FarmaEasy",
    ):
        """Initialize Gmail API service.

        Args:
            credentials_path: Path to service account JSON file
            sender_address: Email address to send from (must be in Google Workspace)
            sender_name: Display name for sender
        """
        self.credentials_path = credentials_path
        self.sender_address = sender_address
        self.sender_name = sender_name
        self._service: GmailResource | None = None

        # Validate credentials file exists
        if not Path(credentials_path).exists():
            logger.warning(
                "email_credentials_not_found",
                path=credentials_path,
                message="Gmail API will not be available",
            )

    def _get_service(self) -> "GmailResource":
        """Get or create Gmail API service.

        Uses lazy initialization to avoid issues during app startup.
        Creates credentials with domain-wide delegation to impersonate sender.

        Returns:
            Gmail API service resource

        Raises:
            FileNotFoundError: If credentials file doesn't exist
            ValueError: If credentials are invalid
        """
        if self._service is not None:
            return self._service

        credentials_file = Path(self.credentials_path)
        if not credentials_file.exists():
            msg = f"Credentials file not found: {self.credentials_path}"
            raise FileNotFoundError(msg)

        try:
            # Load service account credentials
            credentials = service_account.Credentials.from_service_account_file(
                str(credentials_file),
                scopes=GMAIL_SCOPES,
            )

            # Use domain-wide delegation to impersonate the sender
            delegated_credentials = credentials.with_subject(self.sender_address)

            # Build Gmail API service
            self._service = build(
                "gmail",
                "v1",
                credentials=delegated_credentials,
                cache_discovery=False,
            )

            logger.info(
                "gmail_service_initialized",
                sender=self.sender_address,
            )

            return self._service

        except Exception as e:
            logger.exception(
                "gmail_service_init_failed",
                error=str(e),
                credentials_path=self.credentials_path,
            )
            raise

    def _format_address(self, recipient: EmailRecipient) -> str:
        """Format email address with optional display name.

        Args:
            recipient: Email recipient

        Returns:
            Formatted address string (e.g., "John Doe <john@example.com>")
        """
        if recipient.name:
            return f"{recipient.name} <{recipient.email}>"
        return recipient.email

    def _create_message(self, request: SendEmailRequest) -> dict:
        """Create email message in Gmail API format.

        Args:
            request: Email request with recipients, subject, body, etc.

        Returns:
            Dict with 'raw' key containing base64url encoded message
        """
        # Create multipart message for HTML + text + attachments
        if request.attachments:
            message = MIMEMultipart("mixed")
            body_part = MIMEMultipart("alternative")
        else:
            message = MIMEMultipart("alternative")
            body_part = message

        # Headers
        message["From"] = f"{self.sender_name} <{self.sender_address}>"
        message["To"] = ", ".join(self._format_address(r) for r in request.to)
        message["Subject"] = request.subject

        if request.cc:
            message["Cc"] = ", ".join(self._format_address(r) for r in request.cc)

        if request.bcc:
            message["Bcc"] = ", ".join(self._format_address(r) for r in request.bcc)

        if request.reply_to:
            message["Reply-To"] = request.reply_to

        # Body - plain text first, then HTML (email clients prefer last)
        if request.body_text:
            body_part.attach(MIMEText(request.body_text, "plain", "utf-8"))

        body_part.attach(MIMEText(request.body_html, "html", "utf-8"))

        # Attach body to message if using mixed multipart
        if request.attachments:
            message.attach(body_part)

            # Add attachments
            for attachment in request.attachments:
                self._add_attachment(message, attachment)

        # Encode message
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        return {"raw": raw_message}

    def _add_attachment(
        self, message: MIMEMultipart, attachment: EmailAttachment
    ) -> None:
        """Add attachment to email message.

        Args:
            message: MIME multipart message
            attachment: Attachment data
        """
        # Decode base64 content
        try:
            content = base64.b64decode(attachment.content)
        except Exception:
            logger.warning(
                "attachment_decode_failed",
                filename=attachment.filename,
            )
            return

        # Create attachment part
        maintype, subtype = attachment.mime_type.split("/", 1)
        part = MIMEBase(maintype, subtype)
        part.set_payload(content)

        # Encode in base64 for email transport
        encoders.encode_base64(part)

        # Add header
        part.add_header(
            "Content-Disposition",
            "attachment",
            filename=attachment.filename,
        )

        message.attach(part)

    async def send_email(self, request: SendEmailRequest) -> SendEmailResponse:
        """Send an email via Gmail API.

        Args:
            request: Email request with all details

        Returns:
            SendEmailResponse with success status and message ID
        """
        try:
            service = self._get_service()
            message = self._create_message(request)

            # Send email using "me" as userId (refers to authenticated user)
            result = (
                service.users().messages().send(userId="me", body=message).execute()
            )

            logger.info(
                "email_sent",
                message_id=result.get("id"),
                thread_id=result.get("threadId"),
                to=[r.email for r in request.to],
                subject=request.subject[:50],
            )

            return SendEmailResponse(
                success=True,
                message_id=result.get("id"),
                thread_id=result.get("threadId"),
            )

        except HttpError as e:
            error_message = str(e)
            logger.exception(
                "email_send_failed",
                error=error_message,
                to=[r.email for r in request.to],
                subject=request.subject[:50],
            )

            return SendEmailResponse(
                success=False,
                error=f"Gmail API error: {error_message}",
            )

        except FileNotFoundError as e:
            logger.error("email_credentials_missing", error=str(e))
            return SendEmailResponse(
                success=False,
                error="Email service not configured: credentials file missing",
            )

        except Exception as e:
            logger.exception(
                "email_send_unexpected_error",
                error=str(e),
            )
            return SendEmailResponse(
                success=False,
                error=f"Unexpected error: {e!s}",
            )

    async def send_simple_email(
        self,
        to: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        to_name: str | None = None,
    ) -> SendEmailResponse:
        """Send a simple email (convenience method).

        Args:
            to: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_text: Plain text body (optional)
            to_name: Recipient name (optional)

        Returns:
            SendEmailResponse with success status
        """
        request = SendEmailRequest(
            to=[EmailRecipient(email=to, name=to_name)],
            subject=subject,
            body_html=body_html,
            body_text=body_text,
        )
        return await self.send_email(request)

    async def send_welcome_email(
        self,
        to: str,
        user_name: str,
    ) -> SendEmailResponse:
        """Send welcome email to new user.

        Args:
            to: User email address
            user_name: User's display name

        Returns:
            SendEmailResponse with success status
        """
        subject = "Bem-vindo ao FarmaEasy!"
        body_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f9fafb; }}
                .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Bem-vindo ao FarmaEasy!</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{user_name}</strong>!</p>
                    <p>Sua conta foi criada com sucesso. Estamos felizes em tê-lo conosco!</p>
                    <p>Agora você pode acessar todos os nossos cursos e recursos.</p>
                    <p>Se tiver alguma dúvida, não hesite em entrar em contato.</p>
                    <p>Atenciosamente,<br>Equipe FarmaEasy</p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 FarmaEasy. Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """
        body_text = f"""
Olá, {user_name}!

Sua conta foi criada com sucesso. Estamos felizes em tê-lo conosco!

Agora você pode acessar todos os nossos cursos e recursos.

Se tiver alguma dúvida, não hesite em entrar em contato.

Atenciosamente,
Equipe FarmaEasy
        """

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )

    async def send_password_reset_email(
        self,
        to: str,
        user_name: str,
        reset_link: str,
    ) -> SendEmailResponse:
        """Send password reset email.

        Args:
            to: User email address
            user_name: User's display name
            reset_link: Password reset URL

        Returns:
            SendEmailResponse with success status
        """
        subject = "Redefinição de Senha - FarmaEasy"
        body_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background-color: #f9fafb; }}
                .button {{ display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #666; }}
                .warning {{ background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin: 15px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Redefinição de Senha</h1>
                </div>
                <div class="content">
                    <p>Olá, <strong>{user_name}</strong>!</p>
                    <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                    <p style="text-align: center;">
                        <a href="{reset_link}" class="button">Redefinir Senha</a>
                    </p>
                    <div class="warning">
                        <strong>Importante:</strong> Este link expira em 1 hora.
                        Se você não solicitou esta redefinição, ignore este email.
                    </div>
                    <p>Atenciosamente,<br>Equipe FarmaEasy</p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 FarmaEasy. Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        """
        body_text = f"""
Olá, {user_name}!

Recebemos uma solicitação para redefinir a senha da sua conta.

Acesse o link abaixo para criar uma nova senha:
{reset_link}

IMPORTANTE: Este link expira em 1 hora.
Se você não solicitou esta redefinição, ignore este email.

Atenciosamente,
Equipe FarmaEasy
        """

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )

    async def send_password_reset_code(
        self,
        to: str,
        user_name: str,
        code: str,
    ) -> SendEmailResponse:
        """Send password reset verification code email.

        Args:
            to: User email address
            user_name: User's display name
            code: 6-digit verification code

        Returns:
            SendEmailResponse with success status
        """
        from src.email.templates import render_password_reset_code

        subject = "Código de Recuperação de Senha - FarmaEasy"
        body_html, body_text = render_password_reset_code(user_name, code)

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )

    async def send_password_changed_notification(
        self,
        to: str,
        user_name: str,
    ) -> SendEmailResponse:
        """Send password changed notification email.

        Args:
            to: User email address
            user_name: User's display name

        Returns:
            SendEmailResponse with success status
        """
        from src.email.templates import render_password_changed

        subject = "Sua Senha Foi Alterada - FarmaEasy"
        body_html, body_text = render_password_changed(user_name)

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )

    async def send_email_change_code(
        self,
        to: str,
        user_name: str,
        code: str,
    ) -> SendEmailResponse:
        """Send email change verification code email.

        Args:
            to: New email address (where code is sent)
            user_name: User's display name
            code: 6-digit verification code

        Returns:
            SendEmailResponse with success status
        """
        from src.email.templates import render_email_change_code

        subject = "Confirme seu Novo Email - FarmaEasy"
        body_html, body_text = render_email_change_code(user_name, code)

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )

    async def send_email_changed_notification(
        self,
        to: str,
        user_name: str,
        new_email: str,
        is_new_email: bool = False,
    ) -> SendEmailResponse:
        """Send email changed notification.

        Args:
            to: Email address to send notification to
            user_name: User's display name
            new_email: The new email address
            is_new_email: True if sending to new email, False if sending to old email

        Returns:
            SendEmailResponse with success status
        """
        from src.email.templates import render_email_changed

        subject = "Seu Email Foi Alterado - FarmaEasy"
        body_html, body_text = render_email_changed(user_name, new_email, is_new_email)

        return await self.send_simple_email(
            to=to,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
            to_name=user_name,
        )
