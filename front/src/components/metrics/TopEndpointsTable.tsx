/**
 * Top endpoints table component.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { EndpointStats } from "@/types/metrics";
import { Clock, TrendingUp } from "lucide-react";

interface TopEndpointsTableProps {
  title: string;
  data: EndpointStats[];
  isLoading?: boolean;
  variant?: "busiest" | "slowest";
}

export function TopEndpointsTable({
  title,
  data,
  isLoading = false,
  variant = "busiest",
}: TopEndpointsTableProps) {
  const Icon = variant === "busiest" ? TrendingUp : Clock;

  if (isLoading) {
    return <TopEndpointsTableSkeleton title={title} icon={Icon} />;
  }

  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60%]">Endpoint</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Avg (ms)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((endpoint, index) => (
                <TableRow key={`${endpoint.path}-${index}`}>
                  <TableCell
                    className="font-mono text-sm truncate max-w-[200px]"
                    title={endpoint.path}
                  >
                    {endpoint.path}
                  </TableCell>
                  <TableCell className="text-right">
                    {endpoint.count.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-medium",
                        endpoint.avg_ms < 100
                          ? "text-emerald-600 dark:text-emerald-400"
                          : endpoint.avg_ms < 500
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {endpoint.avg_ms.toFixed(1)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">Sem dados disponíveis</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SkeletonProps {
  title: string;
  icon: React.ElementType;
}

function TopEndpointsTableSkeleton({ title, icon: Icon }: SkeletonProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
