/**
 * Types for the notification system.
 *
 * Supports:
 * - Mentions (@username)
 * - Replies to comments
 * - Reactions on comments
 * - System notifications
 */

// Notification types
export const NotificationTypes = {
  MENTION: "mention",
  REPLY: "reply",
  REACTION: "reaction",
  SYSTEM: "system",
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];

// Actor info embedded in notification
export interface NotificationActor {
  id: string;
  name: string;
  avatar: string | null;
}

// Single notification from API
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actor: NotificationActor | null;
  reference_id: string | null;
  reference_type: string | null;
  reference_url: string | null;
  lesson_id: string | null;
  course_slug: string | null;
  lesson_slug: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// Notification list response with pagination
export interface NotificationListResponse {
  items: Notification[];
  total: number;
  has_more: boolean;
  next_cursor: string | null;
  unread_count: number;
}

// Unread count response
export interface UnreadCountResponse {
  count: number;
}

// Mark read request
export interface MarkReadRequest {
  notification_ids: string[];
}

// Mark read response
export interface MarkReadResponse {
  marked_count: number;
  unread_count: number;
}

// Notification type labels for UI
export const notificationTypeLabels: Record<NotificationType, string> = {
  mention: "Mencao",
  reply: "Resposta",
  reaction: "Reacao",
  system: "Sistema",
};

// Notification type icons (Lucide icon names)
export const notificationTypeIcons: Record<NotificationType, string> = {
  mention: "AtSign",
  reply: "MessageSquare",
  reaction: "Heart",
  system: "Bell",
};
