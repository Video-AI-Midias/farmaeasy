/**
 * Standalone autoplay countdown indicator.
 *
 * Shows a circular countdown with cancel option.
 * Can be used outside of CompletionOverlay.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface AutoplayCountdownProps {
  countdown: number;
  maxCountdown?: number;
  onCancel: () => void;
  className?: string;
}

export function AutoplayCountdown({
  countdown,
  maxCountdown = 5,
  onCancel,
  className,
}: AutoplayCountdownProps) {
  if (countdown <= 0) return null;

  const progress = ((maxCountdown - countdown) / maxCountdown) * 100;
  const circumference = 2 * Math.PI * 18; // radius = 18
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg bg-background/95 p-3 shadow-lg border",
        className,
      )}
    >
      {/* Circular progress */}
      <div className="relative h-10 w-10">
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 40 40"
          role="img"
          aria-label={`Contagem regressiva: ${countdown} segundos`}
        >
          <title>Contagem regressiva: {countdown} segundos</title>
          {/* Background circle */}
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          />
          {/* Progress circle */}
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-all duration-1000"
          />
        </svg>
        {/* Countdown number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold">{countdown}</span>
        </div>
      </div>

      {/* Text */}
      <div className="flex-1">
        <p className="text-sm font-medium">Proxima aula</p>
        <p className="text-xs text-muted-foreground">em {countdown}s</p>
      </div>

      {/* Cancel button */}
      <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancelar autoplay">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default AutoplayCountdown;
