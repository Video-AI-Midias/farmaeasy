/**
 * Modules listing page (admin/teacher).
 *
 * Displays all modules with filtering and CRUD operations.
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ModuleForm } from "@/components/courses";
import { AppLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import {
  ContentStatus,
  type CreateModuleRequest,
  type Module,
  type ModuleFilters,
  type UpdateModuleRequest,
} from "@/types/courses";
import { Edit, Eye, GraduationCap, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

function ModulesContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);

  const {
    modules,
    isLoading,
    isSubmitting,
    error,
    fetchModules,
    createModule,
    updateModule,
    deleteModule,
    clearError,
  } = useCoursesStore();

  // Note: No need for separate initial fetch - handleSearch handles initial load via debounced effect

  const handleSearch = useCallback(() => {
    const filters: ModuleFilters = {};
    if (search) filters.search = search;
    if (statusFilter !== "all") filters.status = statusFilter;
    fetchModules(filters);
  }, [fetchModules, search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounce);
  }, [handleSearch]);

  const handleCreate = () => {
    setEditingModule(null);
    setIsFormOpen(true);
  };

  const handleEdit = (module: Module) => {
    setEditingModule(module);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este modulo?")) {
      try {
        await deleteModule(id);
      } catch {
        // Error handled by store
      }
    }
  };

  const handleSubmit = async (data: CreateModuleRequest | UpdateModuleRequest) => {
    try {
      if (editingModule) {
        await updateModule(editingModule.id, data);
      } else {
        await createModule(data as CreateModuleRequest);
      }
    } catch {
      // Error handled by store
    }
  };

  const statusColors: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    [ContentStatus.PUBLISHED]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    [ContentStatus.ARCHIVED]: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  const statusLabels: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "Rascunho",
    [ContentStatus.PUBLISHED]: "Publicado",
    [ContentStatus.ARCHIVED]: "Arquivado",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6" />
              Modulos
            </h1>
            <p className="text-muted-foreground">Gerencie os modulos da plataforma</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Modulo
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar modulos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as ContentStatus | "all")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value={ContentStatus.DRAFT}>Rascunho</SelectItem>
                  <SelectItem value={ContentStatus.PUBLISHED}>Publicado</SelectItem>
                  <SelectItem value={ContentStatus.ARCHIVED}>Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-destructive">{error}</p>
                <Button variant="ghost" size="sm" onClick={clearError}>
                  Fechar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Modulos</CardTitle>
            <CardDescription>
              {modules.length} {modules.length === 1 ? "modulo encontrado" : "modulos encontrados"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : modules.length === 0 ? (
              <div className="text-center py-8">
                <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Nenhum modulo encontrado</h3>
                <p className="text-muted-foreground mt-1">
                  {search || statusFilter !== "all"
                    ? "Tente ajustar os filtros"
                    : "Crie seu primeiro modulo"}
                </p>
                {!search && statusFilter === "all" && (
                  <Button className="mt-4" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Modulo
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Aulas</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules.map((module) => (
                    <TableRow key={module.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{module.title}</p>
                          {module.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {module.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", statusColors[module.status])}
                        >
                          {statusLabels[module.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{module.lesson_count}</TableCell>
                      <TableCell>
                        {new Date(module.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/modulos/${module.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">Ver</span>
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(module)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(module.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Form Dialog */}
        <ModuleForm
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          module={editingModule}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppLayout>
  );
}

export function ModulesPage() {
  return (
    <ProtectedRoute requiredRole="teacher">
      <ModulesContent />
    </ProtectedRoute>
  );
}

export default ModulesPage;
