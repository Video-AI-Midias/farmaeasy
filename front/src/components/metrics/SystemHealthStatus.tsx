/**
 * System health status component with CPU, memory, and disk metrics.
 * Compact UI with collapsible disk section.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MetricsHealthResponse } from "@/types/metrics";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Server,
  XCircle,
} from "lucide-react";
import { useState } from "react";

// Thresholds para cores
const THRESHOLDS = {
  warning: 60, // Amarelo >= 60%
  critical: 85, // Vermelho >= 85%
};

interface SystemHealthStatusProps {
  data: MetricsHealthResponse | undefined;
  isLoading?: boolean;
}

export function SystemHealthStatus({ data, isLoading = false }: SystemHealthStatusProps) {
  const [disksOpen, setDisksOpen] = useState(false);

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

  // Filtrar discos: apenas partições principais (não bind mounts de arquivos)
  const filteredDisks =
    sysRes?.disks.filter((disk) => {
      // Aceitar apenas mount points que são diretórios raiz ou comuns
      const validMounts = ["/", "/home", "/var", "/tmp", "/opt", "/usr", "/data", "/mnt", "/media"];
      // Verificar se é um dos mount points válidos ou se começa com /mnt/ ou /media/
      return (
        validMounts.includes(disk.mount_point) ||
        disk.mount_point.startsWith("/mnt/") ||
        disk.mount_point.startsWith("/media/") ||
        disk.mount_point.startsWith("/data/")
      );
    }) || [];

  // Se não houver discos após filtragem, mostrar todos (fallback)
  const disksToShow = filteredDisks.length > 0 ? filteredDisks : sysRes?.disks || [];

  // Separar disco principal (/) dos demais
  const mainDisk = disksToShow.find((d) => d.mount_point === "/");
  const otherDisks = disksToShow.filter((d) => d.mount_point !== "/");

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
      <CardContent className="space-y-3">
        {/* Connection Status - Compact */}
        <div className="grid grid-cols-2 gap-2">
          <ConnectionStatus
            label="Cassandra"
            connected={data.cassandra_connected}
            icon={Database}
          />
          <ConnectionStatus label="Redis" connected={data.redis_connected} icon={HardDrive} />
        </div>

        {/* System Resources */}
        {sysRes && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recursos do Sistema
            </p>

            {/* CPU - Inline compact */}
            <CompactResourceRow
              icon={Cpu}
              label="CPU"
              value={sysRes.cpu.usage_percent}
              detail={`${sysRes.cpu.cores_logical} cores${sysRes.cpu.load_avg_1m !== null ? ` • Load: ${sysRes.cpu.load_avg_1m}` : ""}`}
            />

            {/* Memory - Inline compact */}
            <CompactResourceRow
              icon={MemoryStick}
              label="Memória"
              value={sysRes.memory.usage_percent}
              detail={`${formatBytes(sysRes.memory.used_bytes)} / ${formatBytes(sysRes.memory.total_bytes)}`}
            />

            {/* Disk principal + acordeão para outros */}
            {mainDisk && (
              <CompactResourceRow
                icon={HardDrive}
                label="Disco"
                value={mainDisk.usage_percent}
                detail={`${formatBytes(mainDisk.used_bytes)} / ${formatBytes(mainDisk.total_bytes)}`}
              />
            )}

            {/* Acordeão para discos adicionais */}
            {otherDisks.length > 0 && (
              <Collapsible open={disksOpen} onOpenChange={setDisksOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      disksOpen && "rotate-180",
                    )}
                  />
                  <span>
                    {disksOpen ? "Ocultar" : "Mostrar"} {otherDisks.length} disco
                    {otherDisks.length > 1 ? "s" : ""}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {otherDisks.map((disk) => (
                    <CompactResourceRow
                      key={disk.mount_point}
                      icon={HardDrive}
                      label={disk.mount_point}
                      value={disk.usage_percent}
                      detail={`${formatBytes(disk.free_bytes)} livre`}
                      compact
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Process Count - inline */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Processos ativos</span>
              <span className="font-medium">{sysRes.process_count.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        )}

        {/* Queue Status - Compact */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Fila de Eventos</span>
            <span className="font-medium">
              {data.queue_size.toLocaleString("pt-BR")} /{" "}
              {data.queue_capacity.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                getBarColor(data.queue_utilization * 100),
              )}
              style={{ width: `${Math.min(data.queue_utilization * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid - Compact 2x2 */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t text-xs">
          <StatItemCompact
            icon={Server}
            label="Emitter"
            value={data.emitter_running ? "Ativo" : "Parado"}
            variant={data.emitter_running ? "success" : "error"}
          />
          <StatItemCompact icon={Clock} label="Uptime" value={uptimeFormatted} />
          <StatItemCompact
            icon={CheckCircle2}
            label="Processados"
            value={data.events_processed_total.toLocaleString("pt-BR")}
            variant="success"
          />
          <StatItemCompact
            icon={XCircle}
            label="Descartados"
            value={data.events_dropped_total.toLocaleString("pt-BR")}
            variant={data.events_dropped_total > 0 ? "error" : "default"}
          />
        </div>

        {/* Last Flush - inline */}
        <div className="text-xs text-muted-foreground pt-1 border-t">
          Último flush: <span className="font-medium">{lastFlush}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions para cores
function getBarColor(percent: number): string {
  if (percent >= THRESHOLDS.critical) return "bg-red-500";
  if (percent >= THRESHOLDS.warning) return "bg-yellow-500";
  return "bg-emerald-500";
}

function getTextColor(percent: number): string {
  if (percent >= THRESHOLDS.critical) return "text-red-500";
  if (percent >= THRESHOLDS.warning) return "text-yellow-500";
  return "text-emerald-500";
}

interface HealthBadgeProps {
  healthy: boolean;
}

function HealthBadge({ healthy }: HealthBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        healthy ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500",
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
    <div className="flex items-center gap-2 rounded-lg border p-2">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          connected ? "bg-emerald-500/10" : "bg-red-500/10",
        )}
      >
        <Icon className={cn("h-4 w-4", connected ? "text-emerald-500" : "text-red-500")} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
        <p className={cn("text-[10px]", connected ? "text-emerald-500" : "text-red-500")}>
          {connected ? "Conectado" : "Desconectado"}
        </p>
      </div>
    </div>
  );
}

interface CompactResourceRowProps {
  icon: React.ElementType;
  label: string;
  value: number;
  detail: string;
  compact?: boolean;
}

function CompactResourceRow({
  icon: Icon,
  label,
  value,
  detail,
  compact = false,
}: CompactResourceRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", getTextColor(value))} />
          <span className={cn("font-medium", compact && "text-muted-foreground")}>{label}</span>
        </div>
        <span className={cn("font-semibold tabular-nums", getTextColor(value))}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", getBarColor(value))}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

interface StatItemCompactProps {
  icon: React.ElementType;
  label: string;
  value: string;
  variant?: "default" | "success" | "warning" | "error";
}

function StatItemCompact({ icon: Icon, label, value, variant = "default" }: StatItemCompactProps) {
  const iconClasses = {
    default: "text-muted-foreground",
    success: "text-emerald-500",
    warning: "text-yellow-500",
    error: "text-red-500",
  };

  const valueClasses = {
    default: "text-foreground",
    success: "text-emerald-500",
    warning: "text-yellow-500",
    error: "text-red-500",
  };

  return (
    <div className="text-center">
      <Icon className={cn("h-3.5 w-3.5 mx-auto mb-0.5", iconClasses[variant])} />
      <p className={cn("font-semibold tabular-nums", valueClasses[variant])}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
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
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
        <Skeleton className="h-6 w-full" />
        <div className="grid grid-cols-4 gap-2 pt-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </CardContent>
    </Card>
  );
}
