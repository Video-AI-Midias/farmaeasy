/**
 * Metrics Dashboard page.
 * Admin-only page for viewing system metrics and performance data.
 */

import { AppLayout } from "@/components/layout";
import {
  KPICard,
  PeriodSelector,
  RequestsChart,
  ResponseTimeChart,
  StatusDistribution,
  SystemHealthStatus,
  TopEndpointsTable,
} from "@/components/metrics";
import { Button } from "@/components/ui/button";
import {
  metricsKeys,
  useDashboardMetrics,
  useMetricsHealth,
  useRequestMetrics,
  useTimeSeries,
} from "@/hooks/metrics";
import type { PeriodType } from "@/types/metrics";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import { useState } from "react";

export function MetricsDashboardPage() {
  const [period, setPeriod] = useState<PeriodType>("today");
  const queryClient = useQueryClient();

  // Fetch all metrics data
  const dashboard = useDashboardMetrics({ period });
  const requests = useRequestMetrics({ period });
  const health = useMetricsHealth();
  const timeseries = useTimeSeries({
    metricName: "api_request",
    period,
    granularity: period === "today" || period === "yesterday" ? "hourly" : "daily",
  });

  const isLoading = dashboard.isLoading || requests.isLoading;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: metricsKeys.all });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Métricas do Sistema</h1>
          <p className="text-muted-foreground">Monitoramento de performance e métricas de uso</p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Error State */}
        {dashboard.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <p className="font-medium">Erro ao carregar métricas</p>
            </div>
            <p className="mt-1 text-sm text-red-500 dark:text-red-400">
              {dashboard.error instanceof Error ? dashboard.error.message : "Erro desconhecido"}
            </p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total de Requests"
            value={dashboard.data?.requests_total ?? 0}
            trend={dashboard.data?.requests_trend}
            trendIsPositive={true}
            icon={Activity}
            isLoading={dashboard.isLoading}
          />
          <KPICard
            title="Tempo Médio de Resposta"
            value={dashboard.data?.avg_response_time_ms ?? 0}
            icon={Timer}
            isLoading={dashboard.isLoading}
            formatValue={(v) => `${Number(v).toFixed(0)}ms`}
          />
          <KPICard
            title="Usuários Ativos"
            value={dashboard.data?.active_users ?? 0}
            trend={dashboard.data?.users_trend}
            trendIsPositive={true}
            icon={Users}
            isLoading={dashboard.isLoading}
          />
          <KPICard
            title="Matrículas"
            value={dashboard.data?.enrollments ?? 0}
            trend={dashboard.data?.enrollments_trend}
            trendIsPositive={true}
            icon={GraduationCap}
            isLoading={dashboard.isLoading}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Requests com Sucesso"
            value={dashboard.data?.requests_success ?? 0}
            icon={CheckCircle2}
            isLoading={dashboard.isLoading}
          />
          <KPICard
            title="Requests com Erro"
            value={dashboard.data?.requests_error ?? 0}
            icon={AlertCircle}
            isLoading={dashboard.isLoading}
          />
          <KPICard
            title="Conclusões"
            value={dashboard.data?.completions ?? 0}
            icon={BookOpen}
            isLoading={dashboard.isLoading}
          />
          <KPICard
            title="Novos Usuários"
            value={dashboard.data?.new_users ?? 0}
            icon={Users}
            isLoading={dashboard.isLoading}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RequestsChart data={timeseries.data?.data ?? []} isLoading={timeseries.isLoading} />
          </div>
          <div>
            <StatusDistribution
              data={requests.data?.requests_by_status ?? {}}
              isLoading={requests.isLoading}
            />
          </div>
        </div>

        {/* Response Time & System Health */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ResponseTimeChart data={requests.data} isLoading={requests.isLoading} />
          <SystemHealthStatus data={health.data} isLoading={health.isLoading} />
        </div>

        {/* Endpoints Tables */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TopEndpointsTable
            title="Endpoints Mais Acessados"
            data={requests.data?.busiest_endpoints ?? []}
            isLoading={requests.isLoading}
            variant="busiest"
          />
          <TopEndpointsTable
            title="Endpoints Mais Lentos"
            data={requests.data?.slowest_endpoints ?? []}
            isLoading={requests.isLoading}
            variant="slowest"
          />
        </div>
      </div>
    </AppLayout>
  );
}

export default MetricsDashboardPage;
