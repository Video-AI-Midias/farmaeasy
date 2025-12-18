"""Comment system API endpoints.

Provides routes for:
- Comment CRUD (create, read, update, delete)
- Replies management
- Reactions (like, love, etc.)
- Reports and moderation
- Notifications for @mentions and replies
"""

import contextlib
from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Query, status

from src.auth.dependencies import AdminUser, CurrentUser, OptionalUser

from .dependencies import (
    AuthServiceDep,
    CommentServiceDep,
    NotificationServiceDep,
    handle_comment_error,
    is_moderator,
)
from .schemas import (
    AddReactionRequest,
    CommentListResponse,
    CommentResponse,
    CreateCommentRequest,
    CreateReportRequest,
    MessageResponse,
    ModerateReportRequest,
    RatingStatsResponse,
    ReportListResponse,
    ReportResponse,
    UpdateCommentRequest,
)
from .service import (
    CommentError,
    CommentNotFoundError,
)


logger = structlog.get_logger(__name__)


router = APIRouter(prefix="/v1/comments", tags=["comments"])


@router.post(
    "",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create comment",
)
async def create_comment(
    data: CreateCommentRequest,
    comment_service: CommentServiceDep,
    notification_service: NotificationServiceDep,
    auth_service: AuthServiceDep,
    user: CurrentUser,
) -> CommentResponse:
    """Create a new comment on a lesson.

    Rate limited to 10/min, 100/hour per user.
    Content is sanitized and checked for spam.
    Processes @mentions and creates notifications.
    """
    try:
        user_name = user.name or user.email.split("@")[0]
        user_avatar = getattr(user, "avatar_url", None)
        author_id = UUID(str(user.id))

        comment = await comment_service.create_comment(
            lesson_id=data.lesson_id,
            author_id=author_id,
            author_name=user_name,
            content=data.content,
            parent_id=data.parent_id,
            author_avatar=user_avatar,
            rating=data.rating,
            is_review=data.is_review,
        )

        # Process notifications in background (don't fail comment creation)
        if notification_service and auth_service:
            try:
                # Process @mentions and create notifications
                async def user_lookup(name: str):
                    """Lookup user by name for @mention resolution."""
                    return auth_service.get_user_by_name(name)

                await notification_service.process_mentions(
                    content=data.content,
                    author_id=author_id,
                    author_name=user_name,
                    comment_id=comment.comment_id,
                    lesson_id=data.lesson_id,
                    course_slug=data.course_slug,
                    lesson_slug=data.lesson_slug,
                    author_avatar=user_avatar,
                    user_lookup_fn=user_lookup,
                )

                # Notify parent comment author if this is a reply
                if data.parent_id:
                    # Find parent comment author
                    parent_comment = comment_service.find_comment_by_id(
                        data.lesson_id, data.parent_id
                    )
                    if parent_comment:
                        await notification_service.notify_reply(
                            comment_author_id=parent_comment.author_id,
                            replier_id=author_id,
                            replier_name=user_name,
                            reply_comment_id=comment.comment_id,
                            parent_comment_id=data.parent_id,
                            lesson_id=data.lesson_id,
                            course_slug=data.course_slug,
                            lesson_slug=data.lesson_slug,
                            reply_content=data.content,
                            replier_avatar=user_avatar,
                        )

            except Exception as notif_error:
                # Log but don't fail the comment creation
                logger.warning(
                    "notification_processing_failed",
                    error=str(notif_error),
                    comment_id=str(comment.comment_id),
                )

        # Get reactions (empty for new comment)
        reactions = await comment_service.get_reaction_counts(comment.comment_id)

        return CommentResponse.from_comment(comment, reactions)

    except CommentError as e:
        raise handle_comment_error(e) from e


@router.get(
    "/lesson/{lesson_id}",
    response_model=CommentListResponse,
    summary="List lesson comments",
)
async def list_lesson_comments(
    lesson_id: UUID,
    comment_service: CommentServiceDep,
    user: OptionalUser,
    limit: int = Query(default=20, le=100, ge=1),
    cursor: str | None = None,
) -> CommentListResponse:
    """Get top-level comments for a lesson.

    Uses cursor-based pagination for efficiency.
    Returns only root comments (no replies).
    """
    user_id = UUID(str(user.id)) if user else None

    return await comment_service.get_comments(
        lesson_id=lesson_id,
        limit=limit,
        cursor=cursor,
        user_id=user_id,
    )


@router.get(
    "/lesson/{lesson_id}/rating-stats",
    response_model=RatingStatsResponse,
    summary="Get lesson rating statistics",
)
async def get_lesson_rating_stats(
    lesson_id: UUID,
    comment_service: CommentServiceDep,
) -> RatingStatsResponse:
    """Get rating statistics for a lesson.

    Returns:
    - Total number of reviews
    - Average rating (1-5)
    - Distribution of ratings per star
    """
    return await comment_service.get_rating_stats(lesson_id)


@router.get(
    "/{comment_id}/replies",
    response_model=list[CommentResponse],
    summary="Get comment replies",
)
async def get_comment_replies(
    comment_id: UUID,
    lesson_id: UUID,
    comment_service: CommentServiceDep,
    user: OptionalUser,
    limit: int = Query(default=50, le=100, ge=1),
) -> list[CommentResponse]:
    """Get replies to a specific comment.

    Returns direct children only (not nested).
    """
    user_id = UUID(str(user.id)) if user else None

    return await comment_service.get_replies(
        lesson_id=lesson_id,
        parent_id=comment_id,
        limit=limit,
        user_id=user_id,
    )


@router.put(
    "/{comment_id}",
    response_model=CommentResponse,
    summary="Update comment",
)
async def update_comment(
    comment_id: UUID,
    data: UpdateCommentRequest,
    comment_service: CommentServiceDep,
    user: CurrentUser,
    lesson_id: UUID = Query(..., description="Lesson ID for comment lookup"),
    created_at: datetime = Query(..., description="Comment creation timestamp"),
) -> CommentResponse:
    """Update a comment's content.

    Can only update own comments within 24 hours of creation.
    Previous content is stored in edit history.
    """
    try:
        comment = await comment_service.update_comment(
            lesson_id=lesson_id,
            comment_id=comment_id,
            created_at=created_at,
            content=data.content,
            user_id=UUID(str(user.id)),
        )

        reactions = await comment_service.get_reaction_counts(comment.comment_id)
        user_reaction = await comment_service.get_user_reaction(
            comment.comment_id, UUID(str(user.id))
        )

        return CommentResponse.from_comment(comment, reactions, user_reaction)

    except CommentError as e:
        raise handle_comment_error(e) from e


@router.delete(
    "/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete comment",
)
async def delete_comment(
    comment_id: UUID,
    comment_service: CommentServiceDep,
    user: CurrentUser,
    lesson_id: UUID = Query(..., description="Lesson ID for comment lookup"),
    created_at: datetime = Query(..., description="Comment creation timestamp"),
    reason: str | None = Query(None, description="Deletion reason (moderators only)"),
) -> None:
    """Soft delete a comment.

    Users can delete their own comments.
    Moderators can delete any comment with a reason.
    """
    try:
        await comment_service.delete_comment(
            lesson_id=lesson_id,
            comment_id=comment_id,
            created_at=created_at,
            user_id=UUID(str(user.id)),
            is_moderator=is_moderator(user),
            reason=reason,
        )
    except CommentError as e:
        raise handle_comment_error(e) from e


@router.post(
    "/{comment_id}/reactions",
    response_model=dict[str, int],
    summary="Add or toggle reaction",
)
async def add_reaction(
    comment_id: UUID,
    data: AddReactionRequest,
    comment_service: CommentServiceDep,
    notification_service: NotificationServiceDep,
    user: CurrentUser,
    lesson_id: UUID = Query(..., description="Lesson ID for notification context"),
    course_slug: str = Query(..., description="Course slug for notification URL"),
    lesson_slug: str = Query(..., description="Lesson slug for notification URL"),
) -> dict[str, int]:
    """Add or toggle a reaction on a comment.

    If user already has the same reaction, it's removed (toggle).
    If user has a different reaction, it's replaced.
    Notifies the comment author about the reaction.
    """
    try:
        reactor_id = UUID(str(user.id))
        reactor_name = user.name or user.email.split("@")[0]
        reactor_avatar = getattr(user, "avatar_url", None)

        # Check if user already has this reaction (toggle behavior)
        existing_reaction = await comment_service.get_user_reaction(
            comment_id, reactor_id
        )
        is_toggle_off = existing_reaction == data.reaction_type.value

        result = await comment_service.add_reaction(
            comment_id=comment_id,
            user_id=reactor_id,
            reaction_type=data.reaction_type,
        )

        # Send notification only if adding new reaction (not toggling off)
        if notification_service and not is_toggle_off:
            try:
                # Find comment author to notify
                target_comment = comment_service.find_comment_by_id(
                    lesson_id, comment_id
                )
                if target_comment:
                    await notification_service.notify_reaction(
                        comment_author_id=target_comment.author_id,
                        reactor_id=reactor_id,
                        reactor_name=reactor_name,
                        reaction_type=data.reaction_type.value,
                        comment_id=comment_id,
                        lesson_id=lesson_id,
                        course_slug=course_slug,
                        lesson_slug=lesson_slug,
                        reactor_avatar=reactor_avatar,
                    )
            except Exception as notif_error:
                logger.warning(
                    "reaction_notification_failed",
                    error=str(notif_error),
                    comment_id=str(comment_id),
                )

        return result
    except CommentError as e:
        raise handle_comment_error(e) from e


@router.delete(
    "/{comment_id}/reactions",
    response_model=dict[str, int],
    summary="Remove reaction",
)
async def remove_reaction(
    comment_id: UUID,
    comment_service: CommentServiceDep,
    user: CurrentUser,
) -> dict[str, int]:
    """Remove user's reaction from a comment."""
    try:
        return await comment_service.remove_reaction(
            comment_id=comment_id,
            user_id=UUID(str(user.id)),
        )
    except CommentError as e:
        raise handle_comment_error(e) from e


@router.get(
    "/{comment_id}/reactions",
    response_model=dict[str, int],
    summary="Get reaction counts",
)
async def get_reaction_counts(
    comment_id: UUID,
    comment_service: CommentServiceDep,
) -> dict[str, int]:
    """Get reaction counts for a comment."""
    return await comment_service.get_reaction_counts(comment_id)


@router.post(
    "/{comment_id}/reports",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Report comment",
)
async def report_comment(
    comment_id: UUID,
    data: CreateReportRequest,
    comment_service: CommentServiceDep,
    user: CurrentUser,
    lesson_id: UUID = Query(..., description="Lesson ID for comment lookup"),
) -> ReportResponse:
    """Report a comment for moderation.

    Limited to 5 reports per hour per user.
    """
    try:
        report = await comment_service.report_comment(
            comment_id=comment_id,
            lesson_id=lesson_id,
            reporter_id=UUID(str(user.id)),
            reason=data.reason,
            description=data.description,
        )
        return ReportResponse.from_report(report)
    except CommentError as e:
        raise handle_comment_error(e) from e


@router.get(
    "/moderation/reports",
    response_model=ReportListResponse,
    summary="List pending reports",
)
async def list_pending_reports(
    comment_service: CommentServiceDep,
    _user: AdminUser,  # Required for auth, not used in function body
    limit: int = Query(default=50, le=100, ge=1),
) -> ReportListResponse:
    """Get pending reports for moderation.

    Requires ADMIN or TEACHER role.
    The _user parameter is used for authorization via AdminUser dependency.
    """
    reports = await comment_service.get_pending_reports(limit)

    return ReportListResponse(
        items=[ReportResponse.from_report(r) for r in reports],
        total=len(reports),
        has_more=len(reports) >= limit,
    )


@router.post(
    "/moderation/reports/{report_id}",
    response_model=MessageResponse,
    summary="Moderate report",
)
async def moderate_report(
    report_id: UUID,
    data: ModerateReportRequest,
    comment_service: CommentServiceDep,
    user: AdminUser,
    comment_id: UUID = Query(..., description="Comment ID being reported"),
    lesson_id: UUID = Query(..., description="Lesson ID for comment lookup"),
    created_at: datetime = Query(..., description="Comment creation timestamp"),
) -> MessageResponse:
    """Take action on a reported comment.

    Actions:
    - dismiss: Close report without action
    - remove: Soft delete the comment
    - warn: Remove comment (flag user in future)

    Requires ADMIN or TEACHER role.
    """
    # Moderate the report
    await comment_service.moderate_report(
        comment_id=comment_id,
        report_id=report_id,
        moderator_id=UUID(str(user.id)),
        action=data.action,
        notes=data.notes,
    )

    # If action requires comment removal
    if data.action in ("remove", "warn"):
        with contextlib.suppress(CommentNotFoundError):
            await comment_service.delete_comment(
                lesson_id=lesson_id,
                comment_id=comment_id,
                created_at=created_at,
                user_id=UUID(str(user.id)),
                is_moderator=True,
                reason=f"Removido por moderacao: {data.notes or 'Sem detalhes'}",
            )

    return MessageResponse(
        message=f"Denuncia processada com acao: {data.action}",
        success=True,
    )
