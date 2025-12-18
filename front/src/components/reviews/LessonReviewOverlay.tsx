/**
 * Lesson review overlay that appears after lesson completion.
 *
 * Features:
 * - Star rating (1-5) for satisfaction
 * - Comment textarea with auto-focus
 * - 10-second countdown timer
 * - Countdown cancels when user starts typing
 * - Review integrates with comments section
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, Send, SkipForward, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LessonReviewOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Callback when overlay should close */
  onClose: () => void;
  /** Callback when review is submitted */
  onSubmit: (rating: number, comment: string) => Promise<void>;
  /** Title of the lesson being reviewed */
  lessonTitle: string;
  /** Countdown duration in seconds */
  countdownSeconds?: number;
}

export function LessonReviewOverlay({
  isOpen,
  onClose,
  onSubmit,
  lessonTitle,
  countdownSeconds = 10,
}: LessonReviewOverlayProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isCountdownActive, setIsCountdownActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setComment("");
      setCountdown(countdownSeconds);
      setIsCountdownActive(true);
      setIsSubmitting(false);
    }
  }, [isOpen, countdownSeconds]);

  // Auto-focus textarea when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !isCountdownActive) return;

    if (countdown <= 0) {
      onClose();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown, isCountdownActive, onClose]);

  // Cancel countdown when user starts typing
  const handleCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setComment(value);
      if (isCountdownActive && value.length > 0) {
        setIsCountdownActive(false);
      }
    },
    [isCountdownActive],
  );

  // Cancel countdown when user interacts with rating
  const handleRatingChange = useCallback(
    (newRating: number) => {
      setRating(newRating);
      if (isCountdownActive) {
        setIsCountdownActive(false);
      }
    },
    [isCountdownActive],
  );

  const handleSubmit = useCallback(async () => {
    if (rating === 0) return;

    setIsSubmitting(true);
    setIsCountdownActive(false);

    try {
      await onSubmit(rating, comment);
    } finally {
      setIsSubmitting(false);
    }
  }, [rating, comment, onSubmit]);

  const handleSkip = useCallback(() => {
    setIsCountdownActive(false);
    onClose();
  }, [onClose]);

  // Progress calculation for countdown bar
  const progress = isCountdownActive
    ? ((countdownSeconds - countdown) / countdownSeconds) * 100
    : 100;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Star className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Avalie esta aula</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium text-foreground">"{lessonTitle}"</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Star Rating */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Qual sua nota para esta aula?</p>
            <StarRating
              value={rating}
              onChange={handleRatingChange}
              size="lg"
              disabled={isSubmitting}
            />
          </div>

          {/* Comment Textarea */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>Deixe seu comentario (opcional)</span>
            </div>
            <Textarea
              ref={textareaRef}
              value={comment}
              onChange={handleCommentChange}
              placeholder="O que achou da aula? Sua opiniao ajuda a melhorar o conteudo..."
              className="min-h-[100px] resize-none"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          {/* Action Buttons */}
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="flex-1"
              type="button"
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Pular
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              className="flex-1"
              type="button"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar Review
            </Button>
          </div>

          {/* Countdown Indicator */}
          {isCountdownActive && countdown > 0 && (
            <div className="w-full space-y-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full bg-primary transition-all duration-1000 ease-linear")}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Fechando em {countdown}s... (digite algo para cancelar)
              </p>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonReviewOverlay;
