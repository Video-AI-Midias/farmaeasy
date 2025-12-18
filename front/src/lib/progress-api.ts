/**
 * API client for student progress tracking operations.
 *
 * Features:
 * - Video progress updates (throttled from frontend)
 * - Manual lesson completion
 * - Course enrollment
 * - Progress queries
 */

import type {
  CourseProgress,
  EnrollRequest,
  EnrollmentListResponse,
  EnrollmentResponse,
  LessonProgressCheck,
  LessonProgressResponse,
  MarkLessonCompleteRequest,
  MarkLessonIncompleteRequest,
  UpdateVideoProgressRequest,
} from "@/types/progress";
import { api } from "./api";

// ==============================================================================
// Progress API
// ==============================================================================

export const progressApi = {
  /**
   * Update video watching progress.
   * Called from frontend every 5 seconds during video playback.
   * Auto-completes lesson when >= 90% watched.
   */
  updateVideoProgress: async (
    data: UpdateVideoProgressRequest,
  ): Promise<LessonProgressResponse> => {
    const response = await api.put<LessonProgressResponse>("/progress/video", data);
    return response.data;
  },

  /**
   * Manually mark a lesson as complete.
   * Used for non-video content (text, PDF, quiz).
   */
  markLessonComplete: async (data: MarkLessonCompleteRequest): Promise<LessonProgressResponse> => {
    const response = await api.post<LessonProgressResponse>("/progress/lesson/complete", data);
    return response.data;
  },

  /**
   * Reset lesson progress (for rewatching).
   * Resets progress to 0% and clears completion status.
   */
  markLessonIncomplete: async (
    data: MarkLessonIncompleteRequest,
  ): Promise<LessonProgressResponse> => {
    const response = await api.post<LessonProgressResponse>("/progress/lesson/incomplete", data);
    return response.data;
  },

  /**
   * Get progress for a specific lesson.
   * Used on lesson load to determine resume position.
   */
  getLessonProgress: async (
    lessonId: string,
    courseId: string,
    moduleId: string,
  ): Promise<LessonProgressCheck> => {
    const params = new URLSearchParams();
    params.append("course_id", courseId);
    params.append("module_id", moduleId);

    const response = await api.get<LessonProgressCheck>(
      `/progress/lesson/${lessonId}?${params.toString()}`,
    );
    return response.data;
  },

  /**
   * Get complete progress for a course.
   * Returns enrollment info, module progress, and all lesson progress.
   * Auto-enrolls user if not enrolled.
   */
  getCourseProgress: async (courseId: string): Promise<CourseProgress> => {
    const response = await api.get<CourseProgress>(`/progress/course/${courseId}`);
    return response.data;
  },
};

// ==============================================================================
// Enrollments API
// ==============================================================================

export const enrollmentsApi = {
  /**
   * Enroll current user in a course.
   */
  enroll: async (data: EnrollRequest): Promise<EnrollmentResponse> => {
    const response = await api.post<EnrollmentResponse>("/enrollments", data);
    return response.data;
  },

  /**
   * Get all course enrollments for current user.
   */
  getMyEnrollments: async (): Promise<EnrollmentListResponse> => {
    const response = await api.get<EnrollmentListResponse>("/enrollments/my");
    return response.data;
  },

  /**
   * Get enrollment status for a specific course.
   */
  getEnrollment: async (courseId: string): Promise<EnrollmentResponse> => {
    const response = await api.get<EnrollmentResponse>(`/enrollments/${courseId}`);
    return response.data;
  },
};

export default {
  progress: progressApi,
  enrollments: enrollmentsApi,
};
