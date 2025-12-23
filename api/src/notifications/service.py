# ruff: noqa: S608 - All CQL queries use keyspace from config, not user input
"""Notification service layer.

Business logic for:
- Creating notifications for mentions, replies, reactions
- Listing user notifications with pagination
- Marking notifications as read
- Tracking unread counts
- Parsing @mentions from comment content
"""

import contextlib
import json
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from .models import (
    Notification,
    NotificationType,
    create_mention_notification,
    create_notification,
    create_reaction_notification,
    create_reply_notification,
)
from .schemas import (
    NotificationListResponse,
    NotificationResponse,
    decode_cursor,
    encode_cursor,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session
    from redis.asyncio import Redis


# Pattern for @mentions (supports spaces with quotes: @"User Name" or @Username)
MENTION_PATTERN = re.compile(r'@"([^"]+)"|@(\S+)', re.UNICODE)


def extract_mentions(content: str) -> list[str]:
    """Extract @mentioned usernames from content.

    Supports:
    - @username (single word)
    - @"User Name" (quoted for names with spaces)

    Returns list of mentioned names (without @ prefix).
    """
    mentions = []
    for match in MENTION_PATTERN.finditer(content):
        # Group 1 is quoted name, group 2 is unquoted
        name = match.group(1) or match.group(2)
        if name:
            mentions.append(name)
    return mentions


class NotificationService:
    """Service for notification management."""

    def __init__(self, session: "Session", keyspace: str, redis: "Redis | None" = None):
        """Initialize with Cassandra session and optional Redis."""
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        # Insert notification
        self._insert_notification = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.notifications
            (user_id, notification_id, type, title, message, actor_id, actor_name,
             actor_avatar, reference_id, reference_type, reference_url, lesson_id,
             course_slug, lesson_slug, is_read, read_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        # Get notifications by user
        self._get_notifications = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """)

        # Get notifications with cursor
        self._get_notifications_cursor = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.notifications
            WHERE user_id = ? AND created_at < ?
            ORDER BY created_at DESC
            LIMIT ?
        """)

        # Get notification by id
        self._get_notification = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.notifications
            WHERE user_id = ? AND created_at = ? AND notification_id = ?
        """)

        # Mark as read
        self._mark_read = self.session.prepare(f"""
            UPDATE {self.keyspace}.notifications
            SET is_read = true, read_at = ?
            WHERE user_id = ? AND created_at = ? AND notification_id = ?
        """)

        # Count unread
        self._count_unread = self.session.prepare(f"""
            SELECT COUNT(*) FROM {self.keyspace}.notifications
            WHERE user_id = ? AND is_read = false ALLOW FILTERING
        """)

        # Increment unread counter
        self._incr_unread = self.session.prepare(f"""
            UPDATE {self.keyspace}.notification_unread_counts
            SET count = count + 1
            WHERE user_id = ?
        """)

        # Decrement unread counter
        self._decr_unread = self.session.prepare(f"""
            UPDATE {self.keyspace}.notification_unread_counts
            SET count = count - ?
            WHERE user_id = ?
        """)

        # Get unread count
        self._get_unread_count = self.session.prepare(f"""
            SELECT count FROM {self.keyspace}.notification_unread_counts
            WHERE user_id = ?
        """)

        # Delete notification
        self._delete_notification = self.session.prepare(f"""
            DELETE FROM {self.keyspace}.notifications
            WHERE user_id = ? AND created_at = ? AND notification_id = ?
        """)

    # ==========================================================================
    # Notification Creation
    # ==========================================================================

    async def create_notification(self, notification: Notification) -> Notification:
        """Create a new notification."""
        await self.session.aexecute(
            self._insert_notification,
            [
                notification.user_id,
                notification.notification_id,
                notification.type.value,
                notification.title,
                notification.message,
                notification.actor_id,
                notification.actor_name,
                notification.actor_avatar,
                notification.reference_id,
                notification.reference_type,
                notification.reference_url,
                notification.lesson_id,
                notification.course_slug,
                notification.lesson_slug,
                notification.is_read,
                notification.read_at,
                notification.created_at,
            ],
        )

        # Increment unread counter
        await self.session.aexecute(self._incr_unread, [notification.user_id])

        # Invalidate cache and publish to Redis for real-time updates
        await self._invalidate_cache(notification.user_id)
        await self._publish_notification(notification)

        return notification

    async def _publish_notification(self, notification: Notification) -> None:
        """Publish notification to Redis Pub/Sub for real-time delivery."""
        if not self.redis:
            return

        channel = f"notifications:user:{notification.user_id}"
        message = {
            "type": "notification",
            "data": {
                "id": str(notification.notification_id),
                "type": notification.type.value,
                "title": notification.title,
                "message": notification.message,
                "actor_id": str(notification.actor_id)
                if notification.actor_id
                else None,
                "actor_name": notification.actor_name,
                "actor_avatar": notification.actor_avatar,
                "reference_url": notification.reference_url,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat(),
            },
        }

        # Non-critical: don't fail notification creation if Redis publish fails
        with contextlib.suppress(Exception):
            await self.redis.publish(channel, json.dumps(message))

    async def notify_mention(
        self,
        mentioned_user_id: UUID,
        actor_id: UUID,
        actor_name: str,
        comment_id: UUID,
        lesson_id: UUID,
        course_slug: str,
        lesson_slug: str,
        comment_content: str,
        actor_avatar: str | None = None,
    ) -> Notification:
        """Create notification for @mention.

        Args:
            mentioned_user_id: User being mentioned
            actor_id: User who made the mention
            actor_name: Name of actor
            comment_id: Comment containing the mention
            lesson_id: Lesson where comment was made
            course_slug: Course slug for URL
            lesson_slug: Lesson slug for URL
            comment_content: Full comment text (will be truncated)
            actor_avatar: Optional avatar URL
        """
        notification = create_mention_notification(
            mentioned_user_id=mentioned_user_id,
            actor_id=actor_id,
            actor_name=actor_name,
            comment_id=comment_id,
            lesson_id=lesson_id,
            course_slug=course_slug,
            lesson_slug=lesson_slug,
            comment_preview=comment_content,
            actor_avatar=actor_avatar,
        )
        return await self.create_notification(notification)

    async def notify_reply(
        self,
        comment_author_id: UUID,
        replier_id: UUID,
        replier_name: str,
        reply_comment_id: UUID,
        parent_comment_id: UUID,
        lesson_id: UUID,
        course_slug: str,
        lesson_slug: str,
        reply_content: str,
        replier_avatar: str | None = None,
    ) -> Notification | None:
        """Create notification for reply to comment.

        Returns None if replier is the same as comment author.
        """
        # Don't notify if user replied to their own comment
        if comment_author_id == replier_id:
            return None

        notification = create_reply_notification(
            comment_author_id=comment_author_id,
            replier_id=replier_id,
            replier_name=replier_name,
            comment_id=reply_comment_id,
            parent_comment_id=parent_comment_id,
            lesson_id=lesson_id,
            course_slug=course_slug,
            lesson_slug=lesson_slug,
            reply_preview=reply_content,
            replier_avatar=replier_avatar,
        )
        return await self.create_notification(notification)

    async def notify_reaction(
        self,
        comment_author_id: UUID,
        reactor_id: UUID,
        reactor_name: str,
        reaction_type: str,
        comment_id: UUID,
        lesson_id: UUID,
        course_slug: str,
        lesson_slug: str,
        reactor_avatar: str | None = None,
    ) -> Notification | None:
        """Create notification for reaction to comment.

        Returns None if reactor is the same as comment author.
        """
        # Don't notify if user reacted to their own comment
        if comment_author_id == reactor_id:
            return None

        notification = create_reaction_notification(
            comment_author_id=comment_author_id,
            reactor_id=reactor_id,
            reactor_name=reactor_name,
            reaction_type=reaction_type,
            comment_id=comment_id,
            lesson_id=lesson_id,
            course_slug=course_slug,
            lesson_slug=lesson_slug,
            reactor_avatar=reactor_avatar,
        )
        return await self.create_notification(notification)

    async def notify_system(
        self,
        user_id: UUID,
        title: str,
        message: str,
    ) -> Notification:
        """Create a system notification."""
        notification = create_notification(
            user_id=user_id,
            notification_type=NotificationType.SYSTEM,
            title=title,
            message=message,
        )
        return await self.create_notification(notification)

    async def broadcast_to_users(
        self,
        user_ids: list[UUID],
        title: str,
        message: str,
    ) -> int:
        """Broadcast system notification to specific users.

        Args:
            user_ids: List of user IDs to notify
            title: Notification title
            message: Notification message

        Returns:
            Number of notifications created
        """
        count = 0
        for user_id in user_ids:
            await self.notify_system(user_id=user_id, title=title, message=message)
            count += 1
        return count

    # ==========================================================================
    # Notification Reading
    # ==========================================================================

    async def get_notifications(
        self,
        user_id: UUID,
        limit: int = 20,
        cursor: str | None = None,
        unread_only: bool = False,
    ) -> NotificationListResponse:
        """Get notifications for a user with pagination."""
        # Query with or without cursor
        if cursor:
            created_at, _ = decode_cursor(cursor)
            rows = await self.session.aexecute(
                self._get_notifications_cursor,
                [user_id, created_at, limit + 1],
            )
        else:
            rows = await self.session.aexecute(
                self._get_notifications,
                [user_id, limit + 1],
            )

        notifications = []
        for row in rows:
            if unread_only and row.is_read:
                continue
            notification = Notification.from_row(row)
            notifications.append(notification)

        # Check if there are more
        has_more = len(notifications) > limit
        if has_more:
            notifications = notifications[:limit]

        # Convert to responses
        items = [NotificationResponse.from_notification(n) for n in notifications]

        # Build cursor
        next_cursor = None
        if has_more and notifications:
            last = notifications[-1]
            next_cursor = encode_cursor(last.created_at, last.notification_id)

        # Get counts
        unread_count = await self.get_unread_count(user_id)
        total = await self._get_total_count(user_id)

        return NotificationListResponse(
            items=items,
            total=total,
            unread_count=unread_count,
            has_more=has_more,
            next_cursor=next_cursor,
        )

    async def get_unread_count(self, user_id: UUID) -> int:
        """Get unread notification count for user."""
        # Try Redis cache first
        if self.redis:
            cached = await self.redis.get(f"notifications:unread:{user_id}")
            if cached:
                return int(cached)

        # Query from counter table
        result = await self.session.aexecute(
            self._get_unread_count,
            [user_id],
        )
        row = result.one()

        count = row.count if row and row.count else 0

        # Cache in Redis
        if self.redis:
            await self.redis.setex(
                f"notifications:unread:{user_id}",
                300,  # 5 min TTL
                str(count),
            )

        return count

    async def _get_total_count(self, user_id: UUID) -> int:
        """Get total notification count for user."""
        # For now, use unread count as approximation
        # In production, you'd track this separately
        return await self.get_unread_count(user_id)

    # ==========================================================================
    # Mark as Read
    # ==========================================================================

    async def mark_as_read(
        self,
        user_id: UUID,
        notification_ids: list[UUID],
    ) -> int:
        """Mark specific notifications as read.

        Returns count of notifications marked as read.
        """
        now = datetime.now(UTC)
        marked = 0

        # For each notification, we need to find it first to get created_at
        # This is inefficient - in production you'd include created_at in the request
        all_rows = await self.session.aexecute(
            self._get_notifications,
            [user_id, 1000],  # Get recent notifications
        )

        for row in all_rows:
            if row.notification_id in notification_ids and not row.is_read:
                await self.session.aexecute(
                    self._mark_read,
                    [now, user_id, row.created_at, row.notification_id],
                )
                marked += 1

        # Decrement unread counter
        if marked > 0:
            await self.session.aexecute(self._decr_unread, [marked, user_id])
            await self._invalidate_cache(user_id)

        return marked

    async def mark_all_as_read(self, user_id: UUID) -> int:
        """Mark all notifications as read for user.

        Returns count of notifications marked as read.
        """
        now = datetime.now(UTC)
        marked = 0

        # Get all unread notifications
        rows = await self.session.aexecute(
            self._get_notifications,
            [user_id, 1000],
        )

        for row in rows:
            if not row.is_read:
                await self.session.aexecute(
                    self._mark_read,
                    [now, user_id, row.created_at, row.notification_id],
                )
                marked += 1

        # Reset unread counter
        if marked > 0:
            await self.session.aexecute(self._decr_unread, [marked, user_id])
            await self._invalidate_cache(user_id)

        return marked

    # ==========================================================================
    # Mention Parsing and User Lookup
    # ==========================================================================

    async def process_mentions(
        self,
        content: str,
        author_id: UUID,
        author_name: str,
        comment_id: UUID,
        lesson_id: UUID,
        course_slug: str,
        lesson_slug: str,
        author_avatar: str | None,
        user_lookup_fn: "callable",
    ) -> list[Notification]:
        """Process @mentions in content and create notifications.

        Args:
            content: Comment content to parse
            author_id: Comment author (actor)
            author_name: Comment author name
            comment_id: Comment ID for reference
            lesson_id: Lesson ID
            course_slug: Course slug for URL
            lesson_slug: Lesson slug for URL
            author_avatar: Author's avatar URL
            user_lookup_fn: Async function(name: str) -> User | None

        Returns:
            List of created notifications
        """
        mentions = extract_mentions(content)
        notifications = []

        for mentioned_name in mentions:
            # Look up user by name
            user = await user_lookup_fn(mentioned_name)
            if user and user.id != author_id:  # Don't notify yourself
                notification = await self.notify_mention(
                    mentioned_user_id=user.id,
                    actor_id=author_id,
                    actor_name=author_name,
                    comment_id=comment_id,
                    lesson_id=lesson_id,
                    course_slug=course_slug,
                    lesson_slug=lesson_slug,
                    comment_content=content,
                    actor_avatar=author_avatar,
                )
                notifications.append(notification)

        return notifications

    # ==========================================================================
    # Cache Management
    # ==========================================================================

    async def _invalidate_cache(self, user_id: UUID) -> None:
        """Invalidate notification cache for user."""
        if not self.redis:
            return

        await self.redis.delete(f"notifications:unread:{user_id}")
        await self.redis.delete(f"notifications:list:{user_id}")
