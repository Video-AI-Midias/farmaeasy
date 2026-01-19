/**
 * Lessons listing page (admin/teacher).
 *
 * Displays all lessons with filtering and CRUD operations.
 * Lessons are standalone entities that can be linked to multiple modules.
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LessonForm } from "@/components/courses";
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
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import {
  ContentStatus,
  ContentType,
  type CreateLessonRequest,
  type Lesson,
  type LessonFilters,
  type UpdateLessonRequest,
} from "@/types/courses";
import {
  AlertTriangle,
  Clock,
  Edit,
  FileIcon,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  PlayCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function LessonsContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const {
    lessons,
    isLoading,
    isSubmitting,
    error,
    fetchLessons,
    createLesson,
    updateLesson,
    deleteLesson,
    clearError,
  } = useCoursesStore();

  // Note: No need for separate initial fetch - handleSearch handles initial load via debounced effect

  const handleSearch = useCallback(() => {
    const filters: LessonFilters = {};
    if (search) filters.search = search;
    if (statusFilter !== "all") filters.status = statusFilter;
    if (contentTypeFilter !== "all") filters.content_type = contentTypeFilter;
    fetchLessons(filters);
  }, [fetchLessons, search, statusFilter, contentTypeFilter]);

  useEffect(() => {
    const debounce = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounce);
  }, [handleSearch]);

  const handleCreate = () => {
    setEditingLesson(null);
    setIsFormOpen(true);
  };

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir esta aula?")) {
      try {
        await deleteLesson(id);
      } catch {
        // Error handled by store
      }
    }
  };

  const handleSubmit = async (data: CreateLessonRequest | UpdateLessonRequest) => {
    try {
      if (editingLesson) {
        await updateLesson(editingLesson.id, data);
      } else {
        await createLesson(data as CreateLessonRequest);
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

  const contentTypeIcons: Record<ContentType, typeof PlayCircle> = {
    [ContentType.VIDEO]: PlayCircle,
    [ContentType.TEXT]: FileText,
    [ContentType.QUIZ]: HelpCircle,
    [ContentType.PDF]: FileIcon,
    [ContentType.EMBED]: Globe,
  };

  const contentTypeLabels: Record<ContentType, string> = {
    [ContentType.VIDEO]: "Video",
    [ContentType.TEXT]: "Texto",
    [ContentType.QUIZ]: "Quiz",
    [ContentType.PDF]: "PDF",
    [ContentType.EMBED]: "Apresentacao",
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "-";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}min`;
    return `${minutes}min ${remainingSeconds}s`;
  };

  /** Get validation message for invalid lessons */
  const getInvalidMessage = (lesson: Lesson): string | null => {
    if (lesson.is_valid) return null;
    switch (lesson.content_type) {
      case ContentType.VIDEO:
        return "Falta URL do video";
      case ContentType.PDF:
        return "Falta URL do PDF";
      case ContentType.TEXT:
        return "Falta conteudo/descricao";
      default:
        return "Conteudo incompleto";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PlayCircle className="h-6 w-6" />
              Aulas
            </h1>
            <p className="text-muted-foreground">
              Gerencie as aulas da plataforma. Aulas podem ser vinculadas a multiplos modulos.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Aula
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar aulas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={contentTypeFilter}
                onValueChange={(value) => setContentTypeFilter(value as ContentType | "all")}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value={ContentType.VIDEO}>Video</SelectItem>
                  <SelectItem value={ContentType.TEXT}>Texto</SelectItem>
                  <SelectItem value={ContentType.QUIZ}>Quiz</SelectItem>
                  <SelectItem value={ContentType.PDF}>PDF</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as ContentStatus | "all")}
              >
                <SelectTrigger className="w-[150px]">
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
            <CardTitle>Lista de Aulas</CardTitle>
            <CardDescription>
              {lessons.length} {lessons.length === 1 ? "aula encontrada" : "aulas encontradas"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : lessons.length === 0 ? (
              <div className="text-center py-8">
                <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Nenhuma aula encontrada</h3>
                <p className="text-muted-foreground mt-1">
                  {search || statusFilter !== "all" || contentTypeFilter !== "all"
                    ? "Tente ajustar os filtros"
                    : "Crie sua primeira aula"}
                </p>
                {!search && statusFilter === "all" && contentTypeFilter === "all" && (
                  <Button className="mt-4" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Aula
                  </Button>
                )}
              </div>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%] min-w-[200px] max-w-[350px]">Titulo</TableHead>
                    <TableHead className="w-[80px]">Tipo</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[90px] text-center">Duracao</TableHead>
                    <TableHead className="w-[100px]">Criado em</TableHead>
                    <TableHead className="w-[100px] text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lessons.map((lesson) => {
                    const Icon = contentTypeIcons[lesson.content_type];
                    return (
                      <TableRow key={lesson.id}>
                        <TableCell className="max-w-[350px]">
                          <div className="flex items-start gap-3 overflow-hidden">
                            <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="overflow-hidden min-w-0">
                              <TruncatedText lines={1} className="font-medium">
                                {lesson.title}
                              </TruncatedText>
                              {lesson.description && (
                                <TruncatedText lines={1} className="text-sm text-muted-foreground">
                                  {lesson.description}
                                </TruncatedText>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {contentTypeLabels[lesson.content_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={cn("text-xs w-fit", statusColors[lesson.status])}
                            >
                              {statusLabels[lesson.status]}
                            </Badge>
                            {!lesson.is_valid && (
                              <Badge
                                variant="destructive"
                                className="text-xs w-fit flex items-center gap-1"
                                title={getInvalidMessage(lesson) ?? undefined}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Incompleta
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {lesson.duration_seconds ? (
                            <div className="flex items-center justify-center gap-1 text-sm">
                              <Clock className="h-3 w-3" />
                              {formatDuration(lesson.duration_seconds)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(lesson.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(lesson)}>
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(lesson.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Excluir</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Form Dialog */}
        <LessonForm
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          lesson={editingLesson}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppLayout>
  );
}

export function LessonsPage() {
  return (
    <ProtectedRoute requiredRole="teacher">
      <LessonsContent />
    </ProtectedRoute>
  );
}

export default LessonsPage;
