/**
 * KPI Card component for displaying metrics.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, type LucideIcon, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: number | string;
  trend?: number | undefined;
  trendIsPositive?: boolean | undefined;
  icon: LucideIcon;
  period?: string | undefined;
  isLoading?: boolean | undefined;
  formatValue?: ((value: number | string) => string) | undefined;
}

function formatNumber(value: number | string): string {
  if (typeof value === "string") return value;
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("pt-BR");
}

export function KPICard({
  title,
  value,
  trend,
  trendIsPositive = true,
  icon: Icon,
  period = "vs. ontem",
  isLoading = false,
  formatValue = formatNumber,
}: KPICardProps) {
  if (isLoading) {
    return <KPICardSkeleton />;
  }

  const trendDirection = trend === undefined || trend === 0 ? "neutral" : trend > 0 ? "up" : "down";
  const isPositiveChange =
    trendDirection === "neutral" || (trendDirection === "up") === trendIsPositive;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{formatValue(value)}</p>
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>

        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            <TrendIndicator direction={trendDirection} isPositive={isPositiveChange} />
            <span
              className={cn(
                "text-sm font-medium",
                isPositiveChange
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
                trendDirection === "neutral" && "text-muted-foreground",
              )}
            >
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">{period}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TrendIndicatorProps {
  direction: "up" | "down" | "neutral";
  isPositive: boolean;
}

function TrendIndicator({ direction, isPositive }: TrendIndicatorProps) {
  if (direction === "neutral") {
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  const colorClass = isPositive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  if (direction === "up") {
    return <ArrowUp className={cn("h-4 w-4", colorClass)} />;
  }

  return <ArrowDown className={cn("h-4 w-4", colorClass)} />;
}

export function KPICardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </CardContent>
    </Card>
  );
}
