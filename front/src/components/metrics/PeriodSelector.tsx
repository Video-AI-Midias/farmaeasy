/**
 * Period selector component for metrics dashboard.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@/types/metrics";
import { Calendar } from "lucide-react";

interface PeriodSelectorProps {
  value: PeriodType;
  onChange: (period: PeriodType) => void;
}

interface PeriodOption {
  value: PeriodType;
  label: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "week", label: "7 dias" },
  { value: "month", label: "30 dias" },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center rounded-lg border bg-muted/50 p-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-md px-3 text-sm font-medium transition-colors",
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
