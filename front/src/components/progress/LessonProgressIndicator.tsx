/**
 * Visual indicator for lesson progress.
 *
 * Shows:
 * - Checkmark when completed (with optional animation)
 * - Progress ring when in progress
 * - Empty circle when not started
 */

import { cn } from "@/lib/utils";
import { LessonProgressStatus } from "@/types/progress";
import { Check, Circle, Play } from "lucide-react";

interface LessonProgressIndicatorProps {
  status: LessonProgressStatus;
  /** Current progress as percentage (0-100). Also accepts `progress` as alias. */
  progressPercent?: number;
  /** Alias for progressPercent for convenience */
  progress?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showPercent?: boolean;
  /** Fallback number to show when NOT_STARTED (e.g., lesson number) */
  fallbackNumber?: number;
  /** Whether to animate the completion state (pop/scale effect) */
  animate?: boolean;
}

const sizeClasses = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function LessonProgressIndicator({
  status,
  progressPercent,
  progress,
  size = "md",
  className,
  showPercent = false,
  fallbackNumber,
  animate = false,
}: LessonProgressIndicatorProps) {
  // Use progress or progressPercent (progress takes precedence for convenience)
  const actualProgress = progress ?? progressPercent ?? 0;

  // Completed state
  if (status === LessonProgressStatus.COMPLETED) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary text-primary-foreground",
          sizeClasses[size],
          animate && "animate-completion-pop",
          className,
        )}
        title="Aula concluida"
      >
        <Check className={cn(iconSizeClasses[size], animate && "animate-completion-check")} />
      </div>
    );
  }

  // In progress state - show progress ring
  if (status === LessonProgressStatus.IN_PROGRESS) {
    const circumference = 2 * Math.PI * 10; // radius = 10
    const strokeDashoffset = circumference - (actualProgress / 100) * circumference;
    const progressTitle = `${Math.round(actualProgress)}% assistido`;

    return (
      <div className={cn("relative", sizeClasses[size], className)} title={progressTitle}>
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 24 24"
          role="img"
          aria-label={progressTitle}
        >
          <title>{progressTitle}</title>
          {/* Background circle */}
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted"
          />
          {/* Progress circle */}
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-all duration-300"
          />
        </svg>
        {/* Play icon in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Play className={cn(iconSizeClasses[size], "text-primary fill-primary")} />
        </div>
        {/* Percentage text */}
        {showPercent && (
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
            {Math.round(actualProgress)}%
          </span>
        )}
      </div>
    );
  }

  // Not started state
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
        sizeClasses[size],
        className,
      )}
      title="Nao iniciada"
    >
      {fallbackNumber !== undefined ? (
        <span className="text-xs font-medium">{fallbackNumber}</span>
      ) : (
        <Circle className={cn(iconSizeClasses[size], "opacity-50")} />
      )}
    </div>
  );
}

export default LessonProgressIndicator;
