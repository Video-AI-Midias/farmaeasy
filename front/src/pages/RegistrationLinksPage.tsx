/**
 * Admin page for managing registration links.
 *
 * Features:
 * - Create new registration links
 * - View all links with status filter
 * - Copy link to clipboard
 * - Revoke pending links
 */

import { CreateLinkDialog, LinksList } from "@/components/admin/registration-links";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

type StatusFilter = "all" | "pending" | "used" | "expired" | "revoked";

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "Todos",
  pending: "Pendentes",
  used: "Utilizados",
  expired: "Expirados",
  revoked: "Revogados",
};

export function RegistrationLinksPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Link2 className="h-6 w-6" />
              Links de Cadastro
            </h1>
            <p className="text-muted-foreground">
              Gere e gerencie links para cadastro de novos alunos com acesso a cursos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Link
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusFilterLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Links List */}
        <LinksList
          key={refreshKey}
          {...(statusFilter !== "all" ? { statusFilter } : {})}
          onRefreshRequest={handleRefresh}
        />

        {/* Create Dialog */}
        <CreateLinkDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleRefresh}
        />
      </div>
    </AppLayout>
  );
}
