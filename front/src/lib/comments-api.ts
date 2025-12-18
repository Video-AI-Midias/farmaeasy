/**
 * API client for hierarchical comment system.
 *
 * Features:
 * - CRUD operations for comments
 * - Reactions (like, love, laugh, sad, angry)
 * - Reports and moderation
 * - Threaded replies with pagination
 */

import type {
  AddReactionRequest,
  Comment,
  CommentListResponse,
  CommentReport,
  CreateCommentRequest,
  CreateReportRequest,
  RatingStatsResponse,
  ReactionCounts,
  UpdateCommentRequest,
} from "@/types/comments";
import { api } from "./api";

// ==============================================================================
// Comments API
// ==============================================================================

export const commentsApi = {
  /**
   * Create a new comment or reply.
   */
  create: async (data: CreateCommentRequest): Promise<Comment> => {
    const response = await api.post<Comment>("/comments", data);
    return response.data;
  },

  /**
   * Get comments for a lesson (top-level only).
   */
  getByLesson: async (
    lessonId: string,
    limit = 20,
    cursor?: string,
  ): Promise<CommentListResponse> => {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    if (cursor) params.append("cursor", cursor);

    const response = await api.get<CommentListResponse>(
      `/comments/lesson/${lessonId}?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Get rating statistics for a lesson.
   */
  getRatingStats: async (lessonId: string): Promise<RatingStatsResponse> => {
    const response = await api.get<RatingStatsResponse>(
      `/comments/lesson/${lessonId}/rating-stats`,
    );
    return response.data;
  },

  /**
   * Get replies for a comment.
   * @param commentId - The comment ID to get replies for
   * @param lessonId - Required by backend for Cassandra query partition key
   * @param limit - Max replies to fetch (default 10)
   */
  getReplies: async (commentId: string, lessonId: string, limit = 10): Promise<Comment[]> => {
    const params = new URLSearchParams();
    params.append("lesson_id", lessonId);
    params.append("limit", limit.toString());

    const response = await api.get<Comment[]>(
      `/comments/${commentId}/replies?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Update a comment.
   * @param commentId - The comment ID to update
   * @param lessonId - Required for Cassandra partition key
   * @param createdAt - Required for Cassandra clustering key
   * @param data - Update payload with new content
   */
  update: async (
    commentId: string,
    lessonId: string,
    createdAt: string,
    data: UpdateCommentRequest,
  ): Promise<Comment> => {
    const params = new URLSearchParams();
    params.append("lesson_id", lessonId);
    params.append("created_at", createdAt);

    const response = await api.put<Comment>(`/comments/${commentId}?${params.toString()}`, data);
    return response.data;
  },

  /**
   * Delete a comment (soft delete).
   * @param commentId - The comment ID to delete
   * @param lessonId - Required for Cassandra partition key
   * @param createdAt - Required for Cassandra clustering key
   */
  delete: async (commentId: string, lessonId: string, createdAt: string): Promise<void> => {
    const params = new URLSearchParams();
    params.append("lesson_id", lessonId);
    params.append("created_at", createdAt);

    await api.delete(`/comments/${commentId}?${params.toString()}`);
  },

  // ==========================================================================
  // Reactions
  // ==========================================================================

  /**
   * Add or change reaction on a comment.
   * Returns updated reaction counts.
   * @param commentId - The comment ID to react to
   * @param data - Reaction type
   * @param lessonId - Required for notification context
   * @param courseSlug - Required for notification URL
   * @param lessonSlug - Required for notification URL
   */
  addReaction: async (
    commentId: string,
    data: AddReactionRequest,
    lessonId: string,
    courseSlug: string,
    lessonSlug: string,
  ): Promise<ReactionCounts> => {
    const params = new URLSearchParams();
    params.append("lesson_id", lessonId);
    params.append("course_slug", courseSlug);
    params.append("lesson_slug", lessonSlug);

    const response = await api.post<ReactionCounts>(
      `/comments/${commentId}/reactions?${params.toString()}`,
      data,
    );
    return response.data;
  },

  /**
   * Remove reaction from a comment.
   * Returns updated reaction counts.
   */
  removeReaction: async (commentId: string): Promise<ReactionCounts> => {
    const response = await api.delete<ReactionCounts>(`/comments/${commentId}/reactions`);
    return response.data;
  },

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * Report a comment for moderation.
   * @param commentId - The comment ID to report
   * @param lessonId - Required for Cassandra partition key
   * @param data - Report payload with reason and description
   */
  report: async (
    commentId: string,
    lessonId: string,
    data: CreateReportRequest,
  ): Promise<CommentReport> => {
    const params = new URLSearchParams();
    params.append("lesson_id", lessonId);

    const response = await api.post<CommentReport>(
      `/comments/${commentId}/reports?${params.toString()}`,
      data,
    );
    return response.data;
  },

  /**
   * Get pending reports (admin only).
   */
  getReports: async (
    status = "pending",
    limit = 20,
    offset = 0,
  ): Promise<{ items: CommentReport[]; total: number }> => {
    const params = new URLSearchParams();
    params.append("status", status);
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());

    const response = await api.get<{ items: CommentReport[]; total: number }>(
      `/comments/moderation/reports?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Review a report (admin only).
   */
  reviewReport: async (
    reportId: string,
    action: "dismiss" | "action_taken",
    notes?: string,
  ): Promise<CommentReport> => {
    const response = await api.put<CommentReport>(`/comments/moderation/reports/${reportId}`, {
      action,
      notes,
    });
    return response.data;
  },
};

export default commentsApi;
