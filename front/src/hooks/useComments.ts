/**
 * Comments hooks for components.
 *
 * - useComments: Access comments state and actions for a specific lesson
 * - useComment: Access actions for a specific comment
 */

import {
  selectCommentsForLesson,
  selectEditingCommentId,
  selectError,
  selectIsLoading,
  selectIsSubmitting,
  selectRepliesForComment,
  selectReplyingToId,
  useCommentsStore,
} from "@/stores/comments";
import type { CreateReportRequest, ReactionType } from "@/types/comments";
import { useCallback, useEffect } from "react";

/**
 * Main comments hook for a specific lesson.
 * Automatically fetches comments on mount.
 * @param lessonId - The lesson ID
 * @param courseSlug - Course slug for notification URLs
 * @param lessonSlug - Lesson slug for notification URLs
 */
export function useComments(lessonId: string, courseSlug: string, lessonSlug: string) {
  // Use stable action references via selectors
  const fetchComments = useCommentsStore((state) => state.fetchComments);
  const fetchMoreComments = useCommentsStore((state) => state.fetchMoreComments);
  const createCommentAction = useCommentsStore((state) => state.createComment);
  const setEditingComment = useCommentsStore((state) => state.setEditingComment);
  const setReplyingTo = useCommentsStore((state) => state.setReplyingTo);
  const clearError = useCommentsStore((state) => state.clearError);

  // Use selectors with stable fallbacks to prevent infinite loops
  const comments = useCommentsStore((state) => selectCommentsForLesson(state, lessonId));
  const isLoading = useCommentsStore(selectIsLoading);
  const isSubmitting = useCommentsStore(selectIsSubmitting);
  const error = useCommentsStore(selectError);
  const editingCommentId = useCommentsStore(selectEditingCommentId);
  const replyingToId = useCommentsStore(selectReplyingToId);

  // Fetch comments on mount - fetchComments is stable reference
  useEffect(() => {
    if (lessonId) {
      fetchComments(lessonId, false);
    }
  }, [lessonId, fetchComments]);

  // Create comment
  const createComment = useCallback(
    async (
      content: string,
      options?: { parentId?: string; rating?: number; isReview?: boolean },
    ) => {
      return createCommentAction({
        lesson_id: lessonId,
        content,
        parent_id: options?.parentId ?? null,
        course_slug: courseSlug,
        lesson_slug: lessonSlug,
        // Only include rating/is_review when provided (exactOptionalPropertyTypes)
        ...(options?.rating !== undefined && { rating: options.rating }),
        ...(options?.isReview !== undefined && { is_review: options.isReview }),
      });
    },
    [lessonId, courseSlug, lessonSlug, createCommentAction],
  );

  // Load more comments
  const loadMore = useCallback(() => {
    if (comments.hasMore && !isLoading) {
      fetchMoreComments(lessonId);
    }
  }, [comments.hasMore, isLoading, lessonId, fetchMoreComments]);

  // Refresh comments
  const refresh = useCallback(() => {
    fetchComments(lessonId, true);
  }, [lessonId, fetchComments]);

  return {
    // State
    comments: comments.items,
    total: comments.total,
    hasMore: comments.hasMore,
    isLoading,
    isSubmitting,
    error,
    editingCommentId,
    replyingToId,

    // Actions
    createComment,
    loadMore,
    refresh,
    setEditingComment,
    setReplyingTo,
    clearError,
  };
}

/**
 * Hook for a specific comment's actions.
 * Provides actions like edit, delete, react, report, and reply management.
 *
 * @param commentId - The comment ID
 * @param lessonId - The lesson ID (required for backend queries)
 * @param parentId - Parent comment ID (null for top-level comments)
 * @param createdAt - Comment creation timestamp (required for update/delete)
 * @param courseSlug - Course slug for notification URLs
 * @param lessonSlug - Lesson slug for notification URLs
 */
export function useComment(
  commentId: string,
  lessonId: string,
  parentId: string | null,
  createdAt: string,
  courseSlug: string,
  lessonSlug: string,
) {
  // Use stable action references via selectors
  const updateCommentAction = useCommentsStore((state) => state.updateComment);
  const deleteCommentAction = useCommentsStore((state) => state.deleteComment);
  const addReactionAction = useCommentsStore((state) => state.addReaction);
  const removeReactionAction = useCommentsStore((state) => state.removeReaction);
  const reportCommentAction = useCommentsStore((state) => state.reportComment);
  const fetchRepliesAction = useCommentsStore((state) => state.fetchReplies);
  const fetchMoreRepliesAction = useCommentsStore((state) => state.fetchMoreReplies);
  const setEditingComment = useCommentsStore((state) => state.setEditingComment);
  const setReplyingTo = useCommentsStore((state) => state.setReplyingTo);

  // Use selectors with stable fallbacks to prevent infinite loops
  const replies = useCommentsStore((state) => selectRepliesForComment(state, commentId));
  const editingCommentId = useCommentsStore(selectEditingCommentId);
  const replyingToId = useCommentsStore(selectReplyingToId);
  const isSubmitting = useCommentsStore(selectIsSubmitting);

  const isEditing = editingCommentId === commentId;
  const isReplying = replyingToId === commentId;

  // Update comment
  const updateComment = useCallback(
    async (content: string) => {
      return updateCommentAction(commentId, lessonId, createdAt, { content });
    },
    [commentId, lessonId, createdAt, updateCommentAction],
  );

  // Delete comment
  const deleteComment = useCallback(async () => {
    return deleteCommentAction(commentId, lessonId, createdAt, parentId);
  }, [commentId, lessonId, createdAt, parentId, deleteCommentAction]);

  // Add reaction
  const addReaction = useCallback(
    async (reactionType: ReactionType) => {
      return addReactionAction(commentId, reactionType, lessonId, parentId, courseSlug, lessonSlug);
    },
    [commentId, lessonId, parentId, courseSlug, lessonSlug, addReactionAction],
  );

  // Remove reaction
  const removeReaction = useCallback(async () => {
    return removeReactionAction(commentId, lessonId, parentId);
  }, [commentId, lessonId, parentId, removeReactionAction]);

  // Toggle reaction
  const toggleReaction = useCallback(
    async (reactionType: ReactionType, currentReaction: ReactionType | null) => {
      if (currentReaction === reactionType) {
        await removeReaction();
      } else {
        await addReaction(reactionType);
      }
    },
    [addReaction, removeReaction],
  );

  // Report comment
  const reportComment = useCallback(
    async (data: CreateReportRequest) => {
      return reportCommentAction(commentId, lessonId, data);
    },
    [commentId, lessonId, reportCommentAction],
  );

  // Fetch replies
  const fetchReplies = useCallback(() => {
    if (!replies.isLoaded) {
      fetchRepliesAction(commentId, lessonId);
    }
  }, [commentId, lessonId, replies.isLoaded, fetchRepliesAction]);

  // Load more replies
  const loadMoreReplies = useCallback(() => {
    if (replies.hasMore) {
      fetchMoreRepliesAction(commentId, lessonId);
    }
  }, [commentId, lessonId, replies.hasMore, fetchMoreRepliesAction]);

  // Start editing
  const startEditing = useCallback(() => {
    setEditingComment(commentId);
  }, [commentId, setEditingComment]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingComment(null);
  }, [setEditingComment]);

  // Start replying
  const startReplying = useCallback(() => {
    setReplyingTo(commentId);
    // Auto-load replies when starting to reply
    if (!replies.isLoaded) {
      fetchRepliesAction(commentId, lessonId);
    }
  }, [commentId, lessonId, replies.isLoaded, setReplyingTo, fetchRepliesAction]);

  // Cancel replying
  const cancelReplying = useCallback(() => {
    setReplyingTo(null);
  }, [setReplyingTo]);

  return {
    // State
    replies: replies.items,
    hasMoreReplies: replies.hasMore,
    repliesLoaded: replies.isLoaded,
    repliesLoading: replies.isLoading,
    isEditing,
    isReplying,
    isSubmitting,

    // Actions
    updateComment,
    deleteComment,
    addReaction,
    removeReaction,
    toggleReaction,
    reportComment,
    fetchReplies,
    loadMoreReplies,
    startEditing,
    cancelEditing,
    startReplying,
    cancelReplying,
  };
}

export default useComments;
