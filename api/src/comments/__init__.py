"""Comment system module.

Provides hierarchical comment system with:
- Threaded comments (parent/child)
- Reactions (like, love, etc.)
- Reports and moderation
- Rate limiting and spam detection

Note: Router is not exported here to avoid circular imports.
Import directly from src.comments.router when needed.
"""

from .models import (
    COMMENTS_TABLES_CQL,
    Comment,
    CommentReply,
    CommentReport,
    ReactionCounts,
    ReactionType,
    ReportReason,
    ReportStatus,
)
from .service import CommentService


__all__ = [
    "COMMENTS_TABLES_CQL",
    "Comment",
    "CommentReply",
    "CommentReport",
    "CommentService",
    "ReactionCounts",
    "ReactionType",
    "ReportReason",
    "ReportStatus",
]
