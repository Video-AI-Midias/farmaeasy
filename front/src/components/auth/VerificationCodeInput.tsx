/**
 * 6-digit verification code input component.
 * Features: auto-advance, paste support, backspace navigation.
 */

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const CODE_LENGTH = 6;

interface VerificationCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  error?: string | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
}

export function VerificationCodeInput({
  value,
  onChange,
  disabled = false,
  error,
  autoFocus = true,
  className,
}: VerificationCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(autoFocus ? 0 : null);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, CODE_LENGTH);
  }, []);

  // Focus first input on mount
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Handle input change
  const handleChange = useCallback(
    (index: number, newValue: string) => {
      // Only allow digits
      const digit = newValue.replace(/\D/g, "").slice(-1);

      if (digit) {
        // Update value
        const newCode = value.split("");
        newCode[index] = digit;
        onChange(newCode.join("").slice(0, CODE_LENGTH));

        // Auto-advance to next input
        if (index < CODE_LENGTH - 1 && inputRefs.current[index + 1]) {
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [value, onChange],
  );

  // Handle paste
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);

      if (pastedData) {
        onChange(pastedData.padEnd(CODE_LENGTH, "").slice(0, CODE_LENGTH));

        // Focus last filled input or last input
        const focusIndex = Math.min(pastedData.length, CODE_LENGTH - 1);
        inputRefs.current[focusIndex]?.focus();
      }
    },
    [onChange],
  );

  // Handle key down
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();

        if (value[index]) {
          // Clear current digit
          const newCode = value.split("");
          newCode[index] = "";
          onChange(newCode.join(""));
        } else if (index > 0) {
          // Move to previous input and clear it
          const newCode = value.split("");
          newCode[index - 1] = "";
          onChange(newCode.join(""));
          inputRefs.current[index - 1]?.focus();
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
        e.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, onChange],
  );

  // Handle focus
  const handleFocus = useCallback((index: number) => {
    setFocused(index);
    // Select input content on focus
    inputRefs.current[index]?.select();
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    setFocused(null);
  }, []);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex justify-center gap-2 sm:gap-3">
        {Array.from({ length: CODE_LENGTH }).map((_, index) => (
          <Input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={value[index] || ""}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            onBlur={handleBlur}
            disabled={disabled}
            className={cn(
              "h-12 w-10 sm:h-14 sm:w-12 text-center text-xl sm:text-2xl font-semibold",
              "transition-all duration-200",
              focused === index && "ring-2 ring-primary ring-offset-2",
              error && "border-destructive focus:ring-destructive",
              value[index] && "bg-primary/5 border-primary/50",
            )}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default VerificationCodeInput;
