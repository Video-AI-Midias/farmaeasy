"""Email module for sending emails via Gmail API."""

from .schemas import (
    EmailAttachment,
    EmailRecipient,
    SendEmailRequest,
    SendEmailResponse,
)
from .service import EmailService


__all__ = [
    "EmailAttachment",
    "EmailRecipient",
    "EmailService",
    "SendEmailRequest",
    "SendEmailResponse",
]
