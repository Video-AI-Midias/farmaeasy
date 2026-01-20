/**
 * Requests over time chart using Recharts.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeSeriesPoint } from "@/types/metrics";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface RequestsChartProps {
  data: TimeSeriesPoint[];
  isLoading?: boolean;
  title?: string;
  height?: number;
}

interface ChartDataPoint {
  timestamp: string;
  value: number;
  label: string;
}

function transformData(points: TimeSeriesPoint[]): ChartDataPoint[] {
  return points.map((point) => {
    const date = parseISO(point.timestamp);
    return {
      timestamp: point.timestamp,
      value: point.value,
      label: format(date, "HH:mm", { locale: ptBR }),
    };
  });
}

export function RequestsChart({
  data,
  isLoading = false,
  title = "Requests ao Longo do Tempo",
  height = 300,
}: RequestsChartProps) {
  if (isLoading) {
    return <RequestsChartSkeleton height={height} title={title} />;
  }

  const chartData = transformData(data);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
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
              tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "5 5" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#requestsGradient)"
            />
          </AreaChart>
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
  const date = parseISO(data.payload.timestamp);
  const formattedDate = format(date, "dd/MM HH:mm", { locale: ptBR });

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-xs text-muted-foreground">{formattedDate}</p>
      <p className="text-sm font-semibold text-foreground">
        {data.value.toLocaleString("pt-BR")} requests
      </p>
    </div>
  );
}

interface SkeletonProps {
  height: number;
  title: string;
}

function RequestsChartSkeleton({ height, title }: SkeletonProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="flex items-center justify-center">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}
