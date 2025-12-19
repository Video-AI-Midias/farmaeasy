"""Database models for hierarchical comment system.

Cassandra table definitions for:
- Comments: Main comment table with adjacency list (parent_id for threading)
- Comment reactions: User reactions to comments (like, love, etc.)
- Comment reports: User reports for moderation

Architecture: Adjacency List pattern for hierarchical comments
- parent_id references the parent comment (NULL for root comments)
- Optimized for read-heavy workloads with denormalized author info
- Soft delete with edit history tracking
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class ReactionType(str, Enum):
    """Available reaction types for comments."""

    LIKE = "like"
    LOVE = "love"
    LAUGH = "laugh"
    SAD = "sad"
    ANGRY = "angry"


class ReportReason(str, Enum):
    """Reasons for reporting a comment."""

    SPAM = "spam"
    HARASSMENT = "harassment"
    HATE_SPEECH = "hate_speech"
    MISINFORMATION = "misinformation"
    INAPPROPRIATE = "inappropriate"
    OTHER = "other"


class ReportStatus(str, Enum):
    """Report moderation status."""

    PENDING = "pending"
    REVIEWED = "reviewed"
    DISMISSED = "dismissed"
    ACTION_TAKEN = "action_taken"


class ModeratorAction(str, Enum):
    """Types of moderator actions for audit logging."""

    BLOCK_USER = "block_user"
    UNBLOCK_USER = "unblock_user"
    DELETE_COMMENT = "delete_comment"
    MODERATE_REPORT = "moderate_report"


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

# Main Comments Table - Adjacency List Pattern
# Partition by lesson_id for efficient queries per lesson
# Clustering by created_at for chronological ordering
COMMENT_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comments (
    lesson_id UUID,
    comment_id UUID,
    parent_id UUID,
    author_id UUID,
    author_name TEXT,
    author_avatar TEXT,
    content TEXT,
    content_history LIST<FROZEN<MAP<TEXT, TEXT>>>,
    is_edited BOOLEAN,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN,
    deleted_at TIMESTAMP,
    deleted_by UUID,
    delete_reason TEXT,
    reply_count INT,
    rating TINYINT,
    is_review BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    PRIMARY KEY ((lesson_id), created_at, comment_id)
) WITH CLUSTERING ORDER BY (created_at DESC, comment_id ASC)
"""

# Index for fetching comments by parent (for threaded replies)
COMMENT_PARENT_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS comments_parent_idx
ON {keyspace}.comments (parent_id)
"""

# Index for fetching comments by author
COMMENT_AUTHOR_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS comments_author_idx
ON {keyspace}.comments (author_id)
"""

# Comments by ID - O(1) lookup table
# Allows efficient single comment fetch without full scan
COMMENTS_BY_ID_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comments_by_id (
    comment_id UUID PRIMARY KEY,
    lesson_id UUID,
    parent_id UUID,
    author_id UUID,
    author_name TEXT,
    author_avatar TEXT,
    content TEXT,
    is_edited BOOLEAN,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN,
    reply_count INT,
    rating TINYINT,
    is_review BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
"""

# Comments by parent - optimized for fetching replies
# Allows efficient "load replies" queries
COMMENTS_BY_PARENT_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comments_by_parent (
    lesson_id UUID,
    parent_id UUID,
    comment_id UUID,
    author_id UUID,
    author_name TEXT,
    author_avatar TEXT,
    content TEXT,
    is_edited BOOLEAN,
    is_deleted BOOLEAN,
    reply_count INT,
    rating TINYINT,
    is_review BOOLEAN,
    created_at TIMESTAMP,
    PRIMARY KEY ((lesson_id, parent_id), created_at, comment_id)
) WITH CLUSTERING ORDER BY (created_at ASC, comment_id ASC)
"""

# Reactions Table
# Partition by comment_id for efficient reaction queries
REACTION_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comment_reactions (
    comment_id UUID,
    user_id UUID,
    reaction_type TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY ((comment_id), user_id)
)
"""

# User reactions lookup - for checking if user already reacted
USER_REACTIONS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.user_comment_reactions (
    user_id UUID,
    comment_id UUID,
    reaction_type TEXT,
    created_at TIMESTAMP,
    PRIMARY KEY ((user_id), comment_id)
)
"""

# Reaction counts - denormalized for fast reads
REACTION_COUNTS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comment_reaction_counts (
    comment_id UUID,
    reaction_type TEXT,
    count COUNTER,
    PRIMARY KEY ((comment_id), reaction_type)
)
"""

# Reports Table
REPORT_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comment_reports (
    report_id UUID,
    comment_id UUID,
    lesson_id UUID,
    reporter_id UUID,
    reason TEXT,
    description TEXT,
    status TEXT,
    moderator_id UUID,
    moderator_notes TEXT,
    created_at TIMESTAMP,
    reviewed_at TIMESTAMP,
    PRIMARY KEY ((comment_id), report_id)
)
"""

# Reports by status - for moderation queue
REPORTS_BY_STATUS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comment_reports_by_status (
    status TEXT,
    created_at TIMESTAMP,
    report_id UUID,
    comment_id UUID,
    lesson_id UUID,
    reporter_id UUID,
    reason TEXT,
    PRIMARY KEY ((status), created_at, report_id)
) WITH CLUSTERING ORDER BY (created_at DESC, report_id ASC)
"""

# User Comment Blocks Table
USER_COMMENT_BLOCKS_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.user_comment_blocks (
    user_id UUID,
    block_id UUID,
    blocked_at TIMESTAMP,
    blocked_by UUID,
    reason TEXT,
    moderator_notes TEXT,
    expires_at TIMESTAMP,
    is_permanent BOOLEAN,
    PRIMARY KEY ((user_id), blocked_at, block_id)
) WITH CLUSTERING ORDER BY (blocked_at DESC, block_id ASC)
"""

# Comment Blocks by Moderator - for moderator activity log
COMMENT_BLOCKS_BY_MODERATOR_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.comment_blocks_by_moderator (
    moderator_id UUID,
    user_id UUID,
    block_id UUID,
    blocked_at TIMESTAMP,
    reason TEXT,
    expires_at TIMESTAMP,
    PRIMARY KEY ((moderator_id), blocked_at, block_id, user_id)
) WITH CLUSTERING ORDER BY (blocked_at DESC, block_id ASC, user_id ASC)
"""

# Moderator Action Audit Log - complete audit trail
MODERATOR_AUDIT_LOG_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.moderator_audit_log (
    log_id UUID,
    moderator_id UUID,
    action TEXT,
    target_user_id UUID,
    target_id UUID,
    performed_at TIMESTAMP,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    PRIMARY KEY ((moderator_id), performed_at, log_id)
) WITH CLUSTERING ORDER BY (performed_at DESC, log_id ASC)
  AND default_time_to_live = 31536000
  AND comment = 'Audit log for moderator actions (1 year TTL for compliance)'
"""

# All table definitions for initialization
COMMENTS_TABLES_CQL = [
    COMMENT_TABLE_CQL,
    COMMENT_PARENT_INDEX_CQL,
    COMMENT_AUTHOR_INDEX_CQL,
    COMMENTS_BY_ID_TABLE_CQL,
    COMMENTS_BY_PARENT_TABLE_CQL,
    REACTION_TABLE_CQL,
    USER_REACTIONS_TABLE_CQL,
    REACTION_COUNTS_TABLE_CQL,
    REPORT_TABLE_CQL,
    REPORTS_BY_STATUS_TABLE_CQL,
    USER_COMMENT_BLOCKS_TABLE_CQL,
    COMMENT_BLOCKS_BY_MODERATOR_TABLE_CQL,
    MODERATOR_AUDIT_LOG_TABLE_CQL,
]


# ==============================================================================
# Entity Classes
# ==============================================================================


@dataclass
class Comment:
    """Comment entity with full details."""

    comment_id: UUID
    lesson_id: UUID
    parent_id: UUID | None
    author_id: UUID
    author_name: str
    author_avatar: str | None
    content: str
    content_history: list[dict[str, str]]
    is_edited: bool
    edited_at: datetime | None
    is_deleted: bool
    deleted_at: datetime | None
    deleted_by: UUID | None
    delete_reason: str | None
    reply_count: int
    rating: int | None
    is_review: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: Any) -> "Comment":
        """Create Comment from Cassandra row."""
        return cls(
            comment_id=row.comment_id,
            lesson_id=row.lesson_id,
            parent_id=row.parent_id,
            author_id=row.author_id,
            author_name=row.author_name or "Usuario",
            author_avatar=row.author_avatar,
            content=row.content,
            content_history=row.content_history or [],
            is_edited=row.is_edited or False,
            edited_at=row.edited_at,
            is_deleted=row.is_deleted or False,
            deleted_at=row.deleted_at,
            deleted_by=row.deleted_by,
            delete_reason=row.delete_reason,
            reply_count=row.reply_count or 0,
            rating=row.rating if hasattr(row, "rating") else None,
            is_review=row.is_review if hasattr(row, "is_review") else False,
            created_at=row.created_at,
            updated_at=row.updated_at or row.created_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "comment_id": str(self.comment_id),
            "lesson_id": str(self.lesson_id),
            "parent_id": str(self.parent_id) if self.parent_id else None,
            "author_id": str(self.author_id),
            "author_name": self.author_name,
            "author_avatar": self.author_avatar,
            "content": self.content,
            "content_history": self.content_history,
            "is_edited": self.is_edited,
            "edited_at": self.edited_at.isoformat() if self.edited_at else None,
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "deleted_by": str(self.deleted_by) if self.deleted_by else None,
            "delete_reason": self.delete_reason,
            "reply_count": self.reply_count,
            "rating": self.rating,
            "is_review": self.is_review,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class CommentReply:
    """Lightweight comment for reply lists."""

    comment_id: UUID
    lesson_id: UUID
    parent_id: UUID
    author_id: UUID
    author_name: str
    author_avatar: str | None
    content: str
    is_edited: bool
    is_deleted: bool
    reply_count: int
    rating: int | None
    is_review: bool
    created_at: datetime

    @classmethod
    def from_row(cls, row: Any) -> "CommentReply":
        """Create CommentReply from Cassandra row."""
        return cls(
            comment_id=row.comment_id,
            lesson_id=row.lesson_id,
            parent_id=row.parent_id,
            author_id=row.author_id,
            author_name=row.author_name or "Usuario",
            author_avatar=row.author_avatar,
            content=row.content,
            is_edited=row.is_edited or False,
            is_deleted=row.is_deleted or False,
            reply_count=row.reply_count or 0,
            rating=row.rating if hasattr(row, "rating") else None,
            is_review=row.is_review if hasattr(row, "is_review") else False,
            created_at=row.created_at,
        )


@dataclass
class CommentLookup:
    """Lightweight comment for O(1) ID lookup."""

    comment_id: UUID
    lesson_id: UUID
    parent_id: UUID | None
    author_id: UUID
    author_name: str
    author_avatar: str | None
    content: str
    is_edited: bool
    edited_at: datetime | None
    is_deleted: bool
    reply_count: int
    rating: int | None
    is_review: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_row(cls, row: Any) -> "CommentLookup":
        """Create CommentLookup from Cassandra row."""
        return cls(
            comment_id=row.comment_id,
            lesson_id=row.lesson_id,
            parent_id=row.parent_id,
            author_id=row.author_id,
            author_name=row.author_name or "Usuario",
            author_avatar=row.author_avatar,
            content=row.content,
            is_edited=row.is_edited or False,
            edited_at=row.edited_at,
            is_deleted=row.is_deleted or False,
            reply_count=row.reply_count or 0,
            rating=row.rating if hasattr(row, "rating") else None,
            is_review=row.is_review if hasattr(row, "is_review") else False,
            created_at=row.created_at,
            updated_at=row.updated_at or row.created_at,
        )


@dataclass
class Reaction:
    """User reaction to a comment."""

    comment_id: UUID
    user_id: UUID
    reaction_type: ReactionType
    created_at: datetime

    @classmethod
    def from_row(cls, row: Any) -> "Reaction":
        """Create Reaction from Cassandra row."""
        return cls(
            comment_id=row.comment_id,
            user_id=row.user_id,
            reaction_type=ReactionType(row.reaction_type),
            created_at=row.created_at,
        )


@dataclass
class ReactionCounts:
    """Aggregated reaction counts for a comment."""

    comment_id: UUID
    counts: dict[str, int] = field(default_factory=dict)

    def total(self) -> int:
        """Get total reaction count."""
        return sum(self.counts.values())


@dataclass
class CommentReport:
    """Report of a comment for moderation."""

    report_id: UUID
    comment_id: UUID
    lesson_id: UUID
    reporter_id: UUID
    reason: ReportReason
    description: str | None
    status: ReportStatus
    moderator_id: UUID | None
    moderator_notes: str | None
    created_at: datetime
    reviewed_at: datetime | None

    @classmethod
    def from_row(cls, row: Any) -> "CommentReport":
        """Create CommentReport from Cassandra row."""
        return cls(
            report_id=row.report_id,
            comment_id=row.comment_id,
            lesson_id=row.lesson_id,
            reporter_id=row.reporter_id,
            reason=ReportReason(row.reason),
            description=row.description,
            status=ReportStatus(row.status),
            moderator_id=row.moderator_id,
            moderator_notes=row.moderator_notes,
            created_at=row.created_at,
            reviewed_at=row.reviewed_at,
        )


@dataclass
class UserCommentBlock:
    """User comment block entity."""

    block_id: UUID
    user_id: UUID
    blocked_at: datetime
    blocked_by: UUID
    reason: str
    moderator_notes: str | None = None
    expires_at: datetime | None = None
    is_permanent: bool = True

    @classmethod
    def from_row(cls, row: Any) -> "UserCommentBlock":
        """Create entity from Cassandra row."""
        return cls(
            block_id=row.block_id,
            user_id=row.user_id,
            blocked_at=row.blocked_at,
            blocked_by=row.blocked_by,
            reason=row.reason,
            moderator_notes=row.moderator_notes,
            expires_at=row.expires_at,
            is_permanent=row.is_permanent if row.is_permanent is not None else True,
        )

    def is_active(self) -> bool:
        """Check if the block is currently active.

        Returns:
            True if block is active (permanent or not yet expired), False otherwise
        """
        if self.is_permanent:
            return True
        if self.expires_at is None:
            return False
        return datetime.now(UTC) < self.expires_at


@dataclass
class ModeratorAuditLog:
    """Audit log entry for moderator actions."""

    log_id: UUID
    moderator_id: UUID
    action: ModeratorAction
    target_user_id: UUID | None
    target_id: UUID | None
    performed_at: datetime
    details: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    @classmethod
    def from_row(cls, row: Any) -> "ModeratorAuditLog":
        """Create entity from Cassandra row."""
        return cls(
            log_id=row.log_id,
            moderator_id=row.moderator_id,
            action=ModeratorAction(row.action),
            target_user_id=row.target_user_id,
            target_id=row.target_id,
            performed_at=row.performed_at,
            details=row.details,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "block_id": str(self.block_id),
            "user_id": str(self.user_id),
            "blocked_at": self.blocked_at.isoformat(),
            "blocked_by": str(self.blocked_by),
            "reason": self.reason,
            "moderator_notes": self.moderator_notes,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_permanent": self.is_permanent,
        }

    def is_active(self) -> bool:
        """Check if block is still active."""
        if self.is_permanent:
            return True
        if self.expires_at is None:
            return False
        return datetime.now(UTC) < self.expires_at


# ==============================================================================
# Factory Functions
# ==============================================================================


def create_comment(
    lesson_id: UUID,
    author_id: UUID,
    author_name: str,
    content: str,
    parent_id: UUID | None = None,
    author_avatar: str | None = None,
    rating: int | None = None,
    is_review: bool = False,
) -> Comment:
    """Create a new comment with default values."""
    now = datetime.now(UTC)
    return Comment(
        comment_id=uuid4(),
        lesson_id=lesson_id,
        parent_id=parent_id,
        author_id=author_id,
        author_name=author_name,
        author_avatar=author_avatar,
        content=content,
        content_history=[],
        is_edited=False,
        edited_at=None,
        is_deleted=False,
        deleted_at=None,
        deleted_by=None,
        delete_reason=None,
        reply_count=0,
        rating=rating,
        is_review=is_review,
        created_at=now,
        updated_at=now,
    )


def create_report(
    comment_id: UUID,
    lesson_id: UUID,
    reporter_id: UUID,
    reason: ReportReason,
    description: str | None = None,
) -> CommentReport:
    """Create a new comment report."""
    now = datetime.now(UTC)
    return CommentReport(
        report_id=uuid4(),
        comment_id=comment_id,
        lesson_id=lesson_id,
        reporter_id=reporter_id,
        reason=reason,
        description=description,
        status=ReportStatus.PENDING,
        moderator_id=None,
        moderator_notes=None,
        created_at=now,
        reviewed_at=None,
    )


def create_user_block(
    user_id: UUID,
    blocked_by: UUID,
    reason: str,
    moderator_notes: str | None = None,
    duration_days: int | None = None,
) -> UserCommentBlock:
    """Create a new user comment block."""
    now = datetime.now(UTC)
    is_permanent = duration_days is None
    expires_at = None if is_permanent else now + timedelta(days=duration_days)

    return UserCommentBlock(
        block_id=uuid4(),
        user_id=user_id,
        blocked_at=now,
        blocked_by=blocked_by,
        reason=reason,
        moderator_notes=moderator_notes,
        expires_at=expires_at,
        is_permanent=is_permanent,
    )


def create_audit_log(
    moderator_id: UUID,
    action: ModeratorAction,
    target_user_id: UUID | None = None,
    target_id: UUID | None = None,
    details: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ModeratorAuditLog:
    """Create a moderator audit log entry.

    Args:
        moderator_id: ID of the moderator performing the action
        action: Type of moderator action (from ModeratorAction enum)
        target_user_id: ID of the user being moderated (optional)
        target_id: ID of the specific entity (block_id, comment_id, etc)
        details: Additional details about the action (JSON string or text)
        ip_address: IP address of the moderator (for security audit)
        user_agent: User agent of the moderator (for security audit)

    Returns:
        ModeratorAuditLog instance ready to be inserted
    """
    return ModeratorAuditLog(
        log_id=uuid4(),
        moderator_id=moderator_id,
        action=action,
        target_user_id=target_user_id,
        target_id=target_id,
        performed_at=datetime.now(UTC),
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
