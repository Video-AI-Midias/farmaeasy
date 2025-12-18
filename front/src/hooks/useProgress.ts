/**
 * Progress hooks for components.
 *
 * - useProgress: Access progress state and actions for a course
 * - useVideoProgress: Track video progress with throttling
 * - useAutoplay: Manage autoplay countdown between lessons
 */

import {
  selectAutoplay,
  selectCompletionOverlay,
  selectCourseProgress,
  selectError,
  selectIsLoading,
  selectIsUpdating,
  useProgressStore,
} from "@/stores/progress";
import { LessonProgressStatus } from "@/types/progress";
import { useCallback, useEffect, useRef } from "react";

/**
 * Main progress hook for a specific course.
 * Automatically fetches progress on mount when courseId is provided.
 */
export function useProgress(courseId: string | null) {
  const fetchCourseProgress = useProgressStore((state) => state.fetchCourseProgress);
  const clearCourseProgress = useProgressStore((state) => state.clearCourseProgress);
  const markLessonCompleteAction = useProgressStore((state) => state.markLessonComplete);
  const markLessonIncompleteAction = useProgressStore((state) => state.markLessonIncomplete);
  const clearError = useProgressStore((state) => state.clearError);
  const getLessonStatus = useProgressStore((state) => state.getLessonStatus);
  const getLessonProgressPercent = useProgressStore((state) => state.getLessonProgressPercent);
  const getResumePosition = useProgressStore((state) => state.getResumePosition);

  const courseProgress = useProgressStore(selectCourseProgress);
  const isLoading = useProgressStore(selectIsLoading);
  const isUpdating = useProgressStore(selectIsUpdating);
  const error = useProgressStore(selectError);

  // Fetch progress on mount when courseId is available
  useEffect(() => {
    if (courseId) {
      fetchCourseProgress(courseId);
    }
    return () => {
      clearCourseProgress();
    };
  }, [courseId, fetchCourseProgress, clearCourseProgress]);

  // Mark lesson complete
  const markLessonComplete = useCallback(
    async (lessonId: string, moduleId: string) => {
      if (!courseId) return;
      return markLessonCompleteAction(lessonId, courseId, moduleId);
    },
    [courseId, markLessonCompleteAction],
  );

  // Mark lesson incomplete (reset for rewatch)
  const markLessonIncomplete = useCallback(
    async (lessonId: string, moduleId: string) => {
      if (!courseId) return;
      return markLessonIncompleteAction(lessonId, courseId, moduleId);
    },
    [courseId, markLessonIncompleteAction],
  );

  // Check if lesson is completed
  const isLessonCompleted = useCallback(
    (lessonId: string): boolean => {
      return getLessonStatus(lessonId) === LessonProgressStatus.COMPLETED;
    },
    [getLessonStatus],
  );

  // Refresh progress
  const refresh = useCallback(() => {
    if (courseId) {
      fetchCourseProgress(courseId);
    }
  }, [courseId, fetchCourseProgress]);

  return {
    // State
    courseProgress,
    enrollment: courseProgress?.enrollment ?? null,
    modules: courseProgress?.modules ?? [],
    lessons: courseProgress?.lessons ?? [],
    resumeLessonId: courseProgress?.resume_lesson_id ?? null,
    resumeModuleId: courseProgress?.resume_module_id ?? null,
    resumePosition: courseProgress?.resume_position_seconds ?? 0,
    isLoading,
    isUpdating,
    error,

    // Actions
    markLessonComplete,
    markLessonIncomplete,
    refresh,
    clearError,

    // Helpers
    getLessonStatus,
    getLessonProgressPercent,
    getResumePosition,
    isLessonCompleted,
  };
}

/**
 * Hook for tracking video progress with automatic throttling.
 * Use in video player components.
 */
export function useVideoProgress(
  lessonId: string,
  courseId: string,
  moduleId: string,
  options?: {
    onComplete?: () => void;
    completionThreshold?: number; // Default 90%
  },
) {
  const updateVideoProgressAction = useProgressStore((state) => state.updateVideoProgress);
  const flushPendingProgress = useProgressStore((state) => state.flushPendingProgress);
  const getResumePosition = useProgressStore((state) => state.getResumePosition);
  const isUpdating = useProgressStore(selectIsUpdating);

  const completionThreshold = options?.completionThreshold ?? 90;
  const onComplete = options?.onComplete;
  const hasCalledOnComplete = useRef(false);
  const prevLessonIdRef = useRef(lessonId);

  // Reset completion flag when lesson changes (without useEffect)
  if (prevLessonIdRef.current !== lessonId) {
    prevLessonIdRef.current = lessonId;
    hasCalledOnComplete.current = false;
  }

  // Update progress (throttled in store)
  const updateProgress = useCallback(
    async (positionSeconds: number, durationSeconds: number) => {
      // DEBUG: Log progress updates
      const progressPercent = durationSeconds > 0 ? (positionSeconds / durationSeconds) * 100 : 0;
      console.log("[useVideoProgress] updateProgress:", {
        lessonId,
        positionSeconds,
        durationSeconds,
        progressPercent: progressPercent.toFixed(1),
        threshold: completionThreshold,
        hasCalledOnComplete: hasCalledOnComplete.current,
        hasOnComplete: !!onComplete,
      });

      // Check for completion IMMEDIATELY (don't wait for API)
      // This ensures the overlay shows even if API is slow/throttled
      if (durationSeconds > 0) {
        // Call onComplete when progress reaches threshold (only once per lesson)
        if (progressPercent >= completionThreshold && !hasCalledOnComplete.current && onComplete) {
          console.log(
            "[useVideoProgress] TRIGGERING onComplete! Progress:",
            progressPercent.toFixed(1),
          );
          hasCalledOnComplete.current = true;
          onComplete();
        }
      }

      // Send progress to API (non-blocking for UI)
      await updateVideoProgressAction(
        lessonId,
        courseId,
        moduleId,
        positionSeconds,
        durationSeconds,
      );
    },
    [lessonId, courseId, moduleId, completionThreshold, onComplete, updateVideoProgressAction],
  );

  // Flush pending progress on unmount
  useEffect(() => {
    return () => {
      flushPendingProgress();
    };
  }, [flushPendingProgress]);

  return {
    updateProgress,
    flushProgress: flushPendingProgress,
    resumePosition: getResumePosition(lessonId),
    isUpdating,
  };
}

/**
 * Hook for managing autoplay between lessons.
 * Handles countdown and navigation.
 */
export function useAutoplay(options?: {
  onNavigate?: (lessonId: string, moduleId: string) => void;
}) {
  const startAutoplay = useProgressStore((state) => state.startAutoplay);
  const cancelAutoplay = useProgressStore((state) => state.cancelAutoplay);
  const tickAutoplay = useProgressStore((state) => state.tickAutoplay);
  const setAutoplayEnabled = useProgressStore((state) => state.setAutoplayEnabled);

  const autoplay = useProgressStore(selectAutoplay);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived values for dependencies
  const isCountdownActive = autoplay.countdown > 0 && !autoplay.isPaused;

  // Start countdown interval when autoplay starts
  useEffect(() => {
    if (!isCountdownActive) {
      return;
    }

    intervalRef.current = setInterval(() => {
      tickAutoplay();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isCountdownActive, tickAutoplay]);

  // Navigate when countdown reaches 0
  useEffect(() => {
    if (
      autoplay.countdown === 0 &&
      autoplay.nextLessonId &&
      autoplay.nextModuleId &&
      !autoplay.isPaused &&
      options?.onNavigate
    ) {
      options.onNavigate(autoplay.nextLessonId, autoplay.nextModuleId);
      // Reset autoplay state after navigation
      cancelAutoplay();
    }
  }, [
    autoplay.countdown,
    autoplay.nextLessonId,
    autoplay.nextModuleId,
    autoplay.isPaused,
    cancelAutoplay,
    options,
  ]);

  return {
    // State
    isEnabled: autoplay.enabled,
    countdown: autoplay.countdown,
    nextLessonId: autoplay.nextLessonId,
    isActive: autoplay.countdown > 0 && !autoplay.isPaused,

    // Actions
    start: startAutoplay,
    cancel: cancelAutoplay,
    setEnabled: setAutoplayEnabled,
  };
}

/**
 * Hook for managing the lesson completion overlay.
 */
export function useCompletionOverlay() {
  const showOverlay = useProgressStore((state) => state.showCompletionOverlay);
  const hideOverlay = useProgressStore((state) => state.hideCompletionOverlay);

  const overlay = useProgressStore(selectCompletionOverlay);

  return {
    // State
    visible: overlay.visible,
    lessonId: overlay.lessonId,
    hasNextLesson: overlay.hasNextLesson,
    nextLessonId: overlay.nextLessonId,
    nextModuleId: overlay.nextModuleId,

    // Actions
    show: showOverlay,
    hide: hideOverlay,
  };
}

export default useProgress;
