"""Pydantic schemas for email system.

Request/Response models for:
- Sending emails
- Email templates
- Attachments
"""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailRecipient(BaseModel):
    """Email recipient with optional name."""

    email: EmailStr = Field(..., description="Recipient email address")
    name: str | None = Field(None, description="Recipient display name")


class EmailAttachment(BaseModel):
    """Email attachment."""

    filename: str = Field(..., min_length=1, max_length=255, description="File name")
    content: str = Field(..., description="Base64 encoded file content")
    mime_type: str = Field(
        default="application/octet-stream", description="MIME type of the file"
    )


class SendEmailRequest(BaseModel):
    """Request to send an email."""

    to: list[EmailRecipient] = Field(
        ..., min_length=1, max_length=50, description="Recipients (max 50)"
    )
    subject: str = Field(..., min_length=1, max_length=998, description="Email subject")
    body_html: str = Field(..., min_length=1, description="HTML body content")
    body_text: str | None = Field(None, description="Plain text body (fallback)")
    cc: list[EmailRecipient] | None = Field(
        None, max_length=20, description="CC recipients"
    )
    bcc: list[EmailRecipient] | None = Field(
        None, max_length=20, description="BCC recipients"
    )
    reply_to: EmailStr | None = Field(None, description="Reply-to address")
    attachments: list[EmailAttachment] | None = Field(
        None, max_length=10, description="Attachments (max 10)"
    )


class SendEmailResponse(BaseModel):
    """Response after sending an email."""

    model_config = ConfigDict(from_attributes=True)

    success: bool = Field(..., description="Whether the email was sent successfully")
    message_id: str | None = Field(None, description="Gmail message ID")
    thread_id: str | None = Field(None, description="Gmail thread ID")
    error: str | None = Field(None, description="Error message if failed")


class EmailStatusResponse(BaseModel):
    """Email service status."""

    enabled: bool = Field(..., description="Whether email service is enabled")
    configured: bool = Field(..., description="Whether email service is configured")
    sender_address: str | None = Field(None, description="Configured sender address")


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str
    success: bool = True
