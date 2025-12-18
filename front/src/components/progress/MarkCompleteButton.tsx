/**
 * Button to mark a lesson as complete.
 *
 * Used for non-video content (text, PDF, quiz).
 * Shows different states based on completion status.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LessonProgressStatus } from "@/types/progress";
import { Check, CheckCircle, Loader2, RefreshCw } from "lucide-react";

interface MarkCompleteButtonProps {
  status: LessonProgressStatus;
  isLoading?: boolean;
  onMarkComplete: () => void;
  onMarkIncomplete?: () => void;
  className?: string;
  showReset?: boolean;
}

export function MarkCompleteButton({
  status,
  isLoading = false,
  onMarkComplete,
  onMarkIncomplete,
  className,
  showReset = true,
}: MarkCompleteButtonProps) {
  const isCompleted = status === LessonProgressStatus.COMPLETED;

  // Completed state - show reset option
  if (isCompleted && showReset && onMarkIncomplete) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle className="h-5 w-5" />
          <span>Concluida</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onMarkIncomplete}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Resetar
        </Button>
      </div>
    );
  }

  // Completed state - simple indicator (no reset)
  if (isCompleted) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-primary", className)}>
        <CheckCircle className="h-5 w-5" />
        <span>Concluida</span>
      </div>
    );
  }

  // Not completed - show mark complete button
  return (
    <Button onClick={onMarkComplete} disabled={isLoading} className={className}>
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Check className="mr-2 h-4 w-4" />
      )}
      Marcar como Concluida
    </Button>
  );
}

export default MarkCompleteButton;
