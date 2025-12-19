"""Pydantic schemas for comment system.

Request/Response models with validation for:
- Comment CRUD operations
- Reactions
- Reports and moderation
- Pagination with cursor support
"""

import base64
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ==============================================================================
# Enums (re-exported for convenience)
# ==============================================================================
from .models import ReactionType, ReportReason, ReportStatus


# ==============================================================================
# Constants
# ==============================================================================
MIN_RATING = 1
MAX_RATING = 5

# ==============================================================================
# Request Schemas
# ==============================================================================


class CreateCommentRequest(BaseModel):
    """Request to create a new comment."""

    lesson_id: UUID
    parent_id: UUID | None = None
    content: str = Field(..., min_length=1, max_length=10000)
    # Required for notification URLs when @mentioning users
    course_slug: str = Field(..., min_length=1, max_length=200)
    lesson_slug: str = Field(..., min_length=1, max_length=200)
    # Rating fields for lesson reviews (1-5 stars)
    rating: int | None = Field(None, ge=1, le=5, description="Rating from 1 to 5 stars")
    is_review: bool = Field(
        False, description="Whether this comment is a lesson review"
    )

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        """Strip whitespace and validate content."""
        v = v.strip()
        if not v:
            msg = "Content cannot be empty"
            raise ValueError(msg)
        return v

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int | None) -> int | None:
        """Validate rating is between MIN_RATING and MAX_RATING."""
        if v is not None and (v < MIN_RATING or v > MAX_RATING):
            msg = f"Rating must be between {MIN_RATING} and {MAX_RATING}"
            raise ValueError(msg)
        return v


class UpdateCommentRequest(BaseModel):
    """Request to update a comment."""

    content: str = Field(..., min_length=1, max_length=10000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        """Strip whitespace and validate content."""
        v = v.strip()
        if not v:
            msg = "Content cannot be empty"
            raise ValueError(msg)
        return v


class AddReactionRequest(BaseModel):
    """Request to add a reaction to a comment."""

    reaction_type: ReactionType


class CreateReportRequest(BaseModel):
    """Request to report a comment."""

    reason: ReportReason
    description: str | None = Field(None, max_length=1000)


class ModerateReportRequest(BaseModel):
    """Request to moderate a reported comment."""

    action: str = Field(..., pattern="^(dismiss|remove|warn)$")
    notes: str | None = Field(None, max_length=1000)


class BlockUserRequest(BaseModel):
    """Request to block a user from commenting."""

    reason: str = Field(..., min_length=1, max_length=500)
    moderator_notes: str | None = Field(None, max_length=1000)
    duration_days: int | None = Field(
        None,
        ge=1,
        le=365,
        description="Duration in days (None for permanent)",
    )

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        """Strip whitespace and validate reason."""
        v = v.strip()
        if not v:
            msg = "Reason cannot be empty"
            raise ValueError(msg)
        return v


class UnblockUserRequest(BaseModel):
    """Request to unblock a user."""

    notes: str | None = Field(None, max_length=1000)


# ==============================================================================
# Response Schemas
# ==============================================================================


class AuthorResponse(BaseModel):
    """Author information in comment response."""

    id: UUID
    name: str
    avatar: str | None = None


class ReactionCountsResponse(BaseModel):
    """Reaction counts for a comment."""

    like: int = 0
    love: int = 0
    laugh: int = 0
    sad: int = 0
    angry: int = 0
    total: int = 0


class CommentResponse(BaseModel):
    """Response for a single comment."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lesson_id: UUID
    parent_id: UUID | None = None
    author: AuthorResponse
    content: str
    is_edited: bool = False
    edited_at: datetime | None = None
    is_deleted: bool = False
    reply_count: int = 0
    rating: int | None = None
    is_review: bool = False
    reactions: ReactionCountsResponse = Field(default_factory=ReactionCountsResponse)
    user_reaction: ReactionType | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_comment(
        cls,
        comment: Any,
        reactions: dict[str, int] | None = None,
        user_reaction: str | None = None,
        reply_count: int | None = None,
    ) -> "CommentResponse":
        """Create response from Comment entity.

        Args:
            comment: Comment entity
            reactions: Reaction counts by type
            user_reaction: Current user's reaction type
            reply_count: Override for reply_count (uses actual count if provided)
        """
        # Handle deleted comments
        content = comment.content
        if comment.is_deleted:
            content = "[Comentario removido]"
            if comment.delete_reason:
                content = f"[Removido: {comment.delete_reason}]"

        # Build reaction counts
        reaction_counts = ReactionCountsResponse()
        if reactions:
            reaction_counts = ReactionCountsResponse(
                like=reactions.get("like", 0),
                love=reactions.get("love", 0),
                laugh=reactions.get("laugh", 0),
                sad=reactions.get("sad", 0),
                angry=reactions.get("angry", 0),
                total=sum(reactions.values()),
            )

        # Use provided reply_count if given, otherwise use from comment
        actual_reply_count = (
            reply_count if reply_count is not None else comment.reply_count
        )

        # Get rating fields (handle None values from database)
        rating = getattr(comment, "rating", None)
        # is_review can be None in database for old comments, default to False
        is_review = getattr(comment, "is_review", False) or False

        return cls(
            id=comment.comment_id,
            lesson_id=comment.lesson_id,
            parent_id=comment.parent_id,
            author=AuthorResponse(
                id=comment.author_id,
                name=comment.author_name,
                avatar=comment.author_avatar,
            ),
            content=content,
            is_edited=comment.is_edited,
            edited_at=comment.edited_at,
            is_deleted=comment.is_deleted,
            reply_count=actual_reply_count,
            rating=rating,
            is_review=is_review,
            reactions=reaction_counts,
            user_reaction=ReactionType(user_reaction) if user_reaction else None,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
        )


class CommentWithRepliesResponse(CommentResponse):
    """Comment with nested replies."""

    replies: list["CommentResponse"] = Field(default_factory=list)


class CommentListResponse(BaseModel):
    """Paginated list of comments."""

    items: list[CommentResponse]
    total: int
    has_more: bool
    next_cursor: str | None = None


class ReportResponse(BaseModel):
    """Response for a comment report."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    comment_id: UUID
    lesson_id: UUID
    reporter_id: UUID
    reason: ReportReason
    description: str | None
    status: ReportStatus
    moderator_id: UUID | None = None
    moderator_notes: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    @classmethod
    def from_report(cls, report: Any) -> "ReportResponse":
        """Create response from CommentReport entity."""
        return cls(
            id=report.report_id,
            comment_id=report.comment_id,
            lesson_id=report.lesson_id,
            reporter_id=report.reporter_id,
            reason=report.reason,
            description=report.description,
            status=report.status,
            moderator_id=report.moderator_id,
            moderator_notes=report.moderator_notes,
            created_at=report.created_at,
            reviewed_at=report.reviewed_at,
        )


class ReportListResponse(BaseModel):
    """Paginated list of reports."""

    items: list[ReportResponse]
    total: int
    has_more: bool


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
    success: bool = True


class RatingStatsResponse(BaseModel):
    """Rating statistics for a lesson."""

    lesson_id: UUID
    total_reviews: int = 0
    average_rating: float = 0.0
    rating_distribution: dict[str, int] = Field(
        default_factory=lambda: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    )


class UserBlockResponse(BaseModel):
    """Response for a user comment block."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    blocked_at: datetime
    blocked_by: UUID
    blocked_by_name: str | None = None
    reason: str
    moderator_notes: str | None = None
    expires_at: datetime | None = None
    is_permanent: bool
    is_active: bool

    @classmethod
    def from_block(
        cls, block: Any, moderator_name: str | None = None
    ) -> "UserBlockResponse":
        """Create response from UserCommentBlock entity.

        Args:
            block: UserCommentBlock entity
            moderator_name: Name of the moderator who created the block
        """
        return cls(
            id=block.block_id,
            user_id=block.user_id,
            blocked_at=block.blocked_at,
            blocked_by=block.blocked_by,
            blocked_by_name=moderator_name,
            reason=block.reason,
            moderator_notes=block.moderator_notes,
            expires_at=block.expires_at,
            is_permanent=block.is_permanent,
            is_active=block.is_active(),
        )


class UserBlockListResponse(BaseModel):
    """Paginated list of user blocks."""

    items: list[UserBlockResponse]
    total: int
    has_more: bool


# ==============================================================================
# Pagination Helpers
# ==============================================================================


def encode_cursor(created_at: datetime, comment_id: UUID) -> str:
    """Encode pagination cursor."""
    data = {
        "created_at": created_at.isoformat(),
        "comment_id": str(comment_id),
    }
    json_str = json.dumps(data)
    return base64.urlsafe_b64encode(json_str.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    """Decode pagination cursor."""
    json_str = base64.urlsafe_b64decode(cursor.encode()).decode()
    data = json.loads(json_str)
    return (
        datetime.fromisoformat(data["created_at"]),
        UUID(data["comment_id"]),
    )
