/**
 * Zustand store for hierarchical comment system.
 *
 * Features:
 * - Comment CRUD with optimistic updates
 * - Threaded replies with lazy loading
 * - Reactions with instant feedback
 * - Report handling
 * - Per-lesson state management
 */

import { commentsApi } from "@/lib/comments-api";
import type {
  Comment,
  CreateCommentRequest,
  CreateReportRequest,
  ReactionType,
  UpdateCommentRequest,
} from "@/types/comments";
import { create } from "zustand";

// ==============================================================================
// Types
// ==============================================================================

interface CommentsState {
  // Comments by lesson ID (top-level comments only)
  commentsByLesson: Record<
    string,
    {
      items: Comment[];
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
    }
  >;

  // Replies by parent comment ID
  repliesByComment: Record<
    string,
    {
      items: Comment[];
      hasMore: boolean;
      nextCursor: string | null;
      isLoaded: boolean;
      isLoading: boolean; // Per-comment loading state
    }
  >;

  // UI state
  isLoading: boolean; // Global loading for lesson comments
  isSubmitting: boolean;
  error: string | null;

  // Track which comments are currently fetching replies (for parallel fetches)
  fetchingRepliesFor: Set<string>;

  // Currently editing comment
  editingCommentId: string | null;

  // Currently replying to comment
  replyingToId: string | null;
}

interface CommentsActions {
  // Fetch comments
  fetchComments: (lessonId: string, reset?: boolean) => Promise<void>;
  fetchMoreComments: (lessonId: string) => Promise<void>;
  fetchReplies: (commentId: string, lessonId: string) => Promise<void>;
  fetchMoreReplies: (commentId: string, lessonId: string) => Promise<void>;

  // CRUD
  createComment: (data: CreateCommentRequest) => Promise<Comment>;
  updateComment: (
    commentId: string,
    lessonId: string,
    createdAt: string,
    data: UpdateCommentRequest,
  ) => Promise<Comment>;
  deleteComment: (
    commentId: string,
    lessonId: string,
    createdAt: string,
    parentId: string | null,
  ) => Promise<void>;

  // Reactions
  addReaction: (
    commentId: string,
    reactionType: ReactionType,
    lessonId: string,
    parentId: string | null,
    courseSlug: string,
    lessonSlug: string,
  ) => Promise<void>;
  removeReaction: (commentId: string, lessonId: string, parentId: string | null) => Promise<void>;

  // Reports
  reportComment: (commentId: string, lessonId: string, data: CreateReportRequest) => Promise<void>;

  // UI state
  setEditingComment: (commentId: string | null) => void;
  setReplyingTo: (commentId: string | null) => void;
  clearError: () => void;
  clearLessonComments: (lessonId: string) => void;
  reset: () => void;
}

type CommentsStore = CommentsState & CommentsActions;

// ==============================================================================
// Initial State
// ==============================================================================

const initialState: CommentsState = {
  commentsByLesson: {},
  repliesByComment: {},
  isLoading: false,
  isSubmitting: false,
  error: null,
  fetchingRepliesFor: new Set<string>(),
  editingCommentId: null,
  replyingToId: null,
};

// ==============================================================================
// Helper Functions
// ==============================================================================

function updateCommentInList(comments: Comment[], updatedComment: Comment): Comment[] {
  return comments.map((c) => (c.id === updatedComment.id ? updatedComment : c));
}

function removeCommentFromList(comments: Comment[], commentId: string): Comment[] {
  return comments.filter((c) => c.id !== commentId);
}

// ==============================================================================
// Store
// ==============================================================================

export const useCommentsStore = create<CommentsStore>()((set, get) => ({
  ...initialState,

  // ==========================================================================
  // Fetch Comments
  // ==========================================================================

  fetchComments: async (lessonId: string, reset = true) => {
    const state = get();

    // Prevent duplicate requests
    if (state.isLoading) {
      return;
    }

    // If already loaded and not resetting, skip
    if (!reset && state.commentsByLesson[lessonId]?.items.length) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await commentsApi.getByLesson(lessonId, 20);

      set((prev) => ({
        commentsByLesson: {
          ...prev.commentsByLesson,
          [lessonId]: {
            items: response.items,
            total: response.total,
            hasMore: response.has_more,
            nextCursor: response.next_cursor,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar comentarios";
      set({ error: message, isLoading: false });
    }
  },

  fetchMoreComments: async (lessonId: string) => {
    const state = get();
    const lessonComments = state.commentsByLesson[lessonId];

    if (!lessonComments?.hasMore || !lessonComments.nextCursor || state.isLoading) {
      return;
    }

    set({ isLoading: true });

    try {
      const response = await commentsApi.getByLesson(lessonId, 20, lessonComments.nextCursor);

      set((prev) => ({
        commentsByLesson: {
          ...prev.commentsByLesson,
          [lessonId]: {
            items: [...(prev.commentsByLesson[lessonId]?.items ?? []), ...response.items],
            total: response.total,
            hasMore: response.has_more,
            nextCursor: response.next_cursor,
          },
        },
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar mais comentarios";
      set({ error: message, isLoading: false });
    }
  },

  fetchReplies: async (commentId: string, lessonId: string) => {
    const state = get();

    // Prevent duplicate requests for THIS comment (not global)
    if (state.fetchingRepliesFor.has(commentId)) {
      return;
    }

    // If already loaded, skip
    if (state.repliesByComment[commentId]?.isLoaded) {
      return;
    }

    // Mark this comment as fetching
    set((prev) => ({
      fetchingRepliesFor: new Set([...prev.fetchingRepliesFor, commentId]),
      repliesByComment: {
        ...prev.repliesByComment,
        [commentId]: {
          items: prev.repliesByComment[commentId]?.items ?? [],
          hasMore: prev.repliesByComment[commentId]?.hasMore ?? false,
          nextCursor: prev.repliesByComment[commentId]?.nextCursor ?? null,
          isLoaded: false,
          isLoading: true,
        },
      },
    }));

    try {
      const replies = await commentsApi.getReplies(commentId, lessonId, 10);

      set((prev) => {
        const newFetching = new Set(prev.fetchingRepliesFor);
        newFetching.delete(commentId);
        return {
          repliesByComment: {
            ...prev.repliesByComment,
            [commentId]: {
              items: replies,
              hasMore: replies.length >= 10,
              nextCursor: null, // Backend returns list, not paginated response
              isLoaded: true,
              isLoading: false,
            },
          },
          fetchingRepliesFor: newFetching,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar respostas";
      set((prev) => {
        const newFetching = new Set(prev.fetchingRepliesFor);
        newFetching.delete(commentId);
        return {
          error: message,
          fetchingRepliesFor: newFetching,
          repliesByComment: {
            ...prev.repliesByComment,
            [commentId]: {
              ...prev.repliesByComment[commentId],
              items: prev.repliesByComment[commentId]?.items ?? [],
              hasMore: prev.repliesByComment[commentId]?.hasMore ?? false,
              nextCursor: prev.repliesByComment[commentId]?.nextCursor ?? null,
              isLoaded: false,
              isLoading: false,
            },
          },
        };
      });
    }
  },

  fetchMoreReplies: async (commentId: string, lessonId: string) => {
    const state = get();
    const repliesData = state.repliesByComment[commentId];

    // Check per-comment loading and hasMore
    if (!repliesData?.hasMore || repliesData?.isLoading) {
      return;
    }

    // Prevent duplicate requests for THIS comment
    if (state.fetchingRepliesFor.has(commentId)) {
      return;
    }

    // Mark this comment as fetching
    set((prev) => ({
      fetchingRepliesFor: new Set([...prev.fetchingRepliesFor, commentId]),
      repliesByComment: {
        ...prev.repliesByComment,
        [commentId]: {
          ...prev.repliesByComment[commentId],
          items: prev.repliesByComment[commentId]?.items ?? [],
          hasMore: prev.repliesByComment[commentId]?.hasMore ?? false,
          nextCursor: prev.repliesByComment[commentId]?.nextCursor ?? null,
          isLoaded: prev.repliesByComment[commentId]?.isLoaded ?? false,
          isLoading: true,
        },
      },
    }));

    try {
      // Backend doesn't support cursor for replies, so we fetch more with higher limit
      const moreReplies = await commentsApi.getReplies(commentId, lessonId, 50);

      set((prev) => {
        const newFetching = new Set(prev.fetchingRepliesFor);
        newFetching.delete(commentId);
        return {
          repliesByComment: {
            ...prev.repliesByComment,
            [commentId]: {
              items: moreReplies,
              hasMore: false, // Loaded all available
              nextCursor: null,
              isLoaded: true,
              isLoading: false,
            },
          },
          fetchingRepliesFor: newFetching,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar mais respostas";
      set((prev) => {
        const newFetching = new Set(prev.fetchingRepliesFor);
        newFetching.delete(commentId);
        return {
          error: message,
          fetchingRepliesFor: newFetching,
          repliesByComment: {
            ...prev.repliesByComment,
            [commentId]: {
              ...prev.repliesByComment[commentId],
              items: prev.repliesByComment[commentId]?.items ?? [],
              hasMore: prev.repliesByComment[commentId]?.hasMore ?? false,
              nextCursor: prev.repliesByComment[commentId]?.nextCursor ?? null,
              isLoaded: prev.repliesByComment[commentId]?.isLoaded ?? false,
              isLoading: false,
            },
          },
        };
      });
    }
  },

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  createComment: async (data: CreateCommentRequest) => {
    set({ isSubmitting: true, error: null });

    try {
      const comment = await commentsApi.create(data);

      set((prev) => {
        // If it's a reply, add to replies
        if (data.parent_id) {
          const parentReplies = prev.repliesByComment[data.parent_id];

          // Build updated repliesByComment:
          // 1. Update reply_count on parent if it's in any repliesByComment (nested reply)
          // 2. Add the new reply to parent's replies list
          const updatedRepliesByComment: typeof prev.repliesByComment = {};

          for (const [parentId, repliesData] of Object.entries(prev.repliesByComment)) {
            updatedRepliesByComment[parentId] = {
              ...repliesData,
              items: repliesData.items.map((c) =>
                c.id === data.parent_id ? { ...c, reply_count: c.reply_count + 1 } : c,
              ),
            };
          }

          // Add the new reply to the parent's replies list
          updatedRepliesByComment[data.parent_id] = {
            items: [comment, ...(parentReplies?.items ?? [])],
            hasMore: parentReplies?.hasMore ?? false,
            nextCursor: parentReplies?.nextCursor ?? null,
            isLoaded: true,
            isLoading: false,
          };

          return {
            repliesByComment: updatedRepliesByComment,
            // Also update reply_count on parent in commentsByLesson (if it's top-level)
            commentsByLesson: Object.fromEntries(
              Object.entries(prev.commentsByLesson).map(([lessonId, lessonData]) => [
                lessonId,
                {
                  ...lessonData,
                  items: lessonData.items.map((c) =>
                    c.id === data.parent_id ? { ...c, reply_count: c.reply_count + 1 } : c,
                  ),
                },
              ]),
            ),
            isSubmitting: false,
            replyingToId: null,
          };
        }

        // Top-level comment
        const lessonData = prev.commentsByLesson[data.lesson_id];
        return {
          commentsByLesson: {
            ...prev.commentsByLesson,
            [data.lesson_id]: {
              items: [comment, ...(lessonData?.items ?? [])],
              total: (lessonData?.total ?? 0) + 1,
              hasMore: lessonData?.hasMore ?? false,
              nextCursor: lessonData?.nextCursor ?? null,
            },
          },
          isSubmitting: false,
        };
      });

      return comment;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar comentario";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  updateComment: async (
    commentId: string,
    lessonId: string,
    createdAt: string,
    data: UpdateCommentRequest,
  ) => {
    set({ isSubmitting: true, error: null });

    try {
      const updatedComment = await commentsApi.update(commentId, lessonId, createdAt, data);

      set((prev) => ({
        // Update in lesson comments
        commentsByLesson: Object.fromEntries(
          Object.entries(prev.commentsByLesson).map(([lid, lessonData]) => [
            lid,
            {
              ...lessonData,
              items: updateCommentInList(lessonData.items, updatedComment),
            },
          ]),
        ),
        // Update in replies
        repliesByComment: Object.fromEntries(
          Object.entries(prev.repliesByComment).map(([parentId, replyData]) => [
            parentId,
            {
              ...replyData,
              items: updateCommentInList(replyData.items, updatedComment),
            },
          ]),
        ),
        isSubmitting: false,
        editingCommentId: null,
      }));

      return updatedComment;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar comentario";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  deleteComment: async (
    commentId: string,
    lessonId: string,
    createdAt: string,
    parentId: string | null,
  ) => {
    set({ isSubmitting: true, error: null });

    try {
      await commentsApi.delete(commentId, lessonId, createdAt);

      set((prev) => {
        if (parentId) {
          // Delete from replies
          const parentReplies = prev.repliesByComment[parentId];
          const defaultReplies = {
            items: [] as Comment[],
            hasMore: false,
            nextCursor: null,
            isLoaded: false,
            isLoading: false,
          };
          return {
            repliesByComment: {
              ...prev.repliesByComment,
              [parentId]: {
                ...(parentReplies ?? defaultReplies),
                items: parentReplies ? removeCommentFromList(parentReplies.items, commentId) : [],
              },
            },
            // Update reply_count on parent
            commentsByLesson: {
              ...prev.commentsByLesson,
              [lessonId]: {
                items:
                  prev.commentsByLesson[lessonId]?.items.map((c) =>
                    c.id === parentId ? { ...c, reply_count: Math.max(0, c.reply_count - 1) } : c,
                  ) ?? [],
                total: prev.commentsByLesson[lessonId]?.total ?? 0,
                hasMore: prev.commentsByLesson[lessonId]?.hasMore ?? false,
                nextCursor: prev.commentsByLesson[lessonId]?.nextCursor ?? null,
              },
            },
            isSubmitting: false,
          };
        }

        // Delete from top-level
        const lessonData = prev.commentsByLesson[lessonId];
        return {
          commentsByLesson: {
            ...prev.commentsByLesson,
            [lessonId]: {
              items: lessonData ? removeCommentFromList(lessonData.items, commentId) : [],
              total: Math.max(0, (lessonData?.total ?? 1) - 1),
              hasMore: lessonData?.hasMore ?? false,
              nextCursor: lessonData?.nextCursor ?? null,
            },
          },
          // Also remove any cached replies for this comment
          repliesByComment: Object.fromEntries(
            Object.entries(prev.repliesByComment).filter(([key]) => key !== commentId),
          ),
          isSubmitting: false,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao excluir comentario";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  // ==========================================================================
  // Reactions
  // ==========================================================================

  addReaction: async (
    commentId: string,
    reactionType: ReactionType,
    lessonId: string,
    parentId: string | null,
    courseSlug: string,
    lessonSlug: string,
  ) => {
    // Optimistic update
    set((prev) => {
      const updateReaction = (comments: Comment[]) =>
        comments.map((c) => {
          if (c.id !== commentId) return c;

          const oldReaction = c.user_reaction;
          const newReactions = { ...c.reactions };

          // Remove old reaction count if exists
          if (oldReaction && newReactions[oldReaction]) {
            newReactions[oldReaction] = Math.max(0, newReactions[oldReaction] - 1);
          }

          // Add new reaction count
          newReactions[reactionType] = (newReactions[reactionType] ?? 0) + 1;

          return { ...c, reactions: newReactions, user_reaction: reactionType };
        });

      if (parentId) {
        const parentReplies = prev.repliesByComment[parentId];
        const defaultReplies = {
          items: [] as Comment[],
          hasMore: false,
          nextCursor: null,
          isLoaded: false,
          isLoading: false,
        };
        return {
          repliesByComment: {
            ...prev.repliesByComment,
            [parentId]: {
              ...(parentReplies ?? defaultReplies),
              items: parentReplies ? updateReaction(parentReplies.items) : [],
            },
          },
        };
      }

      const lessonData = prev.commentsByLesson[lessonId];
      return {
        commentsByLesson: {
          ...prev.commentsByLesson,
          [lessonId]: {
            items: lessonData ? updateReaction(lessonData.items) : [],
            total: lessonData?.total ?? 0,
            hasMore: lessonData?.hasMore ?? false,
            nextCursor: lessonData?.nextCursor ?? null,
          },
        },
      };
    });

    try {
      await commentsApi.addReaction(
        commentId,
        { reaction_type: reactionType },
        lessonId,
        courseSlug,
        lessonSlug,
      );
    } catch (error) {
      // Revert on error by refetching
      get().fetchComments(lessonId, true);
      const message = error instanceof Error ? error.message : "Erro ao adicionar reacao";
      set({ error: message });
    }
  },

  removeReaction: async (commentId: string, lessonId: string, parentId: string | null) => {
    // Optimistic update
    set((prev) => {
      const removeReactionFromComment = (comments: Comment[]) =>
        comments.map((c) => {
          if (c.id !== commentId || !c.user_reaction) return c;

          const newReactions = { ...c.reactions };
          const oldReaction = c.user_reaction;
          if (newReactions[oldReaction]) {
            newReactions[oldReaction] = Math.max(0, newReactions[oldReaction] - 1);
          }

          return { ...c, reactions: newReactions, user_reaction: null };
        });

      if (parentId) {
        const parentReplies = prev.repliesByComment[parentId];
        const defaultReplies = {
          items: [] as Comment[],
          hasMore: false,
          nextCursor: null,
          isLoaded: false,
          isLoading: false,
        };
        return {
          repliesByComment: {
            ...prev.repliesByComment,
            [parentId]: {
              ...(parentReplies ?? defaultReplies),
              items: parentReplies ? removeReactionFromComment(parentReplies.items) : [],
            },
          },
        };
      }

      const lessonData = prev.commentsByLesson[lessonId];
      return {
        commentsByLesson: {
          ...prev.commentsByLesson,
          [lessonId]: {
            items: lessonData ? removeReactionFromComment(lessonData.items) : [],
            total: lessonData?.total ?? 0,
            hasMore: lessonData?.hasMore ?? false,
            nextCursor: lessonData?.nextCursor ?? null,
          },
        },
      };
    });

    try {
      await commentsApi.removeReaction(commentId);
    } catch (error) {
      // Revert on error by refetching
      get().fetchComments(lessonId, true);
      const message = error instanceof Error ? error.message : "Erro ao remover reacao";
      set({ error: message });
    }
  },

  // ==========================================================================
  // Reports
  // ==========================================================================

  reportComment: async (commentId: string, lessonId: string, data: CreateReportRequest) => {
    set({ isSubmitting: true, error: null });

    try {
      await commentsApi.report(commentId, lessonId, data);
      set({ isSubmitting: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao reportar comentario";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  // ==========================================================================
  // UI State
  // ==========================================================================

  setEditingComment: (commentId: string | null) => {
    set({ editingCommentId: commentId, replyingToId: null });
  },

  setReplyingTo: (commentId: string | null) => {
    set({ replyingToId: commentId, editingCommentId: null });
  },

  clearError: () => set({ error: null }),

  clearLessonComments: (lessonId: string) => {
    set((prev) => {
      const { [lessonId]: _, ...restLesson } = prev.commentsByLesson;
      return { commentsByLesson: restLesson };
    });
  },

  reset: () => set(initialState),
}));

// ==============================================================================
// Selectors
// ==============================================================================

// Stable default values to prevent infinite loops from new object references
const EMPTY_LESSON_COMMENTS = Object.freeze({
  items: [] as Comment[],
  total: 0,
  hasMore: false,
  nextCursor: null,
});

const EMPTY_REPLIES = Object.freeze({
  items: [] as Comment[],
  hasMore: false,
  nextCursor: null,
  isLoaded: false,
  isLoading: false,
});

/**
 * Get comments for a lesson with stable fallback.
 * Usage: useCommentsStore((state) => selectCommentsForLesson(state, lessonId))
 */
export const selectCommentsForLesson = (state: CommentsStore, lessonId: string) =>
  state.commentsByLesson[lessonId] ?? EMPTY_LESSON_COMMENTS;

/**
 * Get replies for a comment with stable fallback.
 * Usage: useCommentsStore((state) => selectRepliesForComment(state, commentId))
 */
export const selectRepliesForComment = (state: CommentsStore, commentId: string) =>
  state.repliesByComment[commentId] ?? EMPTY_REPLIES;

export const selectIsLoading = (state: CommentsStore) => state.isLoading;
export const selectIsSubmitting = (state: CommentsStore) => state.isSubmitting;
export const selectError = (state: CommentsStore) => state.error;
export const selectEditingCommentId = (state: CommentsStore) => state.editingCommentId;
export const selectReplyingToId = (state: CommentsStore) => state.replyingToId;

export default useCommentsStore;
