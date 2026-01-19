/**
 * Course detail page with drag-and-drop module/lesson management.
 *
 * Features:
 * - View and edit course details
 * - Manage modules with drag-and-drop reordering
 * - Manage lessons within modules with drag-and-drop
 * - Link/unlink existing modules and lessons
 */

import { CourseStudentsPanel } from "@/components/acquisitions";
import { AttachmentsSection } from "@/components/attachments";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  CourseEditor,
  CourseForm,
  LessonForm,
  LessonSelector,
  ModuleForm,
  ModuleSelector,
} from "@/components/courses";
import { AppLayout } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, renderTextWithLinks } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import { EntityType } from "@/types/attachments";
import {
  ContentStatus,
  type CreateLessonRequest,
  type CreateModuleRequest,
  type LessonInModule,
  type ModuleInCourse,
  type UpdateCourseRequest,
  type UpdateLessonRequest,
  type UpdateModuleRequest,
} from "@/types/courses";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Edit,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

function CourseDetailContent() {
  const { id } = useParams<{ id: string }>();

  // Track initial load separately from other loading states
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Dialogs state
  const [isCourseFormOpen, setIsCourseFormOpen] = useState(false);
  const [isModuleFormOpen, setIsModuleFormOpen] = useState(false);
  const [isLessonFormOpen, setIsLessonFormOpen] = useState(false);
  const [isModuleSelectorOpen, setIsModuleSelectorOpen] = useState(false);
  const [isLessonSelectorOpen, setIsLessonSelectorOpen] = useState(false);

  // Editing state
  const [editingModule, setEditingModule] = useState<ModuleInCourse | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonInModule | null>(null);
  const [targetModuleId, setTargetModuleId] = useState<string | null>(null);

  const {
    currentCourse,
    isLoading,
    isSubmitting,
    error,
    fetchCourse,
    updateCourse,
    linkModule,
    unlinkModule,
    createModule,
    updateModule,
    linkLesson,
    unlinkLesson,
    createLesson,
    updateLesson,
    clearError,
  } = useCoursesStore();

  useEffect(() => {
    if (id) {
      fetchCourse(id).finally(() => setIsInitialLoad(false));
    }
  }, [id, fetchCourse]);

  // Course actions
  const handleUpdateCourse = async (data: UpdateCourseRequest) => {
    if (!currentCourse) return;
    await updateCourse(currentCourse.id, data);
  };

  // Module actions
  const handleAddModule = () => {
    setIsModuleSelectorOpen(true);
  };

  const handleCreateModule = () => {
    setEditingModule(null);
    setIsModuleFormOpen(true);
  };

  const handleEditModule = (module: ModuleInCourse) => {
    setEditingModule(module);
    setIsModuleFormOpen(true);
  };

  const handleUnlinkModule = async (moduleId: string) => {
    if (!currentCourse) return;
    if (window.confirm("Deseja desvincular este modulo do curso?")) {
      await unlinkModule(currentCourse.id, moduleId);
    }
  };

  const handleSelectModule = async (moduleId: string) => {
    if (!currentCourse) return;
    await linkModule(currentCourse.id, moduleId);
  };

  const handleModuleSubmit = async (data: CreateModuleRequest | UpdateModuleRequest) => {
    if (editingModule) {
      await updateModule(editingModule.id, data);
    } else {
      const newModule = await createModule(data as CreateModuleRequest);
      // Link the new module to the course
      if (currentCourse) {
        await linkModule(currentCourse.id, newModule.id);
      }
    }
  };

  // Lesson actions
  const handleAddLesson = (moduleId: string) => {
    setTargetModuleId(moduleId);
    setIsLessonSelectorOpen(true);
  };

  const handleEditLesson = (lesson: LessonInModule) => {
    setEditingLesson(lesson);
    setIsLessonFormOpen(true);
  };

  const handleUnlinkLesson = async (moduleId: string, lessonId: string) => {
    if (window.confirm("Deseja desvincular esta aula do modulo?")) {
      await unlinkLesson(moduleId, lessonId);
    }
  };

  const handleSelectLesson = async (lessonId: string) => {
    if (!targetModuleId) return;
    await linkLesson(targetModuleId, lessonId);
  };

  const handleLessonSubmit = async (data: CreateLessonRequest | UpdateLessonRequest) => {
    if (editingLesson) {
      await updateLesson(editingLesson.id, data);
    } else if (targetModuleId) {
      const newLesson = await createLesson(data as CreateLessonRequest);
      // Link the new lesson to the module
      await linkLesson(targetModuleId, newLesson.id);
    }
  };

  // Get excluded IDs for selectors
  const getExcludedModuleIds = useCallback(() => {
    return currentCourse?.modules.map((m) => m.id) ?? [];
  }, [currentCourse]);

  const getExcludedLessonIds = useCallback(() => {
    if (!targetModuleId || !currentCourse) return [];
    const module = currentCourse.modules.find((m) => m.id === targetModuleId);
    return module?.lessons.map((l) => l.id) ?? [];
  }, [targetModuleId, currentCourse]);

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

  // Only show full-page loading on initial load, not for subsequent fetches
  if (isInitialLoad && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!currentCourse) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Curso nao encontrado</AlertTitle>
            <AlertDescription>O curso solicitado nao existe ou foi removido.</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to="/cursos">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para cursos
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/cursos">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <h1 className="text-2xl font-bold">{currentCourse.title}</h1>
              <Badge
                variant="outline"
                className={cn("text-sm", statusColors[currentCourse.status])}
              >
                {statusLabels[currentCourse.status]}
              </Badge>
            </div>
            {currentCourse.description && (
              <p className="text-muted-foreground ml-10 whitespace-pre-wrap">
                {renderTextWithLinks(currentCourse.description)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to={`/aprender/${currentCourse.slug}`} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver Curso
              </Link>
            </Button>
            <Button onClick={() => setIsCourseFormOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button variant="ghost" size="sm" onClick={clearError}>
                Fechar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="structure" className="space-y-4">
          <TabsList>
            <TabsTrigger value="structure">
              <Layers className="mr-2 h-4 w-4" />
              Estrutura
            </TabsTrigger>
            <TabsTrigger value="students">
              <Users className="mr-2 h-4 w-4" />
              Alunos
            </TabsTrigger>
            <TabsTrigger value="info">
              <BookOpen className="mr-2 h-4 w-4" />
              Informacoes
            </TabsTrigger>
            <TabsTrigger value="materials">
              <FileText className="mr-2 h-4 w-4" />
              Materiais
            </TabsTrigger>
          </TabsList>

          <TabsContent value="structure" className="space-y-4">
            <CourseEditor
              course={currentCourse}
              onAddModule={handleAddModule}
              onEditModule={handleEditModule}
              onUnlinkModule={handleUnlinkModule}
              onAddLesson={handleAddLesson}
              onEditLesson={handleEditLesson}
              onUnlinkLesson={handleUnlinkLesson}
            />

            {/* Quick actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Acoes Rapidas</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" onClick={handleCreateModule}>
                  Criar Novo Modulo
                </Button>
                <Button variant="outline" onClick={handleAddModule}>
                  Vincular Modulo Existente
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="students">
            <CourseStudentsPanel courseId={currentCourse.id} courseTitle={currentCourse.title} />
          </TabsContent>

          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle>Detalhes do Curso</CardTitle>
                <CardDescription>Informacoes gerais sobre o curso</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                      Slug
                    </div>
                    <p className="font-mono text-sm">{currentCourse.slug}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="h-4 w-4" />
                      Modulos
                    </div>
                    <p>{currentCourse.module_count} modulos</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Criado em
                    </div>
                    <p>
                      {new Date(currentCourse.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {currentCourse.updated_at && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Atualizado em
                      </div>
                      <p>
                        {new Date(currentCourse.updated_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {currentCourse.thumbnail_url && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Imagem de Capa
                      </div>
                      <img
                        src={currentCourse.thumbnail_url}
                        alt={currentCourse.title}
                        className="max-w-xs rounded-lg border"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials">
            <AttachmentsSection
              entityType={EntityType.COURSE}
              entityId={currentCourse.id}
              title="Materiais do Curso"
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <CourseForm
          open={isCourseFormOpen}
          onOpenChange={setIsCourseFormOpen}
          course={currentCourse}
          onSubmit={handleUpdateCourse}
          isSubmitting={isSubmitting}
        />

        <ModuleForm
          open={isModuleFormOpen}
          onOpenChange={setIsModuleFormOpen}
          module={editingModule}
          onSubmit={handleModuleSubmit}
          isSubmitting={isSubmitting}
        />

        <LessonForm
          open={isLessonFormOpen}
          onOpenChange={setIsLessonFormOpen}
          lesson={editingLesson}
          onSubmit={handleLessonSubmit}
          isSubmitting={isSubmitting}
        />

        <ModuleSelector
          open={isModuleSelectorOpen}
          onOpenChange={setIsModuleSelectorOpen}
          onSelect={handleSelectModule}
          excludeIds={getExcludedModuleIds()}
          isSubmitting={isSubmitting}
        />

        <LessonSelector
          open={isLessonSelectorOpen}
          onOpenChange={setIsLessonSelectorOpen}
          onSelect={handleSelectLesson}
          excludeIds={getExcludedLessonIds()}
          isSubmitting={isSubmitting}
        />
      </div>
    </AppLayout>
  );
}

export function CourseDetailPage() {
  return (
    <ProtectedRoute requiredRole="teacher">
      <CourseDetailContent />
    </ProtectedRoute>
  );
}

export default CourseDetailPage;
