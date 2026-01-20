/**
 * Response time percentiles chart.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RequestMetrics } from "@/types/metrics";
import { Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
}

function transformData(metrics: RequestMetrics): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];

  if (metrics.min_response_time_ms !== null) {
    data.push({ name: "Min", value: metrics.min_response_time_ms, label: "Mínimo" });
  }
  if (metrics.avg_response_time_ms !== null) {
    data.push({ name: "Avg", value: metrics.avg_response_time_ms, label: "Média" });
  }
  if (metrics.p50_response_time_ms !== null) {
    data.push({ name: "P50", value: metrics.p50_response_time_ms, label: "Mediana (P50)" });
  }
  if (metrics.p95_response_time_ms !== null) {
    data.push({ name: "P95", value: metrics.p95_response_time_ms, label: "P95" });
  }
  if (metrics.p99_response_time_ms !== null) {
    data.push({ name: "P99", value: metrics.p99_response_time_ms, label: "P99" });
  }
  if (metrics.max_response_time_ms !== null) {
    data.push({ name: "Max", value: metrics.max_response_time_ms, label: "Máximo" });
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
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
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
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
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

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium">{data.payload.label}</p>
      <p className="text-lg font-bold text-primary">{data.value.toFixed(2)} ms</p>
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
