/**
 * Lesson card component for displaying lesson information.
 *
 * A pure display component for lessons - drag-and-drop is handled
 * by parent wrappers (e.g., SortableLessonItem in ModuleDetail).
 *
 * Supports optional thumbnail display for VIDEO type lessons using Bunny.net.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { cn } from "@/lib/utils";
import { ContentStatus, ContentType, type LessonInModule } from "@/types/courses";
import {
  AlertTriangle,
  Clock,
  Edit,
  FileIcon,
  FileText,
  HelpCircle,
  MoreVertical,
  PlayCircle,
  Trash2,
  Unlink,
} from "lucide-react";

interface LessonCardProps {
  lesson: LessonInModule;
  onEdit?: ((lesson: LessonInModule) => void) | undefined;
  onUnlink?: ((lessonId: string) => void) | undefined;
  onDelete?: ((lessonId: string) => void) | undefined;
  compact?: boolean | undefined;
  className?: string | undefined;
  /** Whether to show the actions menu */
  showActions?: boolean | undefined;
  /** Whether to show thumbnail for VIDEO type lessons (default: false) */
  showThumbnail?: boolean | undefined;
}

export function LessonCard({
  lesson,
  onEdit,
  onUnlink,
  onDelete,
  compact = false,
  className,
  showActions = true,
  showThumbnail = false,
}: LessonCardProps) {
  const contentTypeIcons: Record<ContentType, typeof PlayCircle> = {
    [ContentType.VIDEO]: PlayCircle,
    [ContentType.TEXT]: FileText,
    [ContentType.QUIZ]: HelpCircle,
    [ContentType.PDF]: FileIcon,
  };

  const contentTypeLabels: Record<ContentType, string> = {
    [ContentType.VIDEO]: "Video",
    [ContentType.TEXT]: "Texto",
    [ContentType.QUIZ]: "Quiz",
    [ContentType.PDF]: "PDF",
  };

  const statusColors: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    [ContentStatus.PUBLISHED]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    [ContentStatus.ARCHIVED]: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  const statusLabels: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "Rascunho",
    [ContentStatus.PUBLISHED]: "Publicado",
    [ContentStatus.ARCHIVED]: "Arquivado",
  };

  const Icon = contentTypeIcons[lesson.content_type];

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}min`;
    return `${minutes}min ${remainingSeconds}s`;
  };

  const hasActions = showActions && (onEdit || onUnlink || onDelete);

  // Show thumbnail for VIDEO type lessons when enabled
  const shouldShowThumbnail =
    showThumbnail && lesson.content_type === ContentType.VIDEO && lesson.content_url;

  return (
    <div
      className={cn(
        "rounded-md border bg-background text-card-foreground",
        compact ? "p-2" : "p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {/* Thumbnail for VIDEO type lessons */}
        {shouldShowThumbnail ? (
          <VideoThumbnail
            contentUrl={lesson.content_url}
            size="sm"
            showPlayIcon={false}
            containerClassName="shrink-0"
          />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium">{lesson.title}</span>

          {!compact && (
            <>
              <Badge
                variant="outline"
                className={cn("text-xs shrink-0", statusColors[lesson.status])}
              >
                {statusLabels[lesson.status]}
              </Badge>
              {!lesson.is_valid && (
                <Badge
                  variant="destructive"
                  className="text-xs shrink-0 flex items-center gap-1"
                  title={`Conteudo incompleto para tipo ${contentTypeLabels[lesson.content_type]}`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Incompleta
                </Badge>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lesson.duration_seconds && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(lesson.duration_seconds)}
            </div>
          )}

          {!compact && (
            <Badge variant="secondary" className="text-xs">
              {contentTypeLabels[lesson.content_type]}
            </Badge>
          )}

          {hasActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(lesson)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                )}
                {onUnlink && (
                  <DropdownMenuItem onClick={() => onUnlink(lesson.id)}>
                    <Unlink className="mr-2 h-4 w-4" />
                    Desvincular
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(lesson.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

export default LessonCard;
