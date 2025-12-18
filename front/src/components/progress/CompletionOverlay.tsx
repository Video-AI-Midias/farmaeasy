/**
 * Overlay shown when a lesson is completed.
 *
 * Shows:
 * - Completion message
 * - Rewatch button
 * - Next lesson button (if available)
 * - Autoplay countdown (if enabled)
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2, Play, RefreshCw, X } from "lucide-react";

interface CompletionOverlayProps {
  visible: boolean;
  hasNextLesson: boolean;
  countdown?: number;
  isAutoplayActive?: boolean;
  isLoading?: boolean;
  onRewatch: () => void;
  onNextLesson: () => void;
  onCancelAutoplay?: () => void;
  onClose?: () => void;
  className?: string;
}

export function CompletionOverlay({
  visible,
  hasNextLesson,
  countdown = 0,
  isAutoplayActive = false,
  isLoading = false,
  onRewatch,
  onNextLesson,
  onCancelAutoplay,
  onClose,
  className,
}: CompletionOverlayProps) {
  if (!visible) return null;

  return (
    <dialog
      open
      aria-modal="true"
      className={cn(
        // Reset native dialog styles + apply our styles
        "fixed inset-0 m-0 max-w-none max-h-none w-screen h-screen",
        "flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50 border-none p-0",
        className,
      )}
      aria-labelledby="completion-title"
    >
      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X className="h-6 w-6" />
        </button>
      )}

      {/* Completion icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
        <Check className="h-8 w-8 text-primary-foreground" />
      </div>

      {/* Completion message */}
      <h3 id="completion-title" className="mb-2 text-xl font-semibold text-white">
        Aula Concluida!
      </h3>
      <p className="mb-8 text-sm text-white/70">
        {hasNextLesson
          ? "Continue para a proxima aula"
          : "Voce concluiu todas as aulas deste modulo"}
      </p>

      {/* Action buttons */}
      <div className="flex gap-4">
        {/* Rewatch button - styled for dark background */}
        <button
          type="button"
          onClick={onRewatch}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 min-w-[140px] px-4 py-2 text-sm font-medium text-white border border-white/30 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reassistir
        </button>

        {/* Next lesson button */}
        {hasNextLesson && (
          <Button onClick={onNextLesson} disabled={isLoading} className="min-w-[140px]">
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Proxima Aula
          </Button>
        )}
      </div>

      {/* Autoplay countdown - shows for both "next lesson" and "auto-hide" cases */}
      {isAutoplayActive && countdown > 0 && (
        <div className="mt-6 flex flex-col items-center">
          <p className="text-sm text-white/70">
            {hasNextLesson ? "Proxima aula em " : "Fechando em "}
            <span className="font-mono text-lg text-white">{countdown}</span> segundos
          </p>
          {onCancelAutoplay && (
            <button
              type="button"
              onClick={onCancelAutoplay}
              className="mt-2 text-sm text-white/50 underline hover:text-white/70 transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}

export default CompletionOverlay;
