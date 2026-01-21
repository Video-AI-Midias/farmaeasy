/**
 * Requests over time chart with gradient colors.
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

// Cores para o gráfico
const CHART_COLORS = {
  stroke: "hsl(142, 76%, 36%)", // emerald-600
  fillStart: "hsl(142, 76%, 36%)", // emerald-600
  fillEnd: "hsl(142, 76%, 36%)", // emerald-600
};

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
  const hasData = chartData.length > 0;

  // Calcular estatísticas para exibir
  const totalRequests = chartData.reduce((sum, point) => sum + point.value, 0);
  const avgRequests = hasData ? Math.round(totalRequests / chartData.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500" />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
          {/* Stats */}
          {hasData && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold text-emerald-500">
                  {totalRequests.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Média:</span>
                <span className="font-semibold text-emerald-500">
                  {avgRequests.toLocaleString("pt-BR")}/h
                </span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.fillStart} stopOpacity={0.4} />
                  <stop offset="50%" stopColor={CHART_COLORS.fillEnd} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_COLORS.fillEnd} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value)}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: CHART_COLORS.stroke, strokeWidth: 1, strokeDasharray: "5 5" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS.stroke}
                strokeWidth={2}
                fill="url(#requestsGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: CHART_COLORS.stroke,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height }} className="flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>
          </div>
        )}
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
      <p className="text-lg font-bold text-emerald-500">
        {data.value.toLocaleString("pt-BR")}
        <span className="text-xs font-normal text-muted-foreground ml-1">requests</span>
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
          <Activity className="h-5 w-5 text-emerald-500" />
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
