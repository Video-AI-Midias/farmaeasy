/**
 * Single notification item component.
 *
 * Displays notification with:
 * - Type icon
 * - Actor avatar (if available)
 * - Title and message
 * - Relative time
 * - Read/unread indicator
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/notifications";
import { AtSign, Bell, Heart, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

const typeIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  mention: AtSign,
  reply: MessageSquare,
  reaction: Heart,
  system: Bell,
};

const typeColors: Record<NotificationType, string> = {
  mention: "text-blue-500",
  reply: "text-green-500",
  reaction: "text-pink-500",
  system: "text-amber-500",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "agora";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}min`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d`;
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const Icon = typeIcons[notification.type];
  const iconColor = typeColors[notification.type];

  const content = (
    <button
      type="button"
      className={cn(
        "flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors cursor-pointer rounded-md w-full text-left",
        !notification.is_read && "bg-accent/20",
      )}
      onClick={onClick}
    >
      {/* Icon or Avatar */}
      <div className="relative flex-shrink-0">
        {notification.actor ? (
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={notification.actor.avatar ?? undefined}
              alt={notification.actor.name}
            />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
              {getInitials(notification.actor.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full bg-muted",
              iconColor,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}

        {/* Type badge overlay when actor is present */}
        {notification.actor && (
          <div
            className={cn(
              "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border shadow-sm",
              iconColor,
            )}
          >
            <Icon className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn("text-sm leading-tight", !notification.is_read && "font-medium")}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.is_read && (
        <div className="flex-shrink-0 mt-1">
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
    </button>
  );

  // Wrap in Link if has reference URL
  if (notification.reference_url) {
    return (
      <Link to={notification.reference_url} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export default NotificationItem;
