/**
 * TruncatedText - Componente para texto truncado com tooltip
 *
 * Aplica truncamento multi-linha com ellipsis (...) e mostra
 * o texto completo em tooltip ao passar o mouse.
 *
 * @example
 * <TruncatedText lines={1} className="text-sm">
 *   Texto muito longo que será truncado...
 * </TruncatedText>
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TruncatedTextProps {
  children: ReactNode;
  lines?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  showTooltip?: boolean;
  asChild?: boolean;
}

export function TruncatedText({
  children,
  lines = 1,
  className,
  showTooltip = true,
  asChild = false,
}: TruncatedTextProps) {
  const truncateClass = `text-truncate-${lines}`;
  const content = asChild ? children : <p className={cn(truncateClass, className)}>{children}</p>;

  // Se showTooltip é false ou children não é string, não mostra tooltip
  if (!showTooltip || typeof children !== "string") {
    return content;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-md break-words">
          <p className="whitespace-pre-wrap">{children}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TruncatedText;
