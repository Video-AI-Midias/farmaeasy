/**
 * Sortable item component for drag-and-drop functionality.
 *
 * Uses @dnd-kit/sortable to enable dragging and dropping items
 * within a list. Provides visual feedback during drag operations.
 */

import { cn } from "@/lib/utils";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface SortableItemProps {
  id: UniqueIdentifier;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SortableItem({ id, children, className, disabled = false }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id,
      disabled,
    });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-lg border bg-card text-card-foreground",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary",
        isOver && "ring-2 ring-accent",
        className,
      )}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        {!disabled && (
          <button
            type="button"
            className={cn(
              "flex h-full cursor-grab items-center px-2 py-3 text-muted-foreground",
              "hover:text-foreground focus:outline-none",
              isDragging && "cursor-grabbing",
            )}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

/**
 * Drag handle component for more complex layouts.
 * Use this when you need the drag handle in a different position.
 */
interface DragHandleProps {
  listeners: ReturnType<typeof useSortable>["listeners"];
  isDragging?: boolean;
  className?: string;
}

export function DragHandle({ listeners, isDragging, className }: DragHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex cursor-grab items-center p-2 text-muted-foreground",
        "hover:text-foreground focus:outline-none",
        isDragging && "cursor-grabbing",
        className,
      )}
      {...listeners}
    >
      <GripVertical className="h-5 w-5" />
    </button>
  );
}

export default SortableItem;
