/**
 * Module detail page with drag-and-drop lesson management.
 *
 * Features:
 * - View and edit module details
 * - Manage lessons with drag-and-drop reordering
 * - Link/unlink existing lessons
 * - Create new lessons directly
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { LessonCard, LessonForm, LessonSelector, ModuleForm } from "@/components/courses";
import { AppLayout } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import {
  ContentStatus,
  type CreateLessonRequest,
  type LessonInModule,
  type UpdateLessonRequest,
  type UpdateModuleRequest,
} from "@/types/courses";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Edit,
  GripVertical,
  Layers,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

// Sortable lesson item component
function SortableLessonItem({
  lesson,
  onEdit,
  onUnlink,
}: {
  lesson: LessonInModule;
  onEdit: (lesson: LessonInModule) => void;
  onUnlink: (lessonId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-3",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <LessonCard lesson={lesson} showActions={false} compact />
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => onEdit(lesson)}>
          <Edit className="h-4 w-4" />
          <span className="sr-only">Editar</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onUnlink(lesson.id)}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Desvincular</span>
        </Button>
      </div>
    </div>
  );
}

function ModuleDetailContent() {
  const { id } = useParams<{ id: string }>();

  // Track initial load separately from other loading states
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Dialogs state
  const [isModuleFormOpen, setIsModuleFormOpen] = useState(false);
  const [isLessonFormOpen, setIsLessonFormOpen] = useState(false);
  const [isLessonSelectorOpen, setIsLessonSelectorOpen] = useState(false);

  // Editing state
  const [editingLesson, setEditingLesson] = useState<LessonInModule | null>(null);

  // Local lessons state for optimistic reordering
  const [localLessons, setLocalLessons] = useState<LessonInModule[]>([]);

  const {
    currentModule,
    isLoading,
    isSubmitting,
    error,
    fetchModule,
    updateModule,
    linkLesson,
    unlinkLesson,
    reorderLessons,
    createLesson,
    updateLesson,
    clearError,
  } = useCoursesStore();

  // Sync local lessons with store
  useEffect(() => {
    if (currentModule?.lessons) {
      setLocalLessons(currentModule.lessons);
    }
  }, [currentModule?.lessons]);

  useEffect(() => {
    if (id) {
      fetchModule(id).finally(() => setIsInitialLoad(false));
    }
  }, [id, fetchModule]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle drag end for reordering
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !currentModule) return;

    const oldIndex = localLessons.findIndex((l) => l.id === active.id);
    const newIndex = localLessons.findIndex((l) => l.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const newOrder = arrayMove(localLessons, oldIndex, newIndex);
    setLocalLessons(newOrder);

    // Persist to server
    try {
      await reorderLessons(
        currentModule.id,
        newOrder.map((l) => l.id),
      );
    } catch {
      // Revert on error - fetchModule will restore correct order
      if (id) fetchModule(id);
    }
  };

  // Module actions
  const handleUpdateModule = async (data: UpdateModuleRequest) => {
    if (!currentModule) return;
    await updateModule(currentModule.id, data);
  };

  // Lesson actions
  const handleAddLesson = () => {
    setIsLessonSelectorOpen(true);
  };

  const handleCreateLesson = () => {
    setEditingLesson(null);
    setIsLessonFormOpen(true);
  };

  const handleEditLesson = (lesson: LessonInModule) => {
    setEditingLesson(lesson);
    setIsLessonFormOpen(true);
  };

  const handleUnlinkLesson = async (lessonId: string) => {
    if (!currentModule) return;
    if (window.confirm("Deseja desvincular esta aula do modulo?")) {
      await unlinkLesson(currentModule.id, lessonId);
    }
  };

  const handleSelectLesson = async (lessonId: string) => {
    if (!currentModule) return;
    await linkLesson(currentModule.id, lessonId);
  };

  const handleLessonSubmit = async (data: CreateLessonRequest | UpdateLessonRequest) => {
    if (editingLesson) {
      await updateLesson(editingLesson.id, data);
    } else if (currentModule) {
      const newLesson = await createLesson(data as CreateLessonRequest);
      // Link the new lesson to the module
      await linkLesson(currentModule.id, newLesson.id);
    }
  };

  // Get excluded IDs for selector
  const getExcludedLessonIds = useCallback(() => {
    return currentModule?.lessons.map((l) => l.id) ?? [];
  }, [currentModule]);

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

  if (!currentModule) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Modulo nao encontrado</AlertTitle>
            <AlertDescription>O modulo solicitado nao existe ou foi removido.</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to="/modules">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para modulos
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
                <Link to="/modules">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <h1 className="text-2xl font-bold">{currentModule.title}</h1>
              <Badge
                variant="outline"
                className={cn("text-sm", statusColors[currentModule.status])}
              >
                {statusLabels[currentModule.status]}
              </Badge>
            </div>
            {currentModule.description && (
              <p className="text-muted-foreground ml-10">{currentModule.description}</p>
            )}
          </div>
          <Button onClick={() => setIsModuleFormOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
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

        <Tabs defaultValue="lessons" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lessons">
              <Layers className="mr-2 h-4 w-4" />
              Aulas ({localLessons.length})
            </TabsTrigger>
            <TabsTrigger value="info">
              <BookOpen className="mr-2 h-4 w-4" />
              Informacoes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons" className="space-y-4">
            {/* Lessons List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Aulas do Modulo</CardTitle>
                    <CardDescription>
                      Arraste para reordenar. {localLessons.length}{" "}
                      {localLessons.length === 1 ? "aula" : "aulas"}.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleAddLesson}>
                      <Plus className="mr-2 h-4 w-4" />
                      Vincular Aula
                    </Button>
                    <Button onClick={handleCreateLesson}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Aula
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {localLessons.length === 0 ? (
                  <div className="text-center py-8">
                    <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma aula vinculada</h3>
                    <p className="text-muted-foreground mt-1">
                      Adicione aulas a este modulo para comecar
                    </p>
                    <div className="flex justify-center gap-2 mt-4">
                      <Button variant="outline" onClick={handleAddLesson}>
                        <Plus className="mr-2 h-4 w-4" />
                        Vincular Aula Existente
                      </Button>
                      <Button onClick={handleCreateLesson}>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Nova Aula
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localLessons.map((l) => l.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {localLessons.map((lesson) => (
                          <SortableLessonItem
                            key={lesson.id}
                            lesson={lesson}
                            onEdit={handleEditLesson}
                            onUnlink={handleUnlinkLesson}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info">
            <Card>
              <CardHeader>
                <CardTitle>Detalhes do Modulo</CardTitle>
                <CardDescription>Informacoes gerais sobre o modulo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                      Slug
                    </div>
                    <p className="font-mono text-sm">{currentModule.slug}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="h-4 w-4" />
                      Aulas
                    </div>
                    <p>{currentModule.lesson_count} aulas</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Criado em
                    </div>
                    <p>
                      {new Date(currentModule.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {currentModule.updated_at && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Atualizado em
                      </div>
                      <p>
                        {new Date(currentModule.updated_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {currentModule.thumbnail_url && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Imagem de Capa
                      </div>
                      <img
                        src={currentModule.thumbnail_url}
                        alt={currentModule.title}
                        className="max-w-xs rounded-lg border"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <ModuleForm
          open={isModuleFormOpen}
          onOpenChange={setIsModuleFormOpen}
          module={currentModule}
          onSubmit={handleUpdateModule}
          isSubmitting={isSubmitting}
        />

        <LessonForm
          open={isLessonFormOpen}
          onOpenChange={setIsLessonFormOpen}
          lesson={editingLesson}
          onSubmit={handleLessonSubmit}
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

export function ModuleDetailPage() {
  return (
    <ProtectedRoute requiredRole="teacher">
      <ModuleDetailContent />
    </ProtectedRoute>
  );
}

export default ModuleDetailPage;
