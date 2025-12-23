"""Comment system service layer.

Business logic for:
- Comment CRUD with threading support
- Reactions management
- Content moderation and reports
- Spam detection and rate limiting
"""

import hashlib
import html
import json
import re
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status

from .models import (
    Comment,
    CommentReply,
    CommentReport,
    ModeratorAction,
    ReactionType,
    ReportReason,
    ReportStatus,
    UserCommentBlock,
    create_audit_log,
    create_comment,
    create_report,
    create_user_block,
)
from .schemas import (
    CommentListResponse,
    CommentResponse,
    RatingStatsResponse,
    UserBlockListResponse,
    UserBlockResponse,
    decode_cursor,
    encode_cursor,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session
    from redis.asyncio import Redis


# ==============================================================================
# Custom Exceptions
# ==============================================================================


class CommentError(Exception):
    """Base comment error."""

    def __init__(self, message: str, code: str = "comment_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class CommentNotFoundError(CommentError):
    """Comment not found."""

    def __init__(self, message: str = "Comentario nao encontrado"):
        super().__init__(message, "comment_not_found")


class PermissionDeniedError(CommentError):
    """Permission denied for operation."""

    def __init__(self, message: str = "Permissao negada"):
        super().__init__(message, "permission_denied")


class RateLimitExceededError(CommentError):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Limite de requisicoes excedido"):
        super().__init__(message, "rate_limit_exceeded")


class SpamDetectedError(CommentError):
    """Spam detected in comment."""

    def __init__(self, message: str = "Comentario detectado como spam"):
        super().__init__(message, "spam_detected")


class EditWindowExpiredError(CommentError):
    """Edit window has expired."""

    def __init__(self, message: str = "Prazo para edicao expirou"):
        super().__init__(message, "edit_window_expired")


# ==============================================================================
# Content Sanitization
# ==============================================================================


# Allowed HTML tags (basic formatting only)
ALLOWED_TAGS = {"b", "i", "em", "strong", "code", "pre"}

# Spam keywords (basic list - extend as needed)
SPAM_KEYWORDS = {
    "viagra",
    "cialis",
    "casino",
    "lottery",
    "winner",
    "click here",
    "free money",
    "act now",
    "limited time",
    "buy now",
}

# URL pattern for detection
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)


def sanitize_content(content: str) -> str:
    """Sanitize comment content to prevent XSS.

    - Escapes HTML entities
    - Allows only safe formatting tags
    - Strips dangerous attributes
    """
    # First escape all HTML
    escaped = html.escape(content)

    # Re-enable allowed tags (simple approach)
    for tag in ALLOWED_TAGS:
        # Opening tags
        escaped = escaped.replace(f"&lt;{tag}&gt;", f"<{tag}>")
        # Closing tags
        escaped = escaped.replace(f"&lt;/{tag}&gt;", f"</{tag}>")

    return escaped


def is_spam(content: str, _user_id: UUID | None = None) -> bool:
    """Basic spam detection.

    Checks:
    - Minimum word count
    - Maximum URL count
    - Spam keyword presence

    Args:
        content: Comment text to check
        _user_id: Reserved for future per-user spam detection
    """
    content_lower = content.lower()

    # Too short - allow short comments
    words = content.split()
    min_words = 2
    if len(words) < min_words:
        return False

    # Too many URLs
    urls = URL_PATTERN.findall(content)
    max_urls = 3
    if len(urls) > max_urls:
        return True

    # Spam keywords - use any() for cleaner code
    return any(keyword in content_lower for keyword in SPAM_KEYWORDS)


def content_hash(content: str) -> str:
    """Generate hash of content for duplicate detection.

    Uses SHA256 for secure hashing (not cryptographic security,
    just for content fingerprinting).
    """
    return hashlib.sha256(content.encode()).hexdigest()[:32]


# ==============================================================================
# Comment Service
# ==============================================================================


class CommentService:
    """Service for comment management."""

    # Edit window in hours
    EDIT_WINDOW_HOURS = 24

    # Rate limits
    COMMENTS_PER_MINUTE = 10
    COMMENTS_PER_HOUR = 100
    REPORTS_PER_HOUR = 5

    def __init__(self, session: "Session", keyspace: str, redis: "Redis | None" = None):
        """Initialize with Cassandra session and optional Redis."""
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        # Comment CRUD
        self._insert_comment = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.comments
            (lesson_id, comment_id, parent_id, author_id, author_name, author_avatar,
             content, content_history, is_edited, edited_at, is_deleted, deleted_at,
             deleted_by, delete_reason, reply_count, rating, is_review, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        self._insert_comment_by_parent = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.comments_by_parent
            (lesson_id, parent_id, comment_id, author_id, author_name, author_avatar,
             content, is_edited, is_deleted, reply_count, rating, is_review, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        self._get_comments_by_lesson = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comments
            WHERE lesson_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """)

        self._get_comments_by_lesson_cursor = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comments
            WHERE lesson_id = ? AND created_at < ?
            ORDER BY created_at DESC
            LIMIT ?
        """)

        self._get_replies = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comments_by_parent
            WHERE lesson_id = ? AND parent_id = ?
            ORDER BY created_at ASC
            LIMIT ?
        """)

        self._get_comment = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comments
            WHERE lesson_id = ? AND created_at = ? AND comment_id = ?
        """)

        self._update_comment = self.session.prepare(f"""
            UPDATE {self.keyspace}.comments
            SET content = ?, content_history = ?, is_edited = ?, edited_at = ?, updated_at = ?
            WHERE lesson_id = ? AND created_at = ? AND comment_id = ?
        """)

        self._soft_delete_comment = self.session.prepare(f"""
            UPDATE {self.keyspace}.comments
            SET is_deleted = true, deleted_at = ?, deleted_by = ?, delete_reason = ?, updated_at = ?
            WHERE lesson_id = ? AND created_at = ? AND comment_id = ?
        """)

        self._update_reply_count = self.session.prepare(f"""
            UPDATE {self.keyspace}.comments
            SET reply_count = ?
            WHERE lesson_id = ? AND created_at = ? AND comment_id = ?
        """)

        self._count_comments_by_lesson = self.session.prepare(f"""
            SELECT COUNT(*) FROM {self.keyspace}.comments
            WHERE lesson_id = ?
        """)

        # Count comments by author (uses secondary index)
        self._count_comments_by_author = self.session.prepare(f"""
            SELECT COUNT(*) FROM {self.keyspace}.comments
            WHERE author_id = ?
        """)

        self._count_replies = self.session.prepare(f"""
            SELECT COUNT(*) FROM {self.keyspace}.comments_by_parent
            WHERE lesson_id = ? AND parent_id = ?
        """)

        # Reactions
        self._insert_reaction = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.comment_reactions
            (comment_id, user_id, reaction_type, created_at)
            VALUES (?, ?, ?, ?)
        """)

        self._insert_user_reaction = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.user_comment_reactions
            (user_id, comment_id, reaction_type, created_at)
            VALUES (?, ?, ?, ?)
        """)

        self._delete_reaction = self.session.prepare(f"""
            DELETE FROM {self.keyspace}.comment_reactions
            WHERE comment_id = ? AND user_id = ?
        """)

        self._delete_user_reaction = self.session.prepare(f"""
            DELETE FROM {self.keyspace}.user_comment_reactions
            WHERE user_id = ? AND comment_id = ?
        """)

        self._get_user_reaction = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.user_comment_reactions
            WHERE user_id = ? AND comment_id = ?
        """)

        self._get_reactions = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comment_reactions
            WHERE comment_id = ?
        """)

        # Reaction counts (counter table)
        self._incr_reaction_count = self.session.prepare(f"""
            UPDATE {self.keyspace}.comment_reaction_counts
            SET count = count + 1
            WHERE comment_id = ? AND reaction_type = ?
        """)

        self._decr_reaction_count = self.session.prepare(f"""
            UPDATE {self.keyspace}.comment_reaction_counts
            SET count = count - 1
            WHERE comment_id = ? AND reaction_type = ?
        """)

        self._get_reaction_counts = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comment_reaction_counts
            WHERE comment_id = ?
        """)

        # Reports
        self._insert_report = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.comment_reports
            (report_id, comment_id, lesson_id, reporter_id, reason, description,
             status, moderator_id, moderator_notes, created_at, reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        self._insert_report_by_status = self.session.prepare(f"""
            INSERT INTO {self.keyspace}.comment_reports_by_status
            (status, created_at, report_id, comment_id, lesson_id, reporter_id, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """)

        self._get_reports_by_status = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.comment_reports_by_status
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT ?
        """)

        self._update_report = self.session.prepare(f"""
            UPDATE {self.keyspace}.comment_reports
            SET status = ?, moderator_id = ?, moderator_notes = ?, reviewed_at = ?
            WHERE comment_id = ? AND report_id = ?
        """)

        # User blocks
        self._check_user_blocked = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.user_comment_blocks
            WHERE user_id = ?
            ORDER BY blocked_at DESC
            LIMIT 1
        """)

        self._get_user_block = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.user_comment_blocks
            WHERE user_id = ? AND block_id = ?
            LIMIT 1
            ALLOW FILTERING
        """)

        self._update_user_block_expires = self.session.prepare(f"""
            UPDATE {self.keyspace}.user_comment_blocks
            SET expires_at = ?
            WHERE user_id = ? AND blocked_at = ? AND block_id = ?
        """)

        self._get_user_blocks = self.session.prepare(f"""
            SELECT * FROM {self.keyspace}.user_comment_blocks
            WHERE user_id = ?
            ORDER BY blocked_at DESC
            LIMIT ?
        """)

    # ==========================================================================
    # Rate Limiting (Redis-based)
    # ==========================================================================

    async def check_rate_limit(self, user_id: UUID) -> bool:
        """Check if user has exceeded rate limit.

        Returns True if within limit, raises RateLimitExceededError otherwise.
        """
        if not self.redis:
            return True

        key_minute = f"comments:rate:{user_id}:minute"
        key_hour = f"comments:rate:{user_id}:hour"

        # Check minute limit
        minute_count = await self.redis.get(key_minute)
        if minute_count and int(minute_count) >= self.COMMENTS_PER_MINUTE:
            raise RateLimitExceededError(
                "Muitos comentarios por minuto. Aguarde um momento."
            )

        # Check hour limit
        hour_count = await self.redis.get(key_hour)
        if hour_count and int(hour_count) >= self.COMMENTS_PER_HOUR:
            raise RateLimitExceededError("Limite de comentarios por hora excedido.")

        return True

    async def increment_rate_limit(self, user_id: UUID) -> None:
        """Increment rate limit counters."""
        if not self.redis:
            return

        key_minute = f"comments:rate:{user_id}:minute"
        key_hour = f"comments:rate:{user_id}:hour"

        pipe = self.redis.pipeline()
        pipe.incr(key_minute)
        pipe.expire(key_minute, 60)
        pipe.incr(key_hour)
        pipe.expire(key_hour, 3600)
        await pipe.execute()

    async def check_duplicate(self, user_id: UUID, content: str) -> bool:
        """Check if user recently posted the same content."""
        if not self.redis:
            return False

        key = f"comments:recent:{user_id}"
        hash_value = content_hash(content)

        recent = await self.redis.lrange(key, 0, -1)
        if hash_value.encode() in recent:
            raise SpamDetectedError("Comentario duplicado detectado.")

        # Track this comment hash
        await self.redis.lpush(key, hash_value)
        await self.redis.ltrim(key, 0, 9)  # Keep last 10
        await self.redis.expire(key, 3600)  # 1 hour TTL

        return False

    # ==========================================================================
    # Comment CRUD
    # ==========================================================================

    async def create_comment(
        self,
        lesson_id: UUID,
        author_id: UUID,
        author_name: str,
        content: str,
        parent_id: UUID | None = None,
        author_avatar: str | None = None,
        rating: int | None = None,
        is_review: bool = False,
    ) -> Comment:
        """Create a new comment.

        Performs:
        - User blocking check
        - Rate limiting check
        - Spam detection
        - Duplicate check
        - Content sanitization
        - Dual-write to main and by_parent tables
        """
        # Check if user is blocked from commenting
        if await self.is_user_blocked(author_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario bloqueado de comentar",
            )

        # Rate limiting
        await self.check_rate_limit(author_id)

        # Spam check
        if is_spam(content):
            raise SpamDetectedError

        # Duplicate check
        await self.check_duplicate(author_id, content)

        # Sanitize content
        safe_content = sanitize_content(content)

        # Create comment entity
        comment = create_comment(
            lesson_id=lesson_id,
            author_id=author_id,
            author_name=author_name,
            content=safe_content,
            parent_id=parent_id,
            author_avatar=author_avatar,
            rating=rating,
            is_review=is_review,
        )

        # Insert to main table
        await self.session.aexecute(
            self._insert_comment,
            [
                comment.lesson_id,
                comment.comment_id,
                comment.parent_id,
                comment.author_id,
                comment.author_name,
                comment.author_avatar,
                comment.content,
                comment.content_history,
                comment.is_edited,
                comment.edited_at,
                comment.is_deleted,
                comment.deleted_at,
                comment.deleted_by,
                comment.delete_reason,
                comment.reply_count,
                comment.rating,
                comment.is_review,
                comment.created_at,
                comment.updated_at,
            ],
        )

        # Insert to by_parent table for efficient reply queries (only for replies)
        if parent_id:
            await self.session.aexecute(
                self._insert_comment_by_parent,
                [
                    comment.lesson_id,
                    comment.parent_id,
                    comment.comment_id,
                    comment.author_id,
                    comment.author_name,
                    comment.author_avatar,
                    comment.content,
                    comment.is_edited,
                    comment.is_deleted,
                    comment.reply_count,
                    comment.rating,
                    comment.is_review,
                    comment.created_at,
                ],
            )

        # Update parent reply count if this is a reply
        if parent_id:
            await self._increment_reply_count(lesson_id, parent_id)

        # Increment rate limit
        await self.increment_rate_limit(author_id)

        # Invalidate cache
        await self._invalidate_cache(lesson_id, parent_id)

        return comment

    async def _increment_reply_count(self, lesson_id: UUID, parent_id: UUID) -> None:
        """Increment reply count on parent comment.

        Finds the parent comment, gets its current reply_count,
        and increments it by 1.
        """
        parent = await self.find_comment_by_id(lesson_id, parent_id)
        if parent:
            new_count = parent.reply_count + 1
            await self.session.aexecute(
                self._update_reply_count,
                [new_count, lesson_id, parent.created_at, parent_id],
            )

    async def _decrement_reply_count(self, lesson_id: UUID, parent_id: UUID) -> None:
        """Decrement reply count on parent comment.

        Finds the parent comment, gets its current reply_count,
        and decrements it by 1 (minimum 0).
        """
        parent = await self.find_comment_by_id(lesson_id, parent_id)
        if parent:
            new_count = max(0, parent.reply_count - 1)
            await self.session.aexecute(
                self._update_reply_count,
                [new_count, lesson_id, parent.created_at, parent_id],
            )

    async def count_replies(self, lesson_id: UUID, comment_id: UUID) -> int:
        """Count actual replies for a comment from comments_by_parent table.

        This is more reliable than the denormalized reply_count field,
        especially for existing data where reply_count may not have been updated.

        Args:
            lesson_id: Lesson ID
            comment_id: Comment ID (parent)

        Returns:
            Number of replies
        """
        result = await self.session.aexecute(
            self._count_replies,
            [lesson_id, comment_id],
        )
        row = result[0] if result else None
        return row.count if row else 0

    async def count_comments_by_author(self, author_id: UUID) -> int:
        """Count total comments by a specific author.

        Uses the secondary index on author_id.
        Note: May be slow for users with many comments.

        Args:
            author_id: Author user ID

        Returns:
            Number of comments by the author
        """
        result = await self.session.aexecute(
            self._count_comments_by_author,
            [author_id],
        )
        row = result[0] if result else None
        return row.count if row else 0

    async def find_comment_by_id(
        self, lesson_id: UUID, comment_id: UUID
    ) -> Comment | None:
        """Find a comment by ID within a lesson.

        Used for notification lookups (parent comment author, etc).
        Searches through up to 2000 comments to find the target.

        Note: For lessons with many comments, consider adding a secondary
        index on comment_id for better performance.

        Args:
            lesson_id: Lesson ID to search in
            comment_id: Comment ID to find

        Returns:
            Comment if found, None otherwise
        """
        # Search through more comments to handle lessons with many replies
        # The query is ordered by created_at DESC, so older parent comments
        # may be far down in the results
        rows = await self.session.aexecute(
            self._get_comments_by_lesson,
            [lesson_id, 2000],
        )
        for row in rows:
            if row.comment_id == comment_id:
                return Comment.from_row(row)
        return None

    async def get_comments(
        self,
        lesson_id: UUID,
        limit: int = 20,
        cursor: str | None = None,
        user_id: UUID | None = None,
    ) -> CommentListResponse:
        """Get top-level comments for a lesson with pagination.

        Uses cursor-based pagination for efficiency.
        Returns only root comments (parent_id = None).
        """
        # Try cache first
        if self.redis and not cursor:
            cached = await self._get_cached_comments(lesson_id)
            if cached:
                return cached

        # Query with or without cursor
        if cursor:
            created_at, _comment_id = decode_cursor(cursor)
            rows = await self.session.aexecute(
                self._get_comments_by_lesson_cursor,
                [lesson_id, created_at, limit + 1],
            )
        else:
            rows = await self.session.aexecute(
                self._get_comments_by_lesson,
                [lesson_id, limit + 1],
            )

        comments = []
        for row in rows:
            # Filter to root comments only (parent_id is None)
            if row.parent_id is None and not row.is_deleted:
                comment = Comment.from_row(row)
                comments.append(comment)

        # Check if there are more
        has_more = len(comments) > limit
        if has_more:
            comments = comments[:limit]

        # Get reaction counts, user reactions, and actual reply counts
        comment_responses = []
        for comment in comments:
            reactions = await self.get_reaction_counts(comment.comment_id)
            user_reaction = None
            if user_id:
                user_reaction = await self.get_user_reaction(
                    comment.comment_id, user_id
                )
            # Use actual reply count from comments_by_parent table
            # This ensures correct count even for existing data
            actual_reply_count = await self.count_replies(
                comment.lesson_id, comment.comment_id
            )
            comment_responses.append(
                CommentResponse.from_comment(
                    comment, reactions, user_reaction, reply_count=actual_reply_count
                )
            )

        # Build response
        next_cursor = None
        if has_more and comments:
            last = comments[-1]
            next_cursor = encode_cursor(last.created_at, last.comment_id)

        # Get total count
        result = await self.session.aexecute(
            self._count_comments_by_lesson,
            [lesson_id],
        )
        count_row = result[0] if result else None
        total = count_row.count if count_row else 0

        response = CommentListResponse(
            items=comment_responses,
            total=total,
            has_more=has_more,
            next_cursor=next_cursor,
        )

        # Cache if no cursor (first page)
        if self.redis and not cursor:
            await self._cache_comments(lesson_id, response)

        return response

    async def get_replies(
        self,
        lesson_id: UUID,
        parent_id: UUID,
        limit: int = 50,
        user_id: UUID | None = None,
    ) -> list[CommentResponse]:
        """Get replies to a specific comment."""
        rows = await self.session.aexecute(
            self._get_replies,
            [lesson_id, parent_id, limit],
        )

        replies = []
        for row in rows:
            if not row.is_deleted:
                comment = CommentReply.from_row(row)
                reactions = await self.get_reaction_counts(comment.comment_id)
                user_reaction = None
                if user_id:
                    user_reaction = await self.get_user_reaction(
                        comment.comment_id, user_id
                    )

                # Get actual reply count from comments_by_parent table
                actual_reply_count = await self.count_replies(
                    comment.lesson_id, comment.comment_id
                )

                # Convert to full comment response format
                replies.append(
                    CommentResponse(
                        id=comment.comment_id,
                        lesson_id=comment.lesson_id,
                        parent_id=comment.parent_id,
                        author={
                            "id": comment.author_id,
                            "name": comment.author_name,
                            "avatar": comment.author_avatar,
                        },
                        content=comment.content,
                        is_edited=comment.is_edited,
                        is_deleted=comment.is_deleted,
                        reply_count=actual_reply_count,
                        rating=comment.rating,
                        is_review=comment.is_review or False,
                        reactions=reactions,
                        user_reaction=user_reaction,
                        created_at=comment.created_at,
                        updated_at=comment.created_at,
                    )
                )

        return replies

    async def update_comment(
        self,
        lesson_id: UUID,
        comment_id: UUID,
        created_at: datetime,
        content: str,
        user_id: UUID,
    ) -> Comment:
        """Update a comment's content.

        Checks:
        - User ownership
        - Edit window (24 hours)
        """
        # Fetch existing comment
        result = await self.session.aexecute(
            self._get_comment,
            [lesson_id, created_at, comment_id],
        )
        row = result[0] if result else None

        if not row:
            raise CommentNotFoundError

        comment = Comment.from_row(row)

        # Check ownership
        if comment.author_id != user_id:
            raise PermissionDeniedError(
                "Voce so pode editar seus proprios comentarios."
            )

        # Check edit window
        elapsed = datetime.now(UTC) - comment.created_at
        if elapsed > timedelta(hours=self.EDIT_WINDOW_HOURS):
            raise EditWindowExpiredError

        # Check if deleted
        if comment.is_deleted:
            raise CommentNotFoundError("Comentario foi removido.")

        # Sanitize new content
        safe_content = sanitize_content(content)

        # Build history entry
        history = list(comment.content_history)
        history.append(
            {
                "content": comment.content,
                "edited_at": datetime.now(UTC).isoformat(),
            }
        )

        now = datetime.now(UTC)

        # Update in database
        await self.session.aexecute(
            self._update_comment,
            [
                safe_content,
                history,
                True,
                now,
                now,
                lesson_id,
                created_at,
                comment_id,
            ],
        )

        # Update entity
        comment.content = safe_content
        comment.content_history = history
        comment.is_edited = True
        comment.edited_at = now
        comment.updated_at = now

        # Invalidate cache
        await self._invalidate_cache(lesson_id, comment.parent_id)

        return comment

    async def delete_comment(
        self,
        lesson_id: UUID,
        comment_id: UUID,
        created_at: datetime,
        user_id: UUID,
        is_moderator: bool = False,
        reason: str | None = None,
    ) -> None:
        """Soft delete a comment.

        Users can delete their own comments.
        Moderators can delete any comment with a reason.
        """
        # Fetch existing comment
        result = await self.session.aexecute(
            self._get_comment,
            [lesson_id, created_at, comment_id],
        )
        row = result[0] if result else None

        if not row:
            raise CommentNotFoundError

        comment = Comment.from_row(row)

        # Check permission
        if not is_moderator and comment.author_id != user_id:
            raise PermissionDeniedError(
                "Voce so pode excluir seus proprios comentarios."
            )

        if comment.is_deleted:
            return  # Already deleted

        now = datetime.now(UTC)
        delete_reason = reason if is_moderator else None
        deleted_by = user_id if is_moderator else None

        # Soft delete
        await self.session.aexecute(
            self._soft_delete_comment,
            [
                now,
                deleted_by,
                delete_reason,
                now,
                lesson_id,
                created_at,
                comment_id,
            ],
        )

        # Decrement reply count on parent if this is a reply
        if comment.parent_id:
            await self._decrement_reply_count(lesson_id, comment.parent_id)

        # Invalidate cache
        await self._invalidate_cache(lesson_id, comment.parent_id)

    # ==========================================================================
    # Reactions
    # ==========================================================================

    async def add_reaction(
        self,
        comment_id: UUID,
        user_id: UUID,
        reaction_type: ReactionType,
    ) -> dict[str, int]:
        """Add or change a reaction to a comment.

        If user already has a different reaction, it's replaced.
        """
        now = datetime.now(UTC)

        # Check existing reaction
        existing = await self.get_user_reaction(comment_id, user_id)

        if existing:
            if existing == reaction_type.value:
                # Same reaction - remove it (toggle)
                return await self.remove_reaction(comment_id, user_id)

            # Different reaction - remove old, add new
            await self.session.aexecute(self._delete_reaction, [comment_id, user_id])
            await self.session.aexecute(
                self._delete_user_reaction, [user_id, comment_id]
            )
            await self.session.aexecute(
                self._decr_reaction_count,
                [comment_id, existing],
            )

        # Add new reaction
        await self.session.aexecute(
            self._insert_reaction,
            [comment_id, user_id, reaction_type.value, now],
        )
        await self.session.aexecute(
            self._insert_user_reaction,
            [user_id, comment_id, reaction_type.value, now],
        )
        await self.session.aexecute(
            self._incr_reaction_count,
            [comment_id, reaction_type.value],
        )

        # Return updated counts
        return await self.get_reaction_counts(comment_id)

    async def remove_reaction(
        self,
        comment_id: UUID,
        user_id: UUID,
    ) -> dict[str, int]:
        """Remove user's reaction from a comment."""
        # Get existing reaction type
        existing = await self.get_user_reaction(comment_id, user_id)

        if existing:
            await self.session.aexecute(self._delete_reaction, [comment_id, user_id])
            await self.session.aexecute(
                self._delete_user_reaction, [user_id, comment_id]
            )
            await self.session.aexecute(
                self._decr_reaction_count,
                [comment_id, existing],
            )

        return await self.get_reaction_counts(comment_id)

    async def get_user_reaction(
        self,
        comment_id: UUID,
        user_id: UUID,
    ) -> str | None:
        """Get user's reaction to a comment, if any."""
        result = await self.session.aexecute(
            self._get_user_reaction,
            [user_id, comment_id],
        )
        row = result[0] if result else None

        return row.reaction_type if row else None

    async def get_reaction_counts(self, comment_id: UUID) -> dict[str, int]:
        """Get reaction counts for a comment."""
        # Try Redis cache first
        if self.redis:
            cached = await self.redis.hgetall(f"reactions:{comment_id}")
            if cached:
                # Handle both bytes and str keys (depends on decode_responses setting)
                return {
                    (k.decode() if isinstance(k, bytes) else k): int(v)
                    for k, v in cached.items()
                }

        # Query from DB
        rows = await self.session.aexecute(
            self._get_reaction_counts,
            [comment_id],
        )

        counts = {}
        for row in rows:
            if row.count and row.count > 0:
                counts[row.reaction_type] = row.count

        # Cache in Redis
        if self.redis and counts:
            await self.redis.hset(
                f"reactions:{comment_id}",
                mapping={k: str(v) for k, v in counts.items()},
            )
            await self.redis.expire(f"reactions:{comment_id}", 3600)

        return counts

    # ==========================================================================
    # Reports
    # ==========================================================================

    async def report_comment(
        self,
        comment_id: UUID,
        lesson_id: UUID,
        reporter_id: UUID,
        reason: ReportReason,
        description: str | None = None,
    ) -> CommentReport:
        """Report a comment for moderation."""
        # Rate limit reports
        if self.redis:
            key = f"reports:rate:{reporter_id}"
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, 3600)
            if count > self.REPORTS_PER_HOUR:
                raise RateLimitExceededError("Limite de denuncias por hora excedido.")

        report = create_report(
            comment_id=comment_id,
            lesson_id=lesson_id,
            reporter_id=reporter_id,
            reason=reason,
            description=description,
        )

        # Insert to main table
        await self.session.aexecute(
            self._insert_report,
            [
                report.report_id,
                report.comment_id,
                report.lesson_id,
                report.reporter_id,
                report.reason.value,
                report.description,
                report.status.value,
                report.moderator_id,
                report.moderator_notes,
                report.created_at,
                report.reviewed_at,
            ],
        )

        # Insert to status lookup table
        await self.session.aexecute(
            self._insert_report_by_status,
            [
                report.status.value,
                report.created_at,
                report.report_id,
                report.comment_id,
                report.lesson_id,
                report.reporter_id,
                report.reason.value,
            ],
        )

        return report

    async def get_pending_reports(self, limit: int = 50) -> list[CommentReport]:
        """Get pending reports for moderation."""
        rows = await self.session.aexecute(
            self._get_reports_by_status,
            [ReportStatus.PENDING.value, limit],
        )

        return [CommentReport.from_row(row) for row in rows]

    async def moderate_report(
        self,
        comment_id: UUID,
        report_id: UUID,
        moderator_id: UUID,
        action: str,
        notes: str | None = None,
    ) -> None:
        """Moderate a reported comment.

        Actions:
        - dismiss: Mark report as dismissed
        - remove: Soft delete the comment
        - warn: Remove comment and flag user
        """
        now = datetime.now(UTC)
        status = ReportStatus.REVIEWED

        if action == "dismiss":
            status = ReportStatus.DISMISSED
        elif action in ("remove", "warn"):
            status = ReportStatus.ACTION_TAKEN

        # Update report
        await self.session.aexecute(
            self._update_report,
            [
                status.value,
                moderator_id,
                notes,
                now,
                comment_id,
                report_id,
            ],
        )

        # If action requires comment removal, we need the comment details
        # This would be implemented in the router with full context

    # ==========================================================================
    # Rating Statistics
    # ==========================================================================

    async def get_rating_stats(self, lesson_id: UUID) -> RatingStatsResponse:
        """Get rating statistics for a lesson.

        Calculates:
        - Total number of reviews
        - Average rating (1-5)
        - Distribution of ratings per star
        """
        # Try cache first
        if self.redis:
            cached = await self.redis.get(f"rating_stats:{lesson_id}")
            if cached:
                data = json.loads(cached)
                return RatingStatsResponse(**data)

        # Query all comments with ratings for this lesson
        rows = await self.session.aexecute(
            self._get_comments_by_lesson,
            [lesson_id, 1000],  # Get up to 1000 comments
        )

        total_reviews = 0
        rating_sum = 0
        distribution = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}

        for row in rows:
            # Only count reviews (is_review=True) with a rating
            is_review = getattr(row, "is_review", False)
            rating = getattr(row, "rating", None)

            if is_review and rating is not None and not row.is_deleted:
                total_reviews += 1
                rating_sum += rating
                distribution[str(rating)] = distribution.get(str(rating), 0) + 1

        average_rating = rating_sum / total_reviews if total_reviews > 0 else 0.0

        response = RatingStatsResponse(
            lesson_id=lesson_id,
            total_reviews=total_reviews,
            average_rating=round(average_rating, 2),
            rating_distribution=distribution,
        )

        # Cache the result
        if self.redis:
            await self.redis.setex(
                f"rating_stats:{lesson_id}",
                1800,  # 30 minutes TTL
                json.dumps(response.model_dump(), default=str),
            )

        return response

    # ==========================================================================
    # Cache Management
    # ==========================================================================

    async def _get_cached_comments(self, lesson_id: UUID) -> CommentListResponse | None:
        """Get cached comments for a lesson."""
        if not self.redis:
            return None

        key = f"comments:{lesson_id}:root"
        cached = await self.redis.get(key)

        if cached:
            data = json.loads(cached)
            return CommentListResponse(**data)

        return None

    async def _cache_comments(
        self, lesson_id: UUID, response: CommentListResponse
    ) -> None:
        """Cache comments response."""
        if not self.redis:
            return

        key = f"comments:{lesson_id}:root"
        await self.redis.setex(
            key,
            3600,  # 1 hour TTL
            json.dumps(response.model_dump(), default=str),
        )

    async def _invalidate_cache(
        self, lesson_id: UUID, parent_id: UUID | None = None
    ) -> None:
        """Invalidate comment cache for a lesson."""
        if not self.redis:
            return

        # Always invalidate root
        await self.redis.delete(f"comments:{lesson_id}:root")

        # Also invalidate parent's replies cache if applicable
        if parent_id:
            await self.redis.delete(f"comments:{lesson_id}:{parent_id}")

    # ==============================================================================
    # User Blocking
    # ==============================================================================

    async def block_user(
        self,
        user_id: UUID,
        moderator_id: UUID,
        reason: str,
        moderator_notes: str | None = None,
        duration_days: int | None = None,
    ) -> "UserBlockResponse":
        """Block a user from commenting.

        Args:
            user_id: ID of user to block
            moderator_id: ID of moderator creating the block
            reason: Reason for blocking (required)
            moderator_notes: Additional notes for moderators
            duration_days: Block duration in days (None = permanent)

        Returns:
            UserBlockResponse with block details

        Raises:
            HTTPException 400: If moderator tries to block themselves
            HTTPException 409: If user already has an active block
        """
        # Security: Prevent self-blocking (DoS protection)
        if user_id == moderator_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Moderadores nao podem se auto-bloquear",
            )

        # Security: Prevent double-blocking (check for active block)
        existing_block = await self.is_user_blocked(user_id)
        if existing_block:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Usuario ja possui um bloqueio ativo",
            )

        # Security: Sanitize text inputs to prevent XSS
        reason = html.escape(reason)
        if moderator_notes:
            moderator_notes = html.escape(moderator_notes)

        # Create block entity
        block = create_user_block(
            user_id=user_id,
            blocked_by=moderator_id,
            reason=reason,
            moderator_notes=moderator_notes,
            duration_days=duration_days,
        )

        # Insert into user_comment_blocks table (async)
        insert_block = f"""
            INSERT INTO {self.keyspace}.user_comment_blocks
            (user_id, block_id, blocked_at, blocked_by, reason, moderator_notes,
             expires_at, is_permanent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        await self.session.aexecute(
            insert_block,
            [
                block.user_id,
                block.block_id,
                block.blocked_at,
                block.blocked_by,
                block.reason,
                block.moderator_notes,
                block.expires_at,
                block.is_permanent,
            ],
        )

        # Insert into moderator activity log (async)
        insert_log = f"""
            INSERT INTO {self.keyspace}.comment_blocks_by_moderator
            (moderator_id, block_id, user_id, blocked_at, reason, is_permanent)
            VALUES (?, ?, ?, ?, ?, ?)
        """
        await self.session.aexecute(
            insert_log,
            [
                moderator_id,
                block.block_id,
                user_id,
                block.blocked_at,
                reason,
                block.is_permanent,
            ],
        )

        # Create audit log for compliance
        audit_log = create_audit_log(
            moderator_id=moderator_id,
            action=ModeratorAction.BLOCK_USER,
            target_user_id=user_id,
            target_id=block.block_id,
            details=f"Reason: {reason}, Duration: {'Permanent' if block.is_permanent else f'{duration_days} days'}",
        )

        # Insert audit log (async)
        insert_audit = f"""
            INSERT INTO {self.keyspace}.moderator_audit_log
            (log_id, moderator_id, action, target_user_id, target_id, performed_at, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        await self.session.aexecute(
            insert_audit,
            [
                audit_log.log_id,
                audit_log.moderator_id,
                audit_log.action.value,
                audit_log.target_user_id,
                audit_log.target_id,
                audit_log.performed_at,
                audit_log.details,
                audit_log.ip_address,
                audit_log.user_agent,
            ],
        )

        return UserBlockResponse.from_block(block)

    async def unblock_user(
        self,
        user_id: UUID,
        block_id: UUID,
        moderator_id: UUID,
        notes: str | None = None,
    ) -> bool:
        """Unblock a user by updating block expiration.

        Args:
            user_id: ID of user to unblock
            block_id: ID of specific block to remove
            moderator_id: ID of moderator removing the block
            notes: Optional notes about the unblock

        Returns:
            True if block was found and updated, False otherwise
        """
        # Check if block exists using prepared statement (async)
        result = await self.session.aexecute(self._get_user_block, [user_id, block_id])
        row = result[0] if result else None

        if not row:
            return False

        # Update block to expire now using prepared statement (async)
        now = datetime.now(UTC)
        await self.session.aexecute(
            self._update_user_block_expires,
            [now, user_id, row.blocked_at, block_id],
        )

        # Create audit log for compliance
        audit_log = create_audit_log(
            moderator_id=moderator_id,
            action=ModeratorAction.UNBLOCK_USER,
            target_user_id=user_id,
            target_id=block_id,
            details=notes or "Block removed manually",
        )

        # Insert audit log (async)
        insert_audit = f"""
            INSERT INTO {self.keyspace}.moderator_audit_log
            (log_id, moderator_id, action, target_user_id, target_id, performed_at, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        await self.session.aexecute(
            insert_audit,
            [
                audit_log.log_id,
                audit_log.moderator_id,
                audit_log.action.value,
                audit_log.target_user_id,
                audit_log.target_id,
                audit_log.performed_at,
                audit_log.details,
                audit_log.ip_address,
                audit_log.user_agent,
            ],
        )

        return True

    async def is_user_blocked(self, user_id: UUID) -> bool:
        """Check if user is currently blocked from commenting.

        Args:
            user_id: ID of user to check

        Returns:
            True if user has an active block, False otherwise
        """
        # Get most recent block for user using prepared statement (async)
        result = await self.session.aexecute(self._check_user_blocked, [user_id])
        row = result[0] if result else None

        if not row:
            return False

        # Convert to UserCommentBlock entity
        block = UserCommentBlock.from_row(row)

        # Check if block is still active
        return block.is_active()

    async def get_user_blocks(
        self,
        user_id: UUID,
        limit: int = 20,
    ) -> "UserBlockListResponse":
        """Get all blocks for a user.

        Args:
            user_id: ID of user
            limit: Maximum number of blocks to return

        Returns:
            UserBlockListResponse with list of blocks
        """
        # Use prepared statement for user blocks query (async)
        result = await self.session.aexecute(
            self._get_user_blocks, [user_id, limit + 1]
        )
        rows = result  # aexecute() returns list directly

        # Convert to entities
        blocks = [UserCommentBlock.from_row(row) for row in rows[:limit]]

        # Convert to responses
        items = [UserBlockResponse.from_block(block) for block in blocks]

        return UserBlockListResponse(
            items=items,
            total=len(rows),
            has_more=len(rows) > limit,
        )
