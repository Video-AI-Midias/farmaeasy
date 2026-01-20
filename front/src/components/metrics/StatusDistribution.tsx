/**
 * Status code distribution chart (donut/pie).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart as PieChartIcon } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface StatusDistributionProps {
  data: Record<string, number>;
  isLoading?: boolean;
  title?: string;
  height?: number;
}

interface ChartDataPoint {
  name: string;
  value: number;
  color: string;
  percentage: number;
  [key: string]: string | number;
}

// Cores para cada categoria de status HTTP
const STATUS_COLORS: Record<string, string> = {
  "2xx": "hsl(142, 76%, 36%)", // Green - Success
  "3xx": "hsl(217, 91%, 60%)", // Blue - Redirect
  "4xx": "hsl(45, 93%, 47%)", // Yellow/Orange - Client error
  "5xx": "hsl(0, 84%, 60%)", // Red - Server error
  default: "hsl(var(--muted-foreground))",
};

function getStatusCategory(status: string): string {
  if (status.startsWith("2")) return "2xx";
  if (status.startsWith("3")) return "3xx";
  if (status.startsWith("4")) return "4xx";
  if (status.startsWith("5")) return "5xx";
  return "default";
}

function getStatusColor(status: string): string {
  const category = getStatusCategory(status);
  const color = STATUS_COLORS[category];
  return color !== undefined ? color : "hsl(var(--muted-foreground))";
}

function transformData(data: Record<string, number>): ChartDataPoint[] {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);

  return Object.entries(data)
    .map(([status, count]) => ({
      name: status,
      value: count,
      color: getStatusColor(status),
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function StatusDistribution({
  data,
  isLoading = false,
  title = "Distribuição de Status",
  height = 300,
}: StatusDistributionProps) {
  if (isLoading) {
    return <StatusDistributionSkeleton height={height} title={title} />;
  }

  const chartData = transformData(data);
  const hasData = chartData.length > 0 && chartData.some((d) => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} stroke="hsl(var(--background))" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                formatter={(value: string) => <span className="text-xs">{value}</span>}
              />
            </PieChart>
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

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: data.color }} />
        <span className="text-sm font-medium">{data.name}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.value.toLocaleString("pt-BR")} requests ({data.percentage.toFixed(1)}%)
      </p>
    </div>
  );
}

interface SkeletonProps {
  height: number;
  title: string;
}

function StatusDistributionSkeleton({ height, title }: SkeletonProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="flex items-center justify-center">
          <Skeleton className="h-44 w-44 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
