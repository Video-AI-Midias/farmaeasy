"""Attachments module for course materials management.

Provides file attachments for courses, modules, and lessons with:
- Firebase Storage integration for file uploads
- Download tracking for analytics
- Hierarchical material aggregation
"""

from src.attachments.models import (
    ATTACHMENTS_TABLES_CQL,
    Attachment,
    AttachmentDownload,
    AttachmentType,
)
from src.attachments.router import router
from src.attachments.schemas import (
    AttachmentListResponse,
    AttachmentResponse,
    CreateAttachmentRequest,
    UpdateAttachmentRequest,
)
from src.attachments.service import AttachmentsService


__all__ = [
    "ATTACHMENTS_TABLES_CQL",
    "Attachment",
    "AttachmentDownload",
    "AttachmentListResponse",
    "AttachmentResponse",
    "AttachmentType",
    "AttachmentsService",
    "CreateAttachmentRequest",
    "UpdateAttachmentRequest",
    "router",
]
