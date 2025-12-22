/**
 * Courses listing page (admin/teacher).
 *
 * Displays all courses with filtering and CRUD operations.
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CourseForm } from "@/components/courses";
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
  type Course,
  type CreateCourseRequest,
  type UpdateCourseRequest,
} from "@/types/courses";
import { BookOpen, Edit, Eye, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

function CoursesContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const {
    courses,
    isLoading,
    isSubmitting,
    error,
    fetchCourses,
    createCourse,
    updateCourse,
    deleteCourse,
    clearError,
  } = useCoursesStore();

  // Note: No need for separate initial fetch - handleSearch handles initial load via debounced effect

  const handleSearch = useCallback(() => {
    fetchCourses({
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    });
  }, [fetchCourses, search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounce);
  }, [handleSearch]);

  const handleCreate = () => {
    setEditingCourse(null);
    setIsFormOpen(true);
  };

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este curso?")) {
      try {
        await deleteCourse(id);
      } catch {
        // Error handled by store
      }
    }
  };

  const handleSubmit = async (data: CreateCourseRequest | UpdateCourseRequest) => {
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, data);
      } else {
        await createCourse(data as CreateCourseRequest);
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
              <BookOpen className="h-6 w-6" />
              Cursos
            </h1>
            <p className="text-muted-foreground">Gerencie os cursos da plataforma</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Curso
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar cursos..."
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
            <CardTitle>Lista de Cursos</CardTitle>
            <CardDescription>
              {courses.length} {courses.length === 1 ? "curso encontrado" : "cursos encontrados"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
                <p className="text-muted-foreground mt-1">
                  {search || statusFilter !== "all"
                    ? "Tente ajustar os filtros"
                    : "Crie seu primeiro curso"}
                </p>
                {!search && statusFilter === "all" && (
                  <Button className="mt-4" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Curso
                  </Button>
                )}
              </div>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%] min-w-[200px] max-w-[400px]">Titulo</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px] text-center">Modulos</TableHead>
                    <TableHead className="w-[120px]">Criado em</TableHead>
                    <TableHead className="w-[120px] text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell className="max-w-[400px]">
                        <div className="space-y-0.5 overflow-hidden">
                          <TruncatedText lines={1} className="font-medium">
                            {course.title}
                          </TruncatedText>
                          {course.description && (
                            <TruncatedText lines={1} className="text-sm text-muted-foreground">
                              {course.description}
                            </TruncatedText>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", statusColors[course.status])}
                        >
                          {statusLabels[course.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{course.module_count}</TableCell>
                      <TableCell>
                        {new Date(course.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" asChild>
                            <Link to={`/cursos/${course.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">Ver</span>
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(course)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(course.id)}
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
        <CourseForm
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          course={editingCourse}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppLayout>
  );
}

export function CoursesPage() {
  return (
    <ProtectedRoute requiredRole="teacher">
      <CoursesContent />
    </ProtectedRoute>
  );
}

export default CoursesPage;
