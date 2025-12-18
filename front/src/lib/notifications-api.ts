/**
 * API client for notification system.
 *
 * Features:
 * - List user notifications with pagination
 * - Get unread count
 * - Mark notifications as read
 */

import type {
  MarkReadRequest,
  MarkReadResponse,
  NotificationListResponse,
  UnreadCountResponse,
} from "@/types/notifications";
import { api } from "./api";

// ==============================================================================
// Notifications API
// ==============================================================================

export const notificationsApi = {
  /**
   * Get notifications for the current user.
   * @param limit - Max notifications to fetch (default 20)
   * @param cursor - Pagination cursor
   * @param unreadOnly - Only return unread notifications
   */
  list: async (
    limit = 20,
    cursor?: string,
    unreadOnly = false,
  ): Promise<NotificationListResponse> => {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    if (cursor) params.append("cursor", cursor);
    if (unreadOnly) params.append("unread_only", "true");

    const response = await api.get<NotificationListResponse>(`/notifications?${params.toString()}`);
    return response.data;
  },

  /**
   * Get unread notification count.
   */
  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    const response = await api.get<UnreadCountResponse>("/notifications/unread-count");
    return response.data;
  },

  /**
   * Mark specific notifications as read.
   * @param notificationIds - Array of notification IDs to mark as read
   */
  markRead: async (notificationIds: string[]): Promise<MarkReadResponse> => {
    const data: MarkReadRequest = { notification_ids: notificationIds };
    const response = await api.post<MarkReadResponse>("/notifications/mark-read", data);
    return response.data;
  },

  /**
   * Mark all notifications as read.
   */
  markAllRead: async (): Promise<MarkReadResponse> => {
    const response = await api.post<MarkReadResponse>("/notifications/mark-all-read", {});
    return response.data;
  },

  // ==============================================================================
  // Admin API
  // ==============================================================================

  /**
   * Send notification to specific users (Admin only).
   * @param title - Notification title
   * @param message - Notification message
   * @param userIds - Array of user IDs to notify
   */
  adminSendToUsers: async (
    title: string,
    message: string,
    userIds: string[],
  ): Promise<AdminNotificationResponse> => {
    const response = await api.post<AdminNotificationResponse>("/admin/notifications", {
      title,
      message,
      user_ids: userIds,
    });
    return response.data;
  },

  /**
   * Broadcast notification to all users or by role (Admin only).
   * @param title - Notification title
   * @param message - Notification message
   * @param target - Target audience: 'all', 'students', 'teachers'
   */
  adminBroadcast: async (
    title: string,
    message: string,
    target: "all" | "students" | "teachers",
  ): Promise<AdminNotificationResponse> => {
    const response = await api.post<AdminNotificationResponse>("/admin/notifications/broadcast", {
      title,
      message,
      target,
    });
    return response.data;
  },
};

// ==============================================================================
// Types
// ==============================================================================

export interface AdminNotificationResponse {
  success: boolean;
  sent_count: number;
  message: string;
}

export default notificationsApi;
