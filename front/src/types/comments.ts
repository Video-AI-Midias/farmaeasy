/**
 * Types for the hierarchical comment system.
 *
 * Supports:
 * - Comments with replies (tree structure)
 * - Reactions (like, love, etc.)
 * - Reports for moderation
 */

// Reaction types available
export const ReactionTypes = {
  LIKE: "like",
  LOVE: "love",
  LAUGH: "laugh",
  SAD: "sad",
  ANGRY: "angry",
} as const;

export type ReactionType = (typeof ReactionTypes)[keyof typeof ReactionTypes];

// Report reasons
export const ReportReasons = {
  SPAM: "spam",
  HARASSMENT: "harassment",
  HATE_SPEECH: "hate_speech",
  MISINFORMATION: "misinformation",
  INAPPROPRIATE: "inappropriate",
  OTHER: "other",
} as const;

export type ReportReason = (typeof ReportReasons)[keyof typeof ReportReasons];

// Report status
export type ReportStatus = "pending" | "reviewed" | "dismissed" | "action_taken";

// Author info embedded in comment
export interface CommentAuthor {
  id: string;
  name: string;
  avatar: string | null;
}

// Reaction counts
export type ReactionCounts = Record<ReactionType, number>;

// Comment response from API
export interface Comment {
  id: string;
  lesson_id: string;
  parent_id: string | null;
  author: CommentAuthor;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  reply_count: number;
  rating: number | null;
  is_review: boolean;
  reactions: ReactionCounts;
  user_reaction: ReactionType | null;
  created_at: string;
}

// Comment list response with pagination
export interface CommentListResponse {
  items: Comment[];
  total: number;
  has_more: boolean;
  next_cursor: string | null;
}

// Create comment request
export interface CreateCommentRequest {
  lesson_id: string;
  content: string;
  parent_id?: string | null;
  // Required for notification URLs
  course_slug: string;
  lesson_slug: string;
  // Rating fields for lesson reviews (1-5 stars)
  rating?: number;
  is_review?: boolean;
}

// Update comment request
export interface UpdateCommentRequest {
  content: string;
}

// Add reaction request
export interface AddReactionRequest {
  reaction_type: ReactionType;
}

// Report request
export interface CreateReportRequest {
  reason: ReportReason;
  description?: string;
}

// Report response
export interface CommentReport {
  id: string;
  comment_id: string;
  lesson_id: string;
  reporter_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  moderator_id: string | null;
  moderator_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// Message response for operations
export interface MessageResponse {
  message: string;
  success: boolean;
}

// Rating statistics response
export interface RatingStatsResponse {
  lesson_id: string;
  total_reviews: number;
  average_rating: number;
  rating_distribution: Record<string, number>;
}

// Reaction labels for UI
export const reactionLabels: Record<ReactionType, string> = {
  like: "Curtir",
  love: "Amei",
  laugh: "Haha",
  sad: "Triste",
  angry: "Raiva",
};

// Reaction emojis for UI
export const reactionEmojis: Record<ReactionType, string> = {
  like: "\u{1F44D}",
  love: "\u{2764}\u{FE0F}",
  laugh: "\u{1F602}",
  sad: "\u{1F622}",
  angry: "\u{1F620}",
};

// Report reason labels for UI
export const reportReasonLabels: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Assedio",
  hate_speech: "Discurso de odio",
  misinformation: "Desinformacao",
  inappropriate: "Conteudo inapropriado",
  other: "Outro",
};
