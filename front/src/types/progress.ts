/**
 * Progress tracking types for student course progress.
 */

// =============================================================================
// Enums
// =============================================================================

export enum EnrollmentStatus {
  ENROLLED = "enrolled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  PAUSED = "paused",
}

export enum LessonProgressStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

// =============================================================================
// Lesson Progress
// =============================================================================

export interface LessonProgress {
  lesson_id: string;
  course_id: string;
  module_id: string;
  user_id: string;
  status: LessonProgressStatus;
  progress_percent: number;
  position_seconds: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  last_watched_at: string | null;
}

/**
 * Compact lesson progress for listing (from CourseProgress.lessons).
 * Matches backend LessonProgressSummary.
 */
export interface LessonProgressSummary {
  lesson_id: string;
  status: LessonProgressStatus;
  progress_percent: number;
  completed: boolean;
  last_position_seconds: number;
}

export interface LessonProgressCheck {
  lesson_id: string;
  status: LessonProgressStatus;
  progress_percent: number;
  position_seconds: number;
  duration_seconds: number;
  is_completed: boolean;
}

// =============================================================================
// Module Progress
// =============================================================================

export interface ModuleProgress {
  module_id: string;
  course_id: string;
  user_id: string;
  lessons_completed: number;
  lessons_total: number;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
}

// =============================================================================
// Enrollment
// =============================================================================

export interface Enrollment {
  course_id: string;
  user_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress_percent: number;
  lessons_completed: number;
  lessons_total: number;
  last_accessed_at: string | null;
  last_lesson_id: string | null;
  last_module_id: string | null;
}

// =============================================================================
// Course Progress (Aggregated)
// =============================================================================

export interface CourseProgress {
  course_id: string;
  enrollment: Enrollment;
  modules: ModuleProgress[];
  /** Flat list of all lesson progress for quick lookup */
  lessons: LessonProgressSummary[];
  resume_lesson_id: string | null;
  resume_module_id: string | null;
  resume_position_seconds: number;
}

// =============================================================================
// API Request Types
// =============================================================================

export interface UpdateVideoProgressRequest {
  lesson_id: string;
  course_id: string;
  module_id: string;
  position_seconds: number;
  duration_seconds: number;
}

export interface MarkLessonCompleteRequest {
  lesson_id: string;
  course_id: string;
  module_id: string;
}

export interface MarkLessonIncompleteRequest {
  lesson_id: string;
  course_id: string;
  module_id: string;
}

export interface EnrollRequest {
  course_id: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface LessonProgressResponse {
  lesson_id: string;
  course_id: string;
  module_id: string;
  user_id: string;
  status: LessonProgressStatus;
  progress_percent: number;
  position_seconds: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  last_watched_at: string | null;
}

export interface EnrollmentResponse {
  course_id: string;
  user_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress_percent: number;
  lessons_completed: number;
  lessons_total: number;
  last_accessed_at: string | null;
  last_lesson_id: string | null;
  last_module_id: string | null;
}

export interface EnrollmentListResponse {
  items: EnrollmentResponse[];
  total: number;
}

// =============================================================================
// UI State Types
// =============================================================================

export interface AutoplayState {
  enabled: boolean;
  countdown: number;
  nextLessonId: string | null;
  nextModuleId: string | null;
  isPaused: boolean;
}

export interface LessonCompletionOverlay {
  visible: boolean;
  lessonId: string | null;
  hasNextLesson: boolean;
  nextLessonId: string | null;
  nextModuleId: string | null;
}
