/**
 * Zustand store for course management.
 *
 * Features:
 * - CRUD operations for courses
 * - Module linking/unlinking
 * - Drag-and-drop reordering
 * - Optimistic updates for better UX
 */

import { coursesApi, lessonsApi, modulesApi } from "@/lib/courses-api";
import type {
  Course,
  CourseDetail,
  CourseFilters,
  CreateCourseRequest,
  CreateLessonRequest,
  CreateModuleRequest,
  Lesson,
  LessonFilters,
  Module,
  ModuleDetail,
  ModuleFilters,
  ModuleInCourse,
  UpdateCourseRequest,
  UpdateLessonRequest,
  UpdateModuleRequest,
} from "@/types/courses";
import { create } from "zustand";

// ==============================================================================
// Store State Interface
// ==============================================================================

interface CoursesStoreState {
  // Course state
  courses: Course[];
  currentCourse: CourseDetail | null;
  coursesTotal: number;
  coursesHasMore: boolean;

  // Module state (standalone modules for selection)
  modules: Module[];
  currentModule: ModuleDetail | null;
  modulesTotal: number;
  modulesHasMore: boolean;

  // Lesson state (standalone lessons for selection)
  lessons: Lesson[];
  currentLesson: Lesson | null;
  lessonsTotal: number;
  lessonsHasMore: boolean;

  // UI state - separate loading states for different operations
  isLoading: boolean; // For list operations (fetchCourses, fetchModules, fetchLessons)
  isLoadingCourse: boolean; // For fetchCourse (single item)
  isLoadingModule: boolean; // For fetchModule (single item)
  isLoadingLesson: boolean; // For fetchLesson (single item)
  isSubmitting: boolean;
  error: string | null;

  // Filters
  courseFilters: CourseFilters;
  moduleFilters: ModuleFilters;
  lessonFilters: LessonFilters;
}

interface CoursesStoreActions {
  // Course actions
  fetchCourses: (filters?: CourseFilters) => Promise<void>;
  fetchCourse: (id: string) => Promise<void>;
  createCourse: (data: CreateCourseRequest) => Promise<Course>;
  updateCourse: (id: string, data: UpdateCourseRequest) => Promise<Course>;
  deleteCourse: (id: string) => Promise<void>;

  // Course-Module linking
  linkModule: (courseId: string, moduleId: string, position?: number) => Promise<void>;
  unlinkModule: (courseId: string, moduleId: string) => Promise<void>;
  reorderModules: (courseId: string, moduleIds: string[]) => Promise<void>;

  // Module actions
  fetchModules: (filters?: ModuleFilters) => Promise<void>;
  fetchModule: (id: string) => Promise<void>;
  createModule: (data: CreateModuleRequest) => Promise<Module>;
  updateModule: (id: string, data: UpdateModuleRequest) => Promise<Module>;
  deleteModule: (id: string, force?: boolean) => Promise<void>;

  // Module-Lesson linking
  linkLesson: (moduleId: string, lessonId: string, position?: number) => Promise<void>;
  unlinkLesson: (moduleId: string, lessonId: string) => Promise<void>;
  reorderLessons: (moduleId: string, lessonIds: string[]) => Promise<void>;

  // Lesson actions
  fetchLessons: (filters?: LessonFilters) => Promise<void>;
  fetchLesson: (id: string) => Promise<void>;
  createLesson: (data: CreateLessonRequest) => Promise<Lesson>;
  updateLesson: (id: string, data: UpdateLessonRequest) => Promise<Lesson>;
  deleteLesson: (id: string, force?: boolean) => Promise<void>;

  // Filter actions
  setCourseFilters: (filters: CourseFilters) => void;
  setModuleFilters: (filters: ModuleFilters) => void;
  setLessonFilters: (filters: LessonFilters) => void;

  // State management
  clearError: () => void;
  clearCurrentCourse: () => void;
  clearCurrentModule: () => void;
  clearCurrentLesson: () => void;
  reset: () => void;

  // Optimistic updates for drag-and-drop
  optimisticReorderModules: (courseId: string, modules: ModuleInCourse[]) => void;
  optimisticReorderLessons: (moduleId: string, lessonIds: string[]) => void;
}

type CoursesStore = CoursesStoreState & CoursesStoreActions;

// ==============================================================================
// Initial State
// ==============================================================================

const initialState: CoursesStoreState = {
  courses: [],
  currentCourse: null,
  coursesTotal: 0,
  coursesHasMore: false,

  modules: [],
  currentModule: null,
  modulesTotal: 0,
  modulesHasMore: false,

  lessons: [],
  currentLesson: null,
  lessonsTotal: 0,
  lessonsHasMore: false,

  isLoading: false,
  isLoadingCourse: false,
  isLoadingModule: false,
  isLoadingLesson: false,
  isSubmitting: false,
  error: null,

  courseFilters: {},
  moduleFilters: {},
  lessonFilters: {},
};

// ==============================================================================
// Store Implementation
// ==============================================================================

export const useCoursesStore = create<CoursesStore>()((set, get) => ({
  ...initialState,

  // ==========================================================================
  // Course Actions
  // ==========================================================================

  fetchCourses: async (filters?: CourseFilters) => {
    const state = get();
    // Prevent duplicate requests
    if (state.isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const mergedFilters = { ...get().courseFilters, ...filters };
      const response = await coursesApi.list(mergedFilters);
      set({
        courses: response.items,
        coursesTotal: response.total,
        coursesHasMore: response.has_more,
        courseFilters: mergedFilters,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar cursos";
      set({ error: message, isLoading: false });
    }
  },

  fetchCourse: async (idOrSlug: string) => {
    const state = get();
    // Prevent duplicate requests for same course
    if (state.isLoadingCourse) {
      return;
    }
    // Skip if same course is already loaded
    if (
      state.currentCourse &&
      (state.currentCourse.id === idOrSlug || state.currentCourse.slug === idOrSlug)
    ) {
      return;
    }
    set({ isLoadingCourse: true, error: null });
    try {
      // Detect if it's a UUID or a slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
      const course = isUuid ? await coursesApi.get(idOrSlug) : await coursesApi.getBySlug(idOrSlug);
      set({ currentCourse: course, isLoadingCourse: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar curso";
      set({ error: message, isLoadingCourse: false });
    }
  },

  createCourse: async (data: CreateCourseRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const course = await coursesApi.create(data);
      set((state) => ({
        courses: [course, ...state.courses],
        coursesTotal: state.coursesTotal + 1,
        isSubmitting: false,
      }));
      return course;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar curso";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  updateCourse: async (id: string, data: UpdateCourseRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const course = await coursesApi.update(id, data);
      set((state) => ({
        courses: state.courses.map((c) => (c.id === id ? { ...c, ...course } : c)),
        currentCourse:
          state.currentCourse?.id === id
            ? { ...state.currentCourse, ...course }
            : state.currentCourse,
        isSubmitting: false,
      }));
      return course;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar curso";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  deleteCourse: async (id: string) => {
    set({ isSubmitting: true, error: null });
    try {
      await coursesApi.delete(id);
      set((state) => ({
        courses: state.courses.filter((c) => c.id !== id),
        coursesTotal: state.coursesTotal - 1,
        currentCourse: state.currentCourse?.id === id ? null : state.currentCourse,
        isSubmitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao deletar curso";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  // ==========================================================================
  // Course-Module Linking
  // ==========================================================================

  linkModule: async (courseId: string, moduleId: string, position?: number) => {
    set({ isSubmitting: true, error: null });
    try {
      await coursesApi.linkModule(courseId, { module_id: moduleId, position: position ?? null });
      // Refresh course to get updated modules list
      const course = await coursesApi.get(courseId);
      set((state) => ({
        currentCourse: state.currentCourse?.id === courseId ? course : state.currentCourse,
        isSubmitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao vincular modulo";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  unlinkModule: async (courseId: string, moduleId: string) => {
    set({ isSubmitting: true, error: null });
    try {
      await coursesApi.unlinkModule(courseId, moduleId);
      set((state) => {
        if (state.currentCourse?.id !== courseId) return { isSubmitting: false };
        return {
          currentCourse: {
            ...state.currentCourse,
            modules: state.currentCourse.modules.filter((m) => m.id !== moduleId),
          },
          isSubmitting: false,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao desvincular modulo";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  reorderModules: async (courseId: string, moduleIds: string[]) => {
    set({ isSubmitting: true, error: null });
    try {
      await coursesApi.reorderModules(courseId, { items: moduleIds });
      set({ isSubmitting: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao reordenar modulos";
      set({ error: message, isSubmitting: false });
      // Refresh to restore original order on error
      get().fetchCourse(courseId);
      throw error;
    }
  },

  // ==========================================================================
  // Module Actions
  // ==========================================================================

  fetchModules: async (filters?: ModuleFilters) => {
    const state = get();
    // Prevent duplicate requests
    if (state.isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const mergedFilters = { ...get().moduleFilters, ...filters };
      const response = await modulesApi.list(mergedFilters);
      set({
        modules: response.items,
        modulesTotal: response.total,
        modulesHasMore: response.has_more,
        moduleFilters: mergedFilters,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar modulos";
      set({ error: message, isLoading: false });
    }
  },

  fetchModule: async (id: string) => {
    const state = get();
    // Prevent duplicate requests for same module
    if (state.isLoadingModule) {
      return;
    }
    // Skip if same module is already loaded
    if (state.currentModule && state.currentModule.id === id) {
      return;
    }
    set({ isLoadingModule: true, error: null });
    try {
      const module = await modulesApi.get(id);
      set({ currentModule: module, isLoadingModule: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar modulo";
      set({ error: message, isLoadingModule: false });
    }
  },

  createModule: async (data: CreateModuleRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const module = await modulesApi.create(data);
      set((state) => ({
        modules: [module, ...state.modules],
        modulesTotal: state.modulesTotal + 1,
        isSubmitting: false,
      }));
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar modulo";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  updateModule: async (id: string, data: UpdateModuleRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const module = await modulesApi.update(id, data);
      set((state) => ({
        modules: state.modules.map((m) => (m.id === id ? { ...m, ...module } : m)),
        currentModule:
          state.currentModule?.id === id
            ? { ...state.currentModule, ...module }
            : state.currentModule,
        isSubmitting: false,
      }));
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar modulo";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  deleteModule: async (id: string, force = false) => {
    set({ isSubmitting: true, error: null });
    try {
      await modulesApi.delete(id, force);
      set((state) => ({
        modules: state.modules.filter((m) => m.id !== id),
        modulesTotal: state.modulesTotal - 1,
        currentModule: state.currentModule?.id === id ? null : state.currentModule,
        isSubmitting: false,
      }));
    } catch (error) {
      let message = "Erro ao deletar módulo";
      if (error instanceof Error) {
        if (error.message.includes("usado em") || error.message.includes("in use")) {
          message =
            "Este módulo está vinculado a cursos. Desvincule-o primeiro ou use a exclusão forçada.";
        } else if (error.message.includes("permissao") || error.message.includes("forbidden")) {
          message = "Você não tem permissão para excluir este módulo.";
        } else {
          message = error.message;
        }
      }
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },

  // ==========================================================================
  // Module-Lesson Linking
  // ==========================================================================

  linkLesson: async (moduleId: string, lessonId: string, position?: number) => {
    set({ isSubmitting: true, error: null });
    try {
      await modulesApi.linkLesson(moduleId, { lesson_id: lessonId, position: position ?? null });
      // Refresh module to get updated lessons list
      const module = await modulesApi.get(moduleId);
      set((state) => ({
        currentModule: state.currentModule?.id === moduleId ? module : state.currentModule,
        // Also update in currentCourse if viewing a course
        currentCourse: state.currentCourse
          ? {
              ...state.currentCourse,
              modules: state.currentCourse.modules.map((m) =>
                m.id === moduleId
                  ? { ...m, lessons: module.lessons, lesson_count: module.lesson_count }
                  : m,
              ),
            }
          : null,
        isSubmitting: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao vincular aula";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  unlinkLesson: async (moduleId: string, lessonId: string) => {
    set({ isSubmitting: true, error: null });
    try {
      await modulesApi.unlinkLesson(moduleId, lessonId);
      set((state) => {
        const updateLessons = (module: ModuleDetail) => ({
          ...module,
          lessons: module.lessons.filter((l) => l.id !== lessonId),
          lesson_count: module.lesson_count - 1,
        });

        return {
          currentModule:
            state.currentModule?.id === moduleId
              ? updateLessons(state.currentModule)
              : state.currentModule,
          currentCourse: state.currentCourse
            ? {
                ...state.currentCourse,
                modules: state.currentCourse.modules.map((m) =>
                  m.id === moduleId
                    ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }
                    : m,
                ),
              }
            : null,
          isSubmitting: false,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao desvincular aula";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  reorderLessons: async (moduleId: string, lessonIds: string[]) => {
    set({ isSubmitting: true, error: null });
    try {
      await modulesApi.reorderLessons(moduleId, { items: lessonIds });
      set({ isSubmitting: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao reordenar aulas";
      set({ error: message, isSubmitting: false });
      // Refresh to restore original order on error
      get().fetchModule(moduleId);
      throw error;
    }
  },

  // ==========================================================================
  // Lesson Actions
  // ==========================================================================

  fetchLessons: async (filters?: LessonFilters) => {
    const state = get();
    // Prevent duplicate requests
    if (state.isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const mergedFilters = { ...get().lessonFilters, ...filters };
      const response = await lessonsApi.list(mergedFilters);
      set({
        lessons: response.items,
        lessonsTotal: response.total,
        lessonsHasMore: response.has_more,
        lessonFilters: mergedFilters,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar aulas";
      set({ error: message, isLoading: false });
    }
  },

  fetchLesson: async (id: string) => {
    const state = get();
    // Prevent duplicate requests for same lesson
    if (state.isLoadingLesson) {
      return;
    }
    // Skip if same lesson is already loaded
    if (state.currentLesson && state.currentLesson.id === id) {
      return;
    }
    set({ isLoadingLesson: true, error: null });
    try {
      const lesson = await lessonsApi.get(id);
      set({ currentLesson: lesson, isLoadingLesson: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar aula";
      set({ error: message, isLoadingLesson: false });
    }
  },

  createLesson: async (data: CreateLessonRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const lesson = await lessonsApi.create(data);
      set((state) => ({
        lessons: [lesson, ...state.lessons],
        lessonsTotal: state.lessonsTotal + 1,
        isSubmitting: false,
      }));
      return lesson;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar aula";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  updateLesson: async (id: string, data: UpdateLessonRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const lesson = await lessonsApi.update(id, data);
      set((state) => ({
        lessons: state.lessons.map((l) => (l.id === id ? { ...l, ...lesson } : l)),
        currentLesson:
          state.currentLesson?.id === id
            ? { ...state.currentLesson, ...lesson }
            : state.currentLesson,
        isSubmitting: false,
      }));
      return lesson;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar aula";
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  deleteLesson: async (id: string, force = false) => {
    set({ isSubmitting: true, error: null });
    try {
      await lessonsApi.delete(id, force);
      set((state) => ({
        lessons: state.lessons.filter((l) => l.id !== id),
        lessonsTotal: state.lessonsTotal - 1,
        currentLesson: state.currentLesson?.id === id ? null : state.currentLesson,
        isSubmitting: false,
      }));
    } catch (error) {
      let message = "Erro ao deletar aula";
      if (error instanceof Error) {
        if (error.message.includes("usado em") || error.message.includes("usada em")) {
          message =
            "Esta aula está vinculada a módulos. Desvincule-a primeiro ou use a exclusão forçada.";
        } else if (error.message.includes("permissao") || error.message.includes("forbidden")) {
          message = "Você não tem permissão para excluir esta aula.";
        } else {
          message = error.message;
        }
      }
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },

  // ==========================================================================
  // Filter Actions
  // ==========================================================================

  setCourseFilters: (filters: CourseFilters) => {
    set({ courseFilters: filters });
  },

  setModuleFilters: (filters: ModuleFilters) => {
    set({ moduleFilters: filters });
  },

  setLessonFilters: (filters: LessonFilters) => {
    set({ lessonFilters: filters });
  },

  // ==========================================================================
  // State Management
  // ==========================================================================

  clearError: () => set({ error: null }),
  clearCurrentCourse: () => set({ currentCourse: null }),
  clearCurrentModule: () => set({ currentModule: null }),
  clearCurrentLesson: () => set({ currentLesson: null }),
  reset: () => set(initialState),

  // ==========================================================================
  // Optimistic Updates for Drag-and-Drop
  // ==========================================================================

  optimisticReorderModules: (courseId: string, modules: ModuleInCourse[]) => {
    set((state) => {
      if (state.currentCourse?.id !== courseId) return state;
      return {
        currentCourse: {
          ...state.currentCourse,
          modules: modules.map((m, index) => ({ ...m, position: index })),
        },
      };
    });
  },

  optimisticReorderLessons: (moduleId: string, lessonIds: string[]) => {
    set((state) => {
      // Update in currentModule
      if (state.currentModule?.id === moduleId) {
        const currentModule = state.currentModule;
        const lessonMap = new Map(currentModule.lessons.map((l) => [l.id, l]));
        const reorderedLessons = lessonIds
          .map((id, index) => {
            const lesson = lessonMap.get(id);
            return lesson ? { ...lesson, position: index } : null;
          })
          .filter(Boolean);

        return {
          currentModule: {
            ...currentModule,
            lessons: reorderedLessons as typeof currentModule.lessons,
          },
        };
      }

      // Update in currentCourse
      if (state.currentCourse) {
        return {
          currentCourse: {
            ...state.currentCourse,
            modules: state.currentCourse.modules.map((m) => {
              if (m.id !== moduleId) return m;
              const lessonMap = new Map(m.lessons.map((l) => [l.id, l]));
              const reorderedLessons = lessonIds
                .map((id, index) => {
                  const lesson = lessonMap.get(id);
                  return lesson ? { ...lesson, position: index } : null;
                })
                .filter(Boolean);
              return { ...m, lessons: reorderedLessons as typeof m.lessons };
            }),
          },
        };
      }

      return state;
    });
  },
}));

// ==============================================================================
// Selectors
// ==============================================================================

export const selectCourses = (state: CoursesStore) => state.courses;
export const selectCurrentCourse = (state: CoursesStore) => state.currentCourse;
export const selectModules = (state: CoursesStore) => state.modules;
export const selectCurrentModule = (state: CoursesStore) => state.currentModule;
export const selectLessons = (state: CoursesStore) => state.lessons;
export const selectCurrentLesson = (state: CoursesStore) => state.currentLesson;
export const selectIsLoading = (state: CoursesStore) => state.isLoading;
export const selectIsLoadingCourse = (state: CoursesStore) => state.isLoadingCourse;
export const selectIsLoadingModule = (state: CoursesStore) => state.isLoadingModule;
export const selectIsLoadingLesson = (state: CoursesStore) => state.isLoadingLesson;
export const selectIsSubmitting = (state: CoursesStore) => state.isSubmitting;
export const selectError = (state: CoursesStore) => state.error;

// Helper selectors
export const selectCourseById = (id: string) => (state: CoursesStore) =>
  state.courses.find((c) => c.id === id);

export const selectModuleById = (id: string) => (state: CoursesStore) =>
  state.modules.find((m) => m.id === id);

export const selectLessonById = (id: string) => (state: CoursesStore) =>
  state.lessons.find((l) => l.id === id);

// Status helpers
export const selectPublishedCourses = (state: CoursesStore) =>
  state.courses.filter((c) => c.status === "published");

export const selectDraftCourses = (state: CoursesStore) =>
  state.courses.filter((c) => c.status === "draft");

export default useCoursesStore;
