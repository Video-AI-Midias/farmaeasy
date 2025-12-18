/**
 * Zustand store for notification system.
 *
 * Features:
 * - Real-time unread count (polled or WebSocket)
 * - Notification list with pagination
 * - Mark as read (single or all)
 * - Optimistic updates
 */

import { notificationsApi } from "@/lib/notifications-api";
import type { Notification } from "@/types/notifications";
import { create } from "zustand";

// ==============================================================================
// Types
// ==============================================================================

interface NotificationsState {
  // Notifications list
  notifications: Notification[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;

  // Unread count (badge)
  unreadCount: number;

  // UI state
  isLoading: boolean;
  isOpen: boolean;
  error: string | null;

  // Polling
  lastFetch: number | null;
}

interface NotificationsActions {
  // Fetch notifications
  fetchNotifications: (reset?: boolean) => Promise<void>;
  fetchMoreNotifications: () => Promise<void>;

  // Unread count
  fetchUnreadCount: () => Promise<void>;

  // Mark as read
  markAsRead: (notificationIds: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;

  // UI state
  setOpen: (open: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

type NotificationsStore = NotificationsState & NotificationsActions;

// ==============================================================================
// Initial State
// ==============================================================================

const initialState: NotificationsState = {
  notifications: [],
  total: 0,
  hasMore: false,
  nextCursor: null,
  unreadCount: 0,
  isLoading: false,
  isOpen: false,
  error: null,
  lastFetch: null,
};

// ==============================================================================
// Store
// ==============================================================================

export const useNotificationsStore = create<NotificationsStore>()((set, get) => ({
  ...initialState,

  // ==========================================================================
  // Fetch Notifications
  // ==========================================================================

  fetchNotifications: async (reset = true) => {
    const state = get();

    // Prevent duplicate requests
    if (state.isLoading) {
      return;
    }

    // If already loaded and not resetting, skip
    if (!reset && state.notifications.length > 0) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await notificationsApi.list(20);

      set({
        notifications: response.items,
        total: response.total,
        hasMore: response.has_more,
        nextCursor: response.next_cursor,
        unreadCount: response.unread_count,
        isLoading: false,
        lastFetch: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar notificacoes";
      set({ error: message, isLoading: false });
    }
  },

  fetchMoreNotifications: async () => {
    const state = get();

    if (!state.hasMore || !state.nextCursor || state.isLoading) {
      return;
    }

    set({ isLoading: true });

    try {
      const response = await notificationsApi.list(20, state.nextCursor);

      set((prev) => ({
        notifications: [...prev.notifications, ...response.items],
        total: response.total,
        hasMore: response.has_more,
        nextCursor: response.next_cursor,
        unreadCount: response.unread_count,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar mais notificacoes";
      set({ error: message, isLoading: false });
    }
  },

  // ==========================================================================
  // Unread Count
  // ==========================================================================

  fetchUnreadCount: async () => {
    try {
      const response = await notificationsApi.getUnreadCount();
      set({ unreadCount: response.count });
    } catch {
      // Silently fail for unread count
    }
  },

  // ==========================================================================
  // Mark as Read
  // ==========================================================================

  markAsRead: async (notificationIds: string[]) => {
    // Optimistic update
    set((prev) => ({
      notifications: prev.notifications.map((n) =>
        notificationIds.includes(n.id)
          ? { ...n, is_read: true, read_at: new Date().toISOString() }
          : n,
      ),
      unreadCount: Math.max(0, prev.unreadCount - notificationIds.length),
    }));

    try {
      const response = await notificationsApi.markRead(notificationIds);
      set({ unreadCount: response.unread_count });
    } catch (error) {
      // Revert on error
      const message = error instanceof Error ? error.message : "Erro ao marcar como lida";
      set({ error: message });
      get().fetchNotifications(true);
    }
  },

  markAllAsRead: async () => {
    const state = get();

    // Optimistic update
    set((prev) => ({
      notifications: prev.notifications.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }));

    try {
      const response = await notificationsApi.markAllRead();
      set({ unreadCount: response.unread_count });
    } catch (error) {
      // Revert on error
      const message = error instanceof Error ? error.message : "Erro ao marcar todas como lidas";
      set({ error: message, unreadCount: state.unreadCount });
      get().fetchNotifications(true);
    }
  },

  // ==========================================================================
  // UI State
  // ==========================================================================

  setOpen: (open: boolean) => {
    set({ isOpen: open });

    // Fetch notifications when opening
    if (open) {
      get().fetchNotifications(false);
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));

// ==============================================================================
// Selectors
// ==============================================================================

export const selectNotifications = (state: NotificationsStore) => state.notifications;
export const selectUnreadCount = (state: NotificationsStore) => state.unreadCount;
export const selectHasMore = (state: NotificationsStore) => state.hasMore;
export const selectIsLoading = (state: NotificationsStore) => state.isLoading;
export const selectIsOpen = (state: NotificationsStore) => state.isOpen;
export const selectError = (state: NotificationsStore) => state.error;

// Get only unread notifications
export const selectUnreadNotifications = (state: NotificationsStore) =>
  state.notifications.filter((n) => !n.is_read);

export default useNotificationsStore;
