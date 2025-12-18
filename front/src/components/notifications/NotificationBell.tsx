/**
 * Notification bell with dropdown.
 *
 * Features:
 * - Bell icon with unread count badge
 * - Popover with notification list
 * - Mark as read functionality
 * - Auto-fetch on open
 */

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  selectHasMore,
  selectIsLoading,
  selectIsOpen,
  selectNotifications,
  selectUnreadCount,
  useNotificationsStore,
} from "@/stores/notifications";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect } from "react";
import { NotificationItem } from "./NotificationItem";

// Polling interval for unread count (5 minutes - fallback for WebSocket)
// WebSocket provides real-time updates; polling is just a safety net
const POLL_INTERVAL = 300000;

export function NotificationBell() {
  const notifications = useNotificationsStore(selectNotifications);
  const unreadCount = useNotificationsStore(selectUnreadCount);
  const hasMore = useNotificationsStore(selectHasMore);
  const isLoading = useNotificationsStore(selectIsLoading);
  const isOpen = useNotificationsStore(selectIsOpen);

  const setOpen = useNotificationsStore((state) => state.setOpen);
  const fetchUnreadCount = useNotificationsStore((state) => state.fetchUnreadCount);
  const fetchMoreNotifications = useNotificationsStore((state) => state.fetchMoreNotifications);
  const markAsRead = useNotificationsStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationsStore((state) => state.markAllAsRead);

  // Poll for unread count
  useEffect(() => {
    // Initial fetch
    fetchUnreadCount();

    // Poll periodically
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Handle notification click
  const handleNotificationClick = useCallback(
    (notificationId: string, isRead: boolean) => {
      if (!isRead) {
        markAsRead([notificationId]);
      }
      setOpen(false);
    },
    [markAsRead, setOpen],
  );

  // Handle mark all as read
  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    fetchMoreNotifications();
  }, [fetchMoreNotifications]);

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold min-w-[18px] h-[18px] px-1",
                unreadCount > 99 && "text-[10px]",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notificacoes</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notificacoes</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[400px]">
          {isLoading && notifications.length === 0 ? (
            // Loading skeleton
            <div className="p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma notificacao</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Voce sera notificado sobre mencoes, respostas e reacoes
              </p>
            </div>
          ) : (
            // Notification list
            <div className="py-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification.id, notification.is_read)}
                />
              ))}

              {/* Load more button */}
              {hasMore && (
                <>
                  <Separator />
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                      className="w-full text-xs"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        "Carregar mais"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
