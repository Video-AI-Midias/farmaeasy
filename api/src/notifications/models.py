"""Database models for notifications system.

Cassandra table definitions for:
- Notifications: User notifications with types (mention, reply, reaction)
- Notifications by user: Optimized for fetching user's notifications

Notification types:
- MENTION: User was mentioned with @username in a comment
- REPLY: Someone replied to user's comment
- REACTION: Someone reacted to user's comment
- SYSTEM: System-wide announcement
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


# ==============================================================================
# Constants
# ==============================================================================

NOTIFICATION_PREVIEW_MAX_LENGTH = 200


class NotificationType(str, Enum):
    """Types of notifications."""

    MENTION = "mention"
    REPLY = "reply"
    REACTION = "reaction"
    SYSTEM = "system"


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

# Main Notifications Table - partitioned by user_id for efficient user queries
NOTIFICATION_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.notifications (
    user_id UUID,
    notification_id UUID,
    type TEXT,
    title TEXT,
    message TEXT,
    actor_id UUID,
    actor_name TEXT,
    actor_avatar TEXT,
    reference_id UUID,
    reference_type TEXT,
    reference_url TEXT,
    lesson_id UUID,
    course_slug TEXT,
    lesson_slug TEXT,
    is_read BOOLEAN,
    read_at TIMESTAMP,
    created_at TIMESTAMP,
    PRIMARY KEY ((user_id), created_at, notification_id)
) WITH CLUSTERING ORDER BY (created_at DESC, notification_id ASC)
"""

# Unread count table - for quick unread count queries
UNREAD_COUNT_TABLE_CQL = """
CREATE TABLE IF NOT EXISTS {keyspace}.notification_unread_counts (
    user_id UUID PRIMARY KEY,
    count COUNTER
)
"""

# Index for fetching by reference (e.g., find all notifications for a comment)
NOTIFICATION_REFERENCE_INDEX_CQL = """
CREATE INDEX IF NOT EXISTS notifications_reference_idx
ON {keyspace}.notifications (reference_id)
"""

# All table definitions for initialization
NOTIFICATIONS_TABLES_CQL = [
    NOTIFICATION_TABLE_CQL,
    UNREAD_COUNT_TABLE_CQL,
    NOTIFICATION_REFERENCE_INDEX_CQL,
]


# ==============================================================================
# Entity Classes
# ==============================================================================


@dataclass
class Notification:
    """Notification entity with full details."""

    notification_id: UUID
    user_id: UUID
    type: NotificationType
    title: str
    message: str
    actor_id: UUID | None
    actor_name: str | None
    actor_avatar: str | None
    reference_id: UUID | None
    reference_type: str | None
    reference_url: str | None
    lesson_id: UUID | None
    course_slug: str | None
    lesson_slug: str | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime

    @classmethod
    def from_row(cls, row: Any) -> "Notification":
        """Create Notification from Cassandra row."""
        return cls(
            notification_id=row.notification_id,
            user_id=row.user_id,
            type=NotificationType(row.type),
            title=row.title,
            message=row.message,
            actor_id=row.actor_id,
            actor_name=row.actor_name,
            actor_avatar=row.actor_avatar,
            reference_id=row.reference_id,
            reference_type=row.reference_type,
            reference_url=row.reference_url,
            lesson_id=row.lesson_id,
            course_slug=row.course_slug,
            lesson_slug=row.lesson_slug,
            is_read=row.is_read or False,
            read_at=row.read_at,
            created_at=row.created_at,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "notification_id": str(self.notification_id),
            "user_id": str(self.user_id),
            "type": self.type.value,
            "title": self.title,
            "message": self.message,
            "actor_id": str(self.actor_id) if self.actor_id else None,
            "actor_name": self.actor_name,
            "actor_avatar": self.actor_avatar,
            "reference_id": str(self.reference_id) if self.reference_id else None,
            "reference_type": self.reference_type,
            "reference_url": self.reference_url,
            "lesson_id": str(self.lesson_id) if self.lesson_id else None,
            "course_slug": self.course_slug,
            "lesson_slug": self.lesson_slug,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat(),
        }


# ==============================================================================
# Factory Functions
# ==============================================================================


def create_notification(
    user_id: UUID,
    notification_type: NotificationType,
    title: str,
    message: str,
    actor_id: UUID | None = None,
    actor_name: str | None = None,
    actor_avatar: str | None = None,
    reference_id: UUID | None = None,
    reference_type: str | None = None,
    reference_url: str | None = None,
    lesson_id: UUID | None = None,
    course_slug: str | None = None,
    lesson_slug: str | None = None,
) -> Notification:
    """Create a new notification with default values."""
    now = datetime.now(UTC)
    return Notification(
        notification_id=uuid4(),
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_avatar=actor_avatar,
        reference_id=reference_id,
        reference_type=reference_type,
        reference_url=reference_url,
        lesson_id=lesson_id,
        course_slug=course_slug,
        lesson_slug=lesson_slug,
        is_read=False,
        read_at=None,
        created_at=now,
    )


def create_mention_notification(
    mentioned_user_id: UUID,
    actor_id: UUID,
    actor_name: str,
    comment_id: UUID,
    lesson_id: UUID,
    course_slug: str,
    lesson_slug: str,
    comment_preview: str,
    actor_avatar: str | None = None,
) -> Notification:
    """Create a notification for @mention."""
    return create_notification(
        user_id=mentioned_user_id,
        notification_type=NotificationType.MENTION,
        title=f"{actor_name} mencionou voce",
        message=comment_preview[:NOTIFICATION_PREVIEW_MAX_LENGTH]
        if len(comment_preview) > NOTIFICATION_PREVIEW_MAX_LENGTH
        else comment_preview,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_avatar=actor_avatar,
        reference_id=comment_id,
        reference_type="comment",
        reference_url=f"/learn/{course_slug}/lesson/{lesson_slug}#comment-{comment_id}",
        lesson_id=lesson_id,
        course_slug=course_slug,
        lesson_slug=lesson_slug,
    )


def create_reply_notification(
    comment_author_id: UUID,
    replier_id: UUID,
    replier_name: str,
    comment_id: UUID,
    _parent_comment_id: UUID,  # Kept for API consistency
    lesson_id: UUID,
    course_slug: str,
    lesson_slug: str,
    reply_preview: str,
    replier_avatar: str | None = None,
) -> Notification:
    """Create a notification for reply to comment."""
    return create_notification(
        user_id=comment_author_id,
        notification_type=NotificationType.REPLY,
        title=f"{replier_name} respondeu seu comentario",
        message=reply_preview[:NOTIFICATION_PREVIEW_MAX_LENGTH]
        if len(reply_preview) > NOTIFICATION_PREVIEW_MAX_LENGTH
        else reply_preview,
        actor_id=replier_id,
        actor_name=replier_name,
        actor_avatar=replier_avatar,
        reference_id=comment_id,
        reference_type="comment",
        reference_url=f"/learn/{course_slug}/lesson/{lesson_slug}#comment-{comment_id}",
        lesson_id=lesson_id,
        course_slug=course_slug,
        lesson_slug=lesson_slug,
    )


def create_reaction_notification(
    comment_author_id: UUID,
    reactor_id: UUID,
    reactor_name: str,
    reaction_type: str,
    comment_id: UUID,
    lesson_id: UUID,
    course_slug: str,
    lesson_slug: str,
    reactor_avatar: str | None = None,
) -> Notification:
    """Create a notification for reaction to comment."""
    reaction_emoji = {
        "like": "👍",
        "love": "❤️",
        "laugh": "😂",
        "sad": "😢",
        "angry": "😠",
    }.get(reaction_type, "👍")

    return create_notification(
        user_id=comment_author_id,
        notification_type=NotificationType.REACTION,
        title=f"{reactor_name} reagiu {reaction_emoji} ao seu comentario",
        message=f"Reagiu com {reaction_emoji}",
        actor_id=reactor_id,
        actor_name=reactor_name,
        actor_avatar=reactor_avatar,
        reference_id=comment_id,
        reference_type="comment",
        reference_url=f"/learn/{course_slug}/lesson/{lesson_slug}#comment-{comment_id}",
        lesson_id=lesson_id,
        course_slug=course_slug,
        lesson_slug=lesson_slug,
    )
