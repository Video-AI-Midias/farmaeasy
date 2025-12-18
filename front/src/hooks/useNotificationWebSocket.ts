/**
 * WebSocket hook for real-time notifications.
 *
 * Features:
 * - Auto-connect when authenticated
 * - JWT authentication via query param
 * - Automatic reconnection with exponential backoff
 * - Ping/pong keep-alive handling
 * - Updates notification store on new notifications
 */

import { getAccessToken } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import type { Notification, NotificationType } from "@/types/notifications";
import { useCallback, useEffect, useRef, useState } from "react";

// ==============================================================================
// Types
// ==============================================================================

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface WebSocketMessage {
  type: "notification" | "unread_count" | "ping" | "pong" | "connected";
  data?: NotificationData;
  count?: number;
  user_id?: string;
  message?: string;
}

interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  reference_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface UseNotificationWebSocketReturn {
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
}

// ==============================================================================
// Constants
// ==============================================================================

const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

// Get WebSocket URL from environment or derive from current host
function getWebSocketUrl(): string {
  // In development, use the API proxy port
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Use localhost:8002 directly for WebSocket (Vite proxy doesn't support WS well)
    return `${protocol}//localhost:8002/ws/notifications`;
  }
  // In production, use the same host
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/notifications`;
}

// ==============================================================================
// Hook
// ==============================================================================

export function useNotificationWebSocket(): UseNotificationWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false); // Guard against concurrent connection attempts

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Get actions from notification store
  const fetchUnreadCount = useNotificationsStore((state) => state.fetchUnreadCount);

  // Convert WebSocket notification data to store format
  const mapNotificationData = useCallback((data: NotificationData): Notification => {
    // Build actor object if actor_id exists
    const actor =
      data.actor_id && data.actor_name
        ? {
            id: data.actor_id,
            name: data.actor_name,
            avatar: data.actor_avatar,
          }
        : null;

    return {
      id: data.id,
      type: data.type as NotificationType,
      title: data.title,
      message: data.message,
      actor,
      reference_id: null,
      reference_type: null,
      reference_url: data.reference_url,
      lesson_id: null,
      course_slug: null,
      lesson_slug: null,
      is_read: data.is_read,
      read_at: null,
      created_at: data.created_at,
    };
  }, []);

  // Handle incoming WebSocket message
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connected":
            // Connection confirmed by server
            console.log("[WS] Connected:", message.message);
            break;

          case "notification":
            if (message.data) {
              // Add new notification to store (with deduplication)
              const notification = mapNotificationData(message.data);
              useNotificationsStore.setState((state) => {
                // Check if notification already exists (prevent duplicates)
                const exists = state.notifications.some((n) => n.id === notification.id);
                if (exists) {
                  console.log("[WS] Notification already exists, skipping:", notification.id);
                  return state; // Return unchanged state
                }
                return {
                  notifications: [notification, ...state.notifications],
                  unreadCount: state.unreadCount + 1,
                  total: state.total + 1,
                };
              });
            }
            break;

          case "unread_count":
            if (typeof message.count === "number") {
              useNotificationsStore.setState({ unreadCount: message.count });
            }
            break;

          case "ping":
            // Respond to server ping
            wsRef.current?.send(JSON.stringify({ type: "pong" }));
            break;

          case "pong":
            // Server responded to our ping
            break;
        }
      } catch (error) {
        console.error("[WS] Failed to parse message:", error);
      }
    },
    [mapNotificationData],
  );

  // Clean up any pending reconnect
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Schedule reconnection with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log("[WS] Max reconnect attempts reached");
      setStatus("error");
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * 2 ** reconnectAttemptRef.current,
      MAX_RECONNECT_DELAY,
    );

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connect();
    }, delay);
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if not authenticated
    if (!isAuthenticated) {
      return;
    }

    // Don't connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING ||
      isConnectingRef.current
    ) {
      console.log("[WS] Already connected or connecting, skipping");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      console.log("[WS] No access token available");
      return;
    }

    clearReconnectTimeout();
    isConnectingRef.current = true;
    setStatus("connecting");

    try {
      const wsUrl = `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[WS] Connected");
        isConnectingRef.current = false;
        setStatus("connected");
        reconnectAttemptRef.current = 0;
        // Fetch latest unread count on connect
        fetchUnreadCount();
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log("[WS] Disconnected:", event.code, event.reason);
        isConnectingRef.current = false;
        setStatus("disconnected");
        wsRef.current = null;

        // Don't reconnect if closed intentionally (code 1000) or auth failed (code 4001)
        if (event.code !== 1000 && event.code !== 4001 && isAuthenticated) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error("[WS] Error:", error);
        isConnectingRef.current = false;
        // Error will trigger onclose
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[WS] Failed to connect:", error);
      isConnectingRef.current = false;
      setStatus("error");
      scheduleReconnect();
    }
  }, [isAuthenticated, clearReconnectTimeout, handleMessage, scheduleReconnect, fetchUnreadCount]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectAttemptRef.current = 0;
    isConnectingRef.current = false;

    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnect");
      wsRef.current = null;
    }

    setStatus("disconnected");
  }, [clearReconnectTimeout]);

  // Auto-connect when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return {
    status,
    connect,
    disconnect,
  };
}

export default useNotificationWebSocket;
