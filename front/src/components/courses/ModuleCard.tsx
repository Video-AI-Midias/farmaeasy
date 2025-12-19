/**
 * Module card component for displaying module information.
 *
 * Used within the course editor to display and manage modules.
 * Supports drag-and-drop when wrapped in a sortable context.
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
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";
import { ContentStatus, type ModuleInCourse } from "@/types/courses";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  GripVertical,
  MoreVertical,
  Trash2,
  Unlink,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface ModuleCardProps {
  module: ModuleInCourse;
  onEdit?: ((module: ModuleInCourse) => void) | undefined;
  onUnlink?: ((moduleId: string) => void) | undefined;
  onDelete?: ((moduleId: string) => void) | undefined;
  children?: ReactNode | undefined;
  disabled?: boolean | undefined;
  isExpanded?: boolean | undefined;
  onToggleExpand?: (() => void) | undefined;
}

export function ModuleCard({
  module,
  onEdit,
  onUnlink,
  onDelete,
  children,
  disabled = false,
  isExpanded = false,
  onToggleExpand,
}: ModuleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary",
      )}
      {...attributes}
    >
      <div className="flex items-center gap-2 p-4">
        {!disabled && (
          <button
            type="button"
            className={cn(
              "flex cursor-grab items-center text-muted-foreground",
              "hover:text-foreground focus:outline-none",
              isDragging && "cursor-grabbing",
            )}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}

        <div className="flex flex-1 items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{module.title}</h3>
              <Badge variant="outline" className={cn("text-xs", statusColors[module.status])}>
                {statusLabels[module.status]}
              </Badge>
            </div>
            {module.description && (
              <TruncatedText lines={1} className="mt-1 text-sm text-muted-foreground">
                {module.description}
              </TruncatedText>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              {module.lesson_count} {module.lesson_count === 1 ? "aula" : "aulas"}
            </div>
          </div>

          {children && onToggleExpand && (
            <Button variant="ghost" size="sm" onClick={onToggleExpand} className="shrink-0">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(module)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {onUnlink && (
                <DropdownMenuItem onClick={() => onUnlink(module.id)}>
                  <Unlink className="mr-2 h-4 w-4" />
                  Desvincular
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(module.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {children && isExpanded && <div className="border-t px-4 py-3 bg-muted/30">{children}</div>}
    </div>
  );
}

export default ModuleCard;
