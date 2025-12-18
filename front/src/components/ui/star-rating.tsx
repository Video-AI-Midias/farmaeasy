/**
 * Star rating component for user feedback.
 *
 * Features:
 * - 5 clickable stars (1-5 rating)
 * - Hover preview
 * - Keyboard navigation (arrow keys, Enter)
 * - Accessible with aria-labels
 */

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { useCallback, useState } from "react";

const SIZES = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-9 w-9",
} as const;

interface StarRatingProps {
  /** Current rating value (0-5, 0 = none selected) */
  value: number;
  /** Callback when rating changes */
  onChange: (rating: number) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Size of the stars */
  size?: keyof typeof SIZES;
  /** Additional CSS classes */
  className?: string;
}

export function StarRating({
  value,
  onChange,
  disabled = false,
  size = "md",
  className,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);

  const handleClick = useCallback(
    (rating: number) => {
      if (!disabled) {
        onChange(rating);
      }
    },
    [disabled, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, starIndex: number) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          onChange(starIndex);
          break;
        case "ArrowRight":
        case "ArrowUp":
          event.preventDefault();
          if (starIndex < 5) {
            onChange(Math.min(5, value + 1));
          }
          break;
        case "ArrowLeft":
        case "ArrowDown":
          event.preventDefault();
          if (starIndex > 1) {
            onChange(Math.max(1, value - 1));
          }
          break;
      }
    },
    [disabled, onChange, value],
  );

  const displayValue = hoverValue > 0 ? hoverValue : value;

  return (
    <div className={cn("flex items-center gap-1", className)} aria-label="Avaliacao em estrelas">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue;
        const isHovering = hoverValue > 0 && star <= hoverValue;

        return (
          <button
            key={star}
            type="button"
            aria-pressed={star <= value}
            aria-label={`Dar ${star} ${star === 1 ? "estrela" : "estrelas"}`}
            disabled={disabled}
            tabIndex={star === value || (value === 0 && star === 1) ? 0 : -1}
            className={cn(
              "cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm",
              disabled && "cursor-not-allowed opacity-50",
              !disabled && "hover:scale-110",
            )}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !disabled && setHoverValue(star)}
            onMouseLeave={() => setHoverValue(0)}
            onKeyDown={(e) => handleKeyDown(e, star)}
          >
            <Star
              className={cn(
                SIZES[size],
                "transition-colors duration-150",
                isFilled
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-transparent text-muted-foreground",
                isHovering && "text-yellow-500",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export default StarRating;
