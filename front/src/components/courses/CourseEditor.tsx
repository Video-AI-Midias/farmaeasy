/**
 * Course editor component with drag-and-drop module/lesson ordering.
 *
 * Features:
 * - Drag and drop reordering of modules
 * - Drag and drop reordering of lessons within modules
 * - Expandable modules to show/hide lessons
 * - Link/unlink modules and lessons
 * - Optimistic updates for smooth UX
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoursesStore } from "@/stores/courses";
import type { CourseDetail, LessonInModule, ModuleInCourse } from "@/types/courses";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BookOpen, Layers, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import LessonCard from "./LessonCard";
import ModuleCard from "./ModuleCard";

interface CourseEditorProps {
  course: CourseDetail;
  onAddModule?: () => void;
  onEditModule?: (module: ModuleInCourse) => void;
  onUnlinkModule?: (moduleId: string) => void;
  onAddLesson?: (moduleId: string) => void;
  onEditLesson?: (lesson: LessonInModule) => void;
  onUnlinkLesson?: (moduleId: string, lessonId: string) => void;
  disabled?: boolean;
}

export function CourseEditor({
  course,
  onAddModule,
  onEditModule,
  onUnlinkModule,
  onAddLesson,
  onEditLesson,
  onUnlinkLesson,
  disabled = false,
}: CourseEditorProps) {
  const [modules, setModules] = useState<ModuleInCourse[]>(course.modules);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"module" | "lesson" | null>(null);

  const { reorderModules, reorderLessons, optimisticReorderModules, optimisticReorderLessons } =
    useCoursesStore();

  // Sync modules when course changes
  useEffect(() => {
    setModules(course.modules);
  }, [course.modules]);

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

  const toggleModuleExpand = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }, []);

  // Find which module contains a lesson
  const findModuleByLessonId = useCallback(
    (lessonId: string): ModuleInCourse | undefined => {
      return modules.find((m) => m.lessons.some((l) => l.id === lessonId));
    },
    [modules],
  );

  // Check if an ID is a module or lesson
  const isModule = useCallback(
    (id: string): boolean => {
      return modules.some((m) => m.id === id);
    },
    [modules],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = String(active.id);
    setActiveId(id);
    setActiveType(isModule(id) ? "module" : "lesson");
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Handle dragging lessons between modules if needed
    // For now, we only support reordering within the same container
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      setActiveType(null);
      return;
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (activeType === "module") {
      // Reordering modules
      const oldIndex = modules.findIndex((m) => m.id === activeIdStr);
      const newIndex = modules.findIndex((m) => m.id === overIdStr);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newModules = arrayMove(modules, oldIndex, newIndex);
        setModules(newModules);

        // Optimistic update
        optimisticReorderModules(course.id, newModules);

        // Persist to backend
        try {
          await reorderModules(
            course.id,
            newModules.map((m) => m.id),
          );
        } catch {
          // Revert on error - store will refetch
          setModules(course.modules);
        }
      }
    } else if (activeType === "lesson") {
      // Reordering lessons within a module
      const sourceModule = findModuleByLessonId(activeIdStr);
      const targetModule = isModule(overIdStr)
        ? modules.find((m) => m.id === overIdStr)
        : findModuleByLessonId(overIdStr);

      // Only support reordering within the same module for now
      if (sourceModule && targetModule && sourceModule.id === targetModule.id) {
        const moduleIndex = modules.findIndex((m) => m.id === sourceModule.id);
        const oldIndex = sourceModule.lessons.findIndex((l) => l.id === activeIdStr);
        const newIndex = sourceModule.lessons.findIndex((l) => l.id === overIdStr);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newLessons = arrayMove(sourceModule.lessons, oldIndex, newIndex);
          const newModules = [...modules];
          newModules[moduleIndex] = { ...sourceModule, lessons: newLessons };
          setModules(newModules);

          // Optimistic update
          optimisticReorderLessons(
            sourceModule.id,
            newLessons.map((l) => l.id),
          );

          // Persist to backend
          try {
            await reorderLessons(
              sourceModule.id,
              newLessons.map((l) => l.id),
            );
          } catch {
            // Revert on error - store will refetch
            setModules(course.modules);
          }
        }
      }
    }

    setActiveId(null);
    setActiveType(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Estrutura do Curso
            </CardTitle>
            <CardDescription>Arraste para reordenar modulos e aulas</CardDescription>
          </div>
          {onAddModule && (
            <Button onClick={onAddModule} disabled={disabled}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Modulo
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {modules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum modulo adicionado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione modulos para estruturar o conteudo do curso
            </p>
            {onAddModule && (
              <Button onClick={onAddModule} className="mt-4" disabled={disabled}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Primeiro Modulo
              </Button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={modules.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
              disabled={disabled}
            >
              <div className="space-y-3">
                {modules.map((module) => {
                  const isExpanded = expandedModules.has(module.id);

                  return (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      onEdit={onEditModule}
                      onUnlink={onUnlinkModule}
                      disabled={disabled}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleModuleExpand(module.id)}
                    >
                      {/* Lessons within module */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Aulas</span>
                          {onAddLesson && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onAddLesson(module.id)}
                              disabled={disabled}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              Adicionar
                            </Button>
                          )}
                        </div>

                        {module.lessons.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            Nenhuma aula neste modulo
                          </div>
                        ) : (
                          <SortableContext
                            items={module.lessons.map((l) => l.id)}
                            strategy={verticalListSortingStrategy}
                            disabled={disabled}
                          >
                            <div className="space-y-2">
                              {module.lessons.map((lesson) => (
                                <LessonCard
                                  key={lesson.id}
                                  lesson={lesson}
                                  onEdit={onEditLesson}
                                  onUnlink={
                                    onUnlinkLesson
                                      ? (lessonId) => onUnlinkLesson(module.id, lessonId)
                                      : undefined
                                  }
                                  compact
                                  showActions={!disabled}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        )}
                      </div>
                    </ModuleCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

export default CourseEditor;
