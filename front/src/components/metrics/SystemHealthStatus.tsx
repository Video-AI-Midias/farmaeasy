/**
 * System health status component with CPU, memory, and disk metrics.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DiskInfo, MetricsHealthResponse } from "@/types/metrics";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Server,
  XCircle,
} from "lucide-react";

interface SystemHealthStatusProps {
  data: MetricsHealthResponse | undefined;
  isLoading?: boolean;
}

export function SystemHealthStatus({ data, isLoading = false }: SystemHealthStatusProps) {
  if (isLoading) {
    return <SystemHealthSkeleton />;
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Status do Sistema</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Dados não disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  const uptimeFormatted = formatUptime(data.uptime_seconds);
  const lastFlush = data.last_flush_at
    ? format(parseISO(data.last_flush_at), "HH:mm:ss", { locale: ptBR })
    : "N/A";

  const sysRes = data.system_resources;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Status do Sistema</CardTitle>
          </div>
          <HealthBadge healthy={data.healthy} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="grid grid-cols-2 gap-4">
          <ConnectionStatus
            label="Cassandra"
            connected={data.cassandra_connected}
            icon={Database}
          />
          <ConnectionStatus label="Redis" connected={data.redis_connected} icon={HardDrive} />
        </div>

        {/* System Resources - CPU & Memory */}
        {sysRes && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recursos do Sistema
            </p>

            {/* CPU */}
            <ResourceBar
              icon={Cpu}
              label="CPU"
              value={sysRes.cpu.usage_percent}
              detail={`${sysRes.cpu.cores_logical} cores${sysRes.cpu.load_avg_1m !== null ? ` • Load: ${sysRes.cpu.load_avg_1m}` : ""}`}
            />

            {/* Memory */}
            <ResourceBar
              icon={MemoryStick}
              label="Memória"
              value={sysRes.memory.usage_percent}
              detail={`${formatBytes(sysRes.memory.used_bytes)} / ${formatBytes(sysRes.memory.total_bytes)}`}
            />

            {/* Disk(s) */}
            {sysRes.disks.map((disk) => (
              <DiskBar key={disk.mount_point} disk={disk} />
            ))}

            {/* Process Count */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Processos ativos</span>
              <span className="font-medium text-foreground">
                {sysRes.process_count.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        )}

        {/* Queue Status */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fila de Eventos</span>
            <span className="font-medium">
              {data.queue_size.toLocaleString("pt-BR")} /{" "}
              {data.queue_capacity.toLocaleString("pt-BR")}
            </span>
          </div>
          <Progress value={data.queue_utilization * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {(data.queue_utilization * 100).toFixed(1)}% utilizado
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <StatItem
            icon={Server}
            label="Emitter"
            value={data.emitter_running ? "Ativo" : "Parado"}
            variant={data.emitter_running ? "success" : "error"}
          />
          <StatItem icon={Clock} label="Uptime" value={uptimeFormatted} />
          <StatItem
            icon={CheckCircle2}
            label="Processados"
            value={data.events_processed_total.toLocaleString("pt-BR")}
          />
          <StatItem
            icon={XCircle}
            label="Descartados"
            value={data.events_dropped_total.toLocaleString("pt-BR")}
            variant={data.events_dropped_total > 0 ? "warning" : "default"}
          />
        </div>

        {/* Last Flush */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Último flush: <span className="font-medium">{lastFlush}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface HealthBadgeProps {
  healthy: boolean;
}

function HealthBadge({ healthy }: HealthBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        healthy
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", healthy ? "bg-emerald-500" : "bg-red-500")} />
      {healthy ? "Saudável" : "Degradado"}
    </div>
  );
}

interface ConnectionStatusProps {
  label: string;
  connected: boolean;
  icon: React.ElementType;
}

function ConnectionStatus({ label, connected, icon: Icon }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          connected ? "bg-emerald-500/10" : "bg-red-500/10",
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5",
            connected ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          )}
        />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p
          className={cn(
            "text-xs",
            connected ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          )}
        >
          {connected ? "Conectado" : "Desconectado"}
        </p>
      </div>
    </div>
  );
}

interface ResourceBarProps {
  icon: React.ElementType;
  label: string;
  value: number;
  detail: string;
}

function ResourceBar({ icon: Icon, label, value, detail }: ResourceBarProps) {
  const getBarColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const getTextColor = (percent: number) => {
    if (percent >= 90) return "text-red-600 dark:text-red-400";
    if (percent >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={cn("text-sm font-semibold", getTextColor(value))}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", getBarColor(value))}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

interface DiskBarProps {
  disk: DiskInfo;
}

function DiskBar({ disk }: DiskBarProps) {
  return (
    <ResourceBar
      icon={HardDrive}
      label={`Disco (${disk.mount_point})`}
      value={disk.usage_percent}
      detail={`${formatBytes(disk.used_bytes)} / ${formatBytes(disk.total_bytes)} • ${formatBytes(disk.free_bytes)} livre`}
    />
  );
}

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  variant?: "default" | "success" | "warning" | "error";
}

function StatItem({ icon: Icon, label, value, variant = "default" }: StatItemProps) {
  const valueClasses = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-yellow-600 dark:text-yellow-400",
    error: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium", valueClasses[variant])}>{value}</p>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function SystemHealthSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">Status do Sistema</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 gap-4 pt-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </CardContent>
    </Card>
  );
}
