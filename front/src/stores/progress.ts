/**
 * Zustand store for student progress tracking.
 *
 * Features:
 * - Video progress tracking with throttling
 * - Lesson completion (auto and manual)
 * - Course enrollment
 * - Autoplay between lessons
 * - Resume position on reload
 */

import { enrollmentsApi, progressApi } from "@/lib/progress-api";
import {
  type AutoplayState,
  type CourseProgress,
  type Enrollment,
  type LessonCompletionOverlay,
  type LessonProgress,
  LessonProgressStatus,
} from "@/types/progress";
import { create } from "zustand";

// ==============================================================================
// Constants
// ==============================================================================

const AUTOPLAY_COUNTDOWN_SECONDS = 5;
const VIDEO_PROGRESS_THROTTLE_MS = 5000; // 5 seconds between API calls

// ==============================================================================
// Store State Interface
// ==============================================================================

interface ProgressStoreState {
  // Course progress (aggregated view)
  courseProgress: CourseProgress | null;

  // Enrollments list (for dashboard)
  enrollments: Enrollment[];

  // Current lesson progress (for video player)
  currentLessonProgress: LessonProgress | null;

  // Autoplay state
  autoplay: AutoplayState;

  // Completion overlay
  completionOverlay: LessonCompletionOverlay;

  // UI state
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  // Throttling state (internal)
  lastProgressUpdate: number;
  pendingProgressUpdate: {
    lessonId: string;
    courseId: string;
    moduleId: string;
    positionSeconds: number;
    durationSeconds: number;
  } | null;
}

interface ProgressStoreActions {
  // Course progress
  fetchCourseProgress: (courseId: string) => Promise<void>;
  clearCourseProgress: () => void;

  // Lesson progress
  updateVideoProgress: (
    lessonId: string,
    courseId: string,
    moduleId: string,
    positionSeconds: number,
    durationSeconds: number,
  ) => Promise<void>;
  flushPendingProgress: () => Promise<void>;
  markLessonComplete: (lessonId: string, courseId: string, moduleId: string) => Promise<void>;
  markLessonIncomplete: (lessonId: string, courseId: string, moduleId: string) => Promise<void>;

  // Enrollments
  fetchMyEnrollments: () => Promise<void>;
  enrollInCourse: (courseId: string) => Promise<void>;

  // Autoplay
  startAutoplay: (nextLessonId: string, nextModuleId: string) => void;
  cancelAutoplay: () => void;
  tickAutoplay: () => void;
  setAutoplayEnabled: (enabled: boolean) => void;

  // Completion overlay
  showCompletionOverlay: (
    lessonId: string,
    hasNextLesson: boolean,
    nextLessonId: string | null,
    nextModuleId: string | null,
  ) => void;
  hideCompletionOverlay: () => void;

  // Helpers
  getLessonStatus: (lessonId: string) => LessonProgressStatus;
  getLessonProgressPercent: (lessonId: string) => number;
  getResumePosition: (lessonId: string) => number;

  // State management
  clearError: () => void;
  reset: () => void;
}

type ProgressStore = ProgressStoreState & ProgressStoreActions;

// ==============================================================================
// Helper Functions
// ==============================================================================

/**
 * Upsert a lesson in the lessons array.
 * If the lesson exists, update it. If not, add a new entry.
 */
function upsertLesson(
  lessons: CourseProgress["lessons"],
  lessonId: string,
  update: {
    status: LessonProgressStatus | string;
    progress_percent: number;
    completed: boolean;
    last_position_seconds?: number;
  },
): CourseProgress["lessons"] {
  const existingIndex = (lessons ?? []).findIndex((l) => l.lesson_id === lessonId);

  if (existingIndex >= 0) {
    // Update existing entry
    return (lessons ?? []).map((l, i) =>
      i === existingIndex
        ? {
            ...l,
            status: update.status as LessonProgressStatus,
            progress_percent: update.progress_percent,
            completed: update.completed,
            ...(update.last_position_seconds !== undefined && {
              last_position_seconds: update.last_position_seconds,
            }),
          }
        : l,
    );
  }

  // Add new entry
  return [
    ...(lessons ?? []),
    {
      lesson_id: lessonId,
      status: update.status as LessonProgressStatus,
      progress_percent: update.progress_percent,
      completed: update.completed,
      last_position_seconds: update.last_position_seconds ?? 0,
    },
  ];
}

// ==============================================================================
// Initial State
// ==============================================================================

const initialState: ProgressStoreState = {
  courseProgress: null,
  enrollments: [],
  currentLessonProgress: null,

  autoplay: {
    enabled: true,
    countdown: 0,
    nextLessonId: null,
    nextModuleId: null,
    isPaused: false,
  },

  completionOverlay: {
    visible: false,
    lessonId: null,
    hasNextLesson: false,
    nextLessonId: null,
    nextModuleId: null,
  },

  isLoading: false,
  isUpdating: false,
  error: null,

  lastProgressUpdate: 0,
  pendingProgressUpdate: null,
};

// ==============================================================================
// Store Implementation
// ==============================================================================

export const useProgressStore = create<ProgressStore>()((set, get) => ({
  ...initialState,

  // ==========================================================================
  // Course Progress
  // ==========================================================================

  fetchCourseProgress: async (courseId: string) => {
    const state = get();
    if (state.isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const progress = await progressApi.getCourseProgress(courseId);
      set({ courseProgress: progress, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar progresso";
      set({ error: message, isLoading: false });
    }
  },

  clearCourseProgress: () => {
    set({ courseProgress: null, currentLessonProgress: null });
  },

  // ==========================================================================
  // Lesson Progress
  // ==========================================================================

  updateVideoProgress: async (
    lessonId: string,
    courseId: string,
    moduleId: string,
    positionSeconds: number,
    durationSeconds: number,
  ) => {
    const state = get();
    const now = Date.now();

    // Store pending update
    set({
      pendingProgressUpdate: {
        lessonId,
        courseId,
        moduleId,
        positionSeconds,
        durationSeconds,
      },
    });

    // Throttle API calls to every 5 seconds
    if (now - state.lastProgressUpdate < VIDEO_PROGRESS_THROTTLE_MS) {
      return;
    }

    // Make the API call
    set({ lastProgressUpdate: now, isUpdating: true });
    try {
      const progress = await progressApi.updateVideoProgress({
        lesson_id: lessonId,
        course_id: courseId,
        module_id: moduleId,
        position_seconds: positionSeconds,
        duration_seconds: durationSeconds,
      });

      // Update current lesson progress
      set((s) => ({
        currentLessonProgress: {
          lesson_id: progress.lesson_id,
          course_id: progress.course_id,
          module_id: progress.module_id,
          user_id: progress.user_id,
          status: progress.status,
          progress_percent: progress.progress_percent,
          position_seconds: progress.position_seconds,
          duration_seconds: progress.duration_seconds,
          started_at: progress.started_at,
          completed_at: progress.completed_at,
          last_watched_at: progress.last_watched_at,
        },
        // Update in courseProgress.lessons array (LessonProgressSummary format)
        // Uses upsert to add new entry if lesson doesn't exist in array
        courseProgress: s.courseProgress
          ? {
              ...s.courseProgress,
              lessons: upsertLesson(s.courseProgress.lessons, lessonId, {
                status: progress.status,
                progress_percent: progress.progress_percent,
                completed: progress.status === "completed",
                last_position_seconds: progress.position_seconds,
              }),
            }
          : null,
        pendingProgressUpdate: null,
        isUpdating: false,
      }));
    } catch (_error) {
      // Silently fail for progress updates (non-critical)
      set({ isUpdating: false });
    }
  },

  flushPendingProgress: async () => {
    const state = get();
    const pending = state.pendingProgressUpdate;

    if (!pending) return;

    set({ lastProgressUpdate: Date.now(), isUpdating: true });
    try {
      await progressApi.updateVideoProgress({
        lesson_id: pending.lessonId,
        course_id: pending.courseId,
        module_id: pending.moduleId,
        position_seconds: pending.positionSeconds,
        duration_seconds: pending.durationSeconds,
      });
      set({ pendingProgressUpdate: null, isUpdating: false });
    } catch {
      set({ isUpdating: false });
    }
  },

  markLessonComplete: async (lessonId: string, courseId: string, moduleId: string) => {
    set({ isUpdating: true, error: null });
    try {
      const progress = await progressApi.markLessonComplete({
        lesson_id: lessonId,
        course_id: courseId,
        module_id: moduleId,
      });

      set((s) => ({
        currentLessonProgress: {
          lesson_id: progress.lesson_id,
          course_id: progress.course_id,
          module_id: progress.module_id,
          user_id: progress.user_id,
          status: progress.status,
          progress_percent: progress.progress_percent,
          position_seconds: progress.position_seconds,
          duration_seconds: progress.duration_seconds,
          started_at: progress.started_at,
          completed_at: progress.completed_at,
          last_watched_at: progress.last_watched_at,
        },
        // Uses upsert to add new entry if lesson doesn't exist in array
        courseProgress: s.courseProgress
          ? {
              ...s.courseProgress,
              lessons: upsertLesson(s.courseProgress.lessons, lessonId, {
                status: progress.status,
                progress_percent: 100,
                completed: true,
                last_position_seconds: progress.position_seconds,
              }),
            }
          : null,
        isUpdating: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao marcar como completa";
      set({ error: message, isUpdating: false });
      throw error;
    }
  },

  markLessonIncomplete: async (lessonId: string, courseId: string, moduleId: string) => {
    set({ isUpdating: true, error: null });
    try {
      const progress = await progressApi.markLessonIncomplete({
        lesson_id: lessonId,
        course_id: courseId,
        module_id: moduleId,
      });

      set((s) => ({
        currentLessonProgress: {
          lesson_id: progress.lesson_id,
          course_id: progress.course_id,
          module_id: progress.module_id,
          user_id: progress.user_id,
          status: progress.status,
          progress_percent: progress.progress_percent,
          position_seconds: progress.position_seconds,
          duration_seconds: progress.duration_seconds,
          started_at: progress.started_at,
          completed_at: progress.completed_at,
          last_watched_at: progress.last_watched_at,
        },
        // Uses upsert to add new entry if lesson doesn't exist in array
        courseProgress: s.courseProgress
          ? {
              ...s.courseProgress,
              lessons: upsertLesson(s.courseProgress.lessons, lessonId, {
                status: progress.status,
                progress_percent: 0,
                completed: false,
                last_position_seconds: 0,
              }),
            }
          : null,
        isUpdating: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao resetar progresso";
      set({ error: message, isUpdating: false });
      throw error;
    }
  },

  // ==========================================================================
  // Enrollments
  // ==========================================================================

  fetchMyEnrollments: async () => {
    const state = get();
    // Prevent concurrent fetches
    if (state.isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const response = await enrollmentsApi.getMyEnrollments();
      set({ enrollments: response.items, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar inscricoes";
      set({ error: message, isLoading: false });
    }
  },

  enrollInCourse: async (courseId: string) => {
    set({ isUpdating: true, error: null });
    try {
      const enrollment = await enrollmentsApi.enroll({ course_id: courseId });
      set((s) => ({
        enrollments: [...s.enrollments, enrollment],
        isUpdating: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao se inscrever";
      set({ error: message, isUpdating: false });
      throw error;
    }
  },

  // ==========================================================================
  // Autoplay
  // ==========================================================================

  startAutoplay: (nextLessonId: string, nextModuleId: string) => {
    set({
      autoplay: {
        enabled: true,
        countdown: AUTOPLAY_COUNTDOWN_SECONDS,
        nextLessonId,
        nextModuleId,
        isPaused: false,
      },
    });
  },

  cancelAutoplay: () => {
    set({
      autoplay: {
        ...get().autoplay,
        countdown: 0,
        nextLessonId: null,
        nextModuleId: null,
        isPaused: true,
      },
    });
  },

  tickAutoplay: () => {
    const state = get();
    if (state.autoplay.countdown > 0 && !state.autoplay.isPaused) {
      set({
        autoplay: {
          ...state.autoplay,
          countdown: state.autoplay.countdown - 1,
        },
      });
    }
  },

  setAutoplayEnabled: (enabled: boolean) => {
    set({
      autoplay: {
        ...get().autoplay,
        enabled,
      },
    });
  },

  // ==========================================================================
  // Completion Overlay
  // ==========================================================================

  showCompletionOverlay: (
    lessonId: string,
    hasNextLesson: boolean,
    nextLessonId: string | null,
    nextModuleId: string | null,
  ) => {
    set({
      completionOverlay: {
        visible: true,
        lessonId,
        hasNextLesson,
        nextLessonId,
        nextModuleId,
      },
    });
  },

  hideCompletionOverlay: () => {
    set({
      completionOverlay: {
        visible: false,
        lessonId: null,
        hasNextLesson: false,
        nextLessonId: null,
        nextModuleId: null,
      },
    });
  },

  // ==========================================================================
  // Helpers
  // ==========================================================================

  getLessonStatus: (lessonId: string): LessonProgressStatus => {
    const state = get();
    const lessons = state.courseProgress?.lessons ?? [];
    const lesson = lessons.find((l) => l.lesson_id === lessonId);
    return lesson?.status ?? LessonProgressStatus.NOT_STARTED;
  },

  getLessonProgressPercent: (lessonId: string): number => {
    const state = get();
    const lessons = state.courseProgress?.lessons ?? [];
    const lesson = lessons.find((l) => l.lesson_id === lessonId);
    return lesson?.progress_percent ?? 0;
  },

  getResumePosition: (lessonId: string): number => {
    const state = get();
    const lessons = state.courseProgress?.lessons ?? [];
    const lesson = lessons.find((l) => l.lesson_id === lessonId);
    // If completed, start from beginning for rewatch
    if (lesson?.status === "completed") {
      return 0;
    }
    return lesson?.last_position_seconds ?? 0;
  },

  // ==========================================================================
  // State Management
  // ==========================================================================

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));

// ==============================================================================
// Selectors
// ==============================================================================

export const selectCourseProgress = (state: ProgressStore) => state.courseProgress;
export const selectEnrollments = (state: ProgressStore) => state.enrollments;
export const selectCurrentLessonProgress = (state: ProgressStore) => state.currentLessonProgress;
export const selectAutoplay = (state: ProgressStore) => state.autoplay;
export const selectCompletionOverlay = (state: ProgressStore) => state.completionOverlay;
export const selectIsLoading = (state: ProgressStore) => state.isLoading;
export const selectIsUpdating = (state: ProgressStore) => state.isUpdating;
export const selectError = (state: ProgressStore) => state.error;

// Helper selectors
export const selectEnrollmentByCourse = (courseId: string) => (state: ProgressStore) =>
  state.enrollments.find((e) => e.course_id === courseId);

export const selectLessonProgressById = (lessonId: string) => (state: ProgressStore) =>
  (state.courseProgress?.lessons ?? []).find((l) => l.lesson_id === lessonId);

export const selectModuleProgressById = (moduleId: string) => (state: ProgressStore) =>
  (state.courseProgress?.modules ?? []).find((m) => m.module_id === moduleId);

export const selectIsLessonCompleted = (lessonId: string) => (state: ProgressStore) =>
  (state.courseProgress?.lessons ?? []).find((l) => l.lesson_id === lessonId)?.status ===
  "completed";

export default useProgressStore;
