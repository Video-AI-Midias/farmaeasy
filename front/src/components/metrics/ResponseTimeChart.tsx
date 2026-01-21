/**
 * Response time chart with dynamic colors based on performance thresholds.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RequestMetrics } from "@/types/metrics";
import { Timer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Thresholds para tempo de resposta (em ms)
const RESPONSE_TIME_THRESHOLDS = {
  fast: 100, // Verde: < 100ms
  medium: 500, // Amarelo: 100-500ms
  // Vermelho: > 500ms
};

// Cores HSL
const COLORS = {
  fast: "hsl(142, 76%, 36%)", // Verde - emerald-600
  medium: "hsl(45, 93%, 47%)", // Amarelo - yellow-500
  slow: "hsl(0, 84%, 60%)", // Vermelho - red-500
};

function getResponseTimeColor(ms: number): string {
  if (ms < RESPONSE_TIME_THRESHOLDS.fast) return COLORS.fast;
  if (ms < RESPONSE_TIME_THRESHOLDS.medium) return COLORS.medium;
  return COLORS.slow;
}

function getResponseTimeLabel(ms: number): string {
  if (ms < RESPONSE_TIME_THRESHOLDS.fast) return "Rápido";
  if (ms < RESPONSE_TIME_THRESHOLDS.medium) return "Médio";
  return "Lento";
}

interface ResponseTimeChartProps {
  data: RequestMetrics | undefined;
  isLoading?: boolean;
  title?: string;
  height?: number;
}

interface ChartDataPoint {
  name: string;
  value: number;
  label: string;
  color: string;
  performance: string;
}

function transformData(metrics: RequestMetrics): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];

  if (metrics.min_response_time_ms !== null) {
    const value = metrics.min_response_time_ms;
    data.push({
      name: "Min",
      value,
      label: "Mínimo",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }
  if (metrics.avg_response_time_ms !== null) {
    const value = metrics.avg_response_time_ms;
    data.push({
      name: "Avg",
      value,
      label: "Média",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }
  if (metrics.p50_response_time_ms !== null) {
    const value = metrics.p50_response_time_ms;
    data.push({
      name: "P50",
      value,
      label: "Mediana (P50)",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }
  if (metrics.p95_response_time_ms !== null) {
    const value = metrics.p95_response_time_ms;
    data.push({
      name: "P95",
      value,
      label: "P95",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }
  if (metrics.p99_response_time_ms !== null) {
    const value = metrics.p99_response_time_ms;
    data.push({
      name: "P99",
      value,
      label: "P99",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }
  if (metrics.max_response_time_ms !== null) {
    const value = metrics.max_response_time_ms;
    data.push({
      name: "Max",
      value,
      label: "Máximo",
      color: getResponseTimeColor(value),
      performance: getResponseTimeLabel(value),
    });
  }

  return data;
}

export function ResponseTimeChart({
  data,
  isLoading = false,
  title = "Tempos de Resposta",
  height = 250,
}: ResponseTimeChartProps) {
  if (isLoading) {
    return <ResponseTimeChartSkeleton height={height} title={title} />;
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div style={{ height }} className="flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Dados não disponíveis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = transformData(data);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.fast }} />
              <span className="text-muted-foreground">&lt;100ms</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.medium }} />
              <span className="text-muted-foreground">100-500ms</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.slow }} />
              <span className="text-muted-foreground">&gt;500ms</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              tickFormatter={(value) => `${value}ms`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface TooltipPayload {
  value: number;
  payload: ChartDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length || !payload[0]) {
    return null;
  }

  const data = payload[0];
  const { color, performance } = data.payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{data.payload.label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-lg font-bold" style={{ color }}>
          {data.value.toFixed(2)} ms
        </span>
        <span
          className={cn(
            "text-xs px-1.5 py-0.5 rounded",
            performance === "Rápido" && "bg-emerald-500/10 text-emerald-600",
            performance === "Médio" && "bg-yellow-500/10 text-yellow-600",
            performance === "Lento" && "bg-red-500/10 text-red-600",
          )}
        >
          {performance}
        </span>
      </div>
    </div>
  );
}

interface SkeletonProps {
  height: number;
  title: string;
}

function ResponseTimeChartSkeleton({ height, title }: SkeletonProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="flex items-end gap-2 px-4">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-24 flex-1" />
          <Skeleton className="h-20 flex-1" />
          <Skeleton className="h-32 flex-1" />
          <Skeleton className="h-40 flex-1" />
          <Skeleton className="h-48 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}
