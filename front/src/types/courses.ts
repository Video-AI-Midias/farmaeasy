/**
 * Types for course management system.
 *
 * Mirrors backend schemas from src/courses/schemas.py
 */

// ==============================================================================
// Enums
// ==============================================================================

export enum ContentStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export enum ContentType {
  VIDEO = "video",
  TEXT = "text",
  QUIZ = "quiz",
  PDF = "pdf",
  EMBED = "embed",
}

// Allowed domains for EMBED content type (must match backend)
export const ALLOWED_EMBED_DOMAINS = [
  "gamma.app",
  "canva.com",
  "docs.google.com",
  "slides.google.com",
  "drive.google.com",
  "figma.com",
  "miro.com",
  "notion.so",
  "prezi.com",
  "slideshare.net",
  "youtube.com",
  "youtube-nocookie.com",
  "vimeo.com",
  "loom.com",
  "genially.com",
  "padlet.com",
  "mentimeter.com",
  "kahoot.it",
  "typeform.com",
  "jotform.com",
];

/**
 * Check if a URL is from an allowed embed domain.
 */
export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname.toLowerCase();
    if (domain.startsWith("www.")) {
      domain = domain.slice(4);
    }
    return ALLOWED_EMBED_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

// ==============================================================================
// Course Types
// ==============================================================================

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  status: ContentStatus;
  creator_id: string;
  price: string | null; // Decimal as string
  is_free: boolean;
  requires_enrollment: boolean;
  created_at: string;
  updated_at: string | null;
  module_count: number;
}

export interface CourseDetail extends Course {
  modules: ModuleInCourse[];
  /** User has active acquisition (null if anonymous) */
  has_access: boolean | null;
  /** How user acquired access (if has_access) */
  acquisition_type: string | null;
}

export interface CreateCourseRequest {
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  price?: string | null;
  is_free?: boolean;
}

export interface UpdateCourseRequest {
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  status?: ContentStatus | null;
  price?: string | null;
  is_free?: boolean | null;
}

export interface CourseListResponse {
  items: Course[];
  total: number;
  has_more: boolean;
}

// ==============================================================================
// Module Types
// ==============================================================================

export interface Module {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  status: ContentStatus;
  creator_id: string;
  created_at: string;
  updated_at: string | null;
  lesson_count: number;
}

export interface ModuleInCourse extends Module {
  position: number;
  lessons: LessonInModule[];
}

export interface ModuleDetail extends Module {
  lessons: LessonInModule[];
}

export interface CreateModuleRequest {
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
}

export interface UpdateModuleRequest {
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  status?: ContentStatus | null;
}

export interface ModuleListResponse {
  items: Module[];
  total: number;
  has_more: boolean;
}

// ==============================================================================
// Lesson Types
// ==============================================================================

export interface Lesson {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content_type: ContentType;
  content_url: string | null;
  duration_seconds: number | null;
  status: ContentStatus;
  creator_id: string;
  created_at: string;
  updated_at: string | null;
  /** Computed field: true if lesson has valid content for its content_type */
  is_valid: boolean;
}

export interface LessonInModule extends Lesson {
  position: number;
}

export interface CreateLessonRequest {
  title: string;
  description?: string | null;
  content_type: ContentType;
  content_url?: string | null;
  duration_seconds?: number | null;
}

export interface UpdateLessonRequest {
  title?: string | null;
  description?: string | null;
  content_type?: ContentType | null;
  content_url?: string | null;
  duration_seconds?: number | null;
  status?: ContentStatus | null;
}

export interface LessonListResponse {
  items: Lesson[];
  total: number;
  has_more: boolean;
}

// ==============================================================================
// Link/Unlink Types
// ==============================================================================

export interface LinkModuleRequest {
  module_id: string;
  position?: number | null;
}

export interface LinkLessonRequest {
  lesson_id: string;
  position?: number | null;
}

export interface ReorderRequest {
  items: string[];
}

// ==============================================================================
// Reference Types (for usage queries)
// ==============================================================================

export interface CourseReference {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
}

export interface ModuleReference {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
}

export interface ModuleUsageResponse {
  module: Module;
  courses: CourseReference[];
  course_count: number;
}

export interface LessonUsageResponse {
  lesson: Lesson;
  modules: ModuleReference[];
  module_count: number;
}

// ==============================================================================
// Message Response
// ==============================================================================

export interface MessageResponse {
  message: string;
}

// ==============================================================================
// Drag and Drop Types (dnd-kit integration)
// ==============================================================================

export interface DraggableModule extends ModuleInCourse {
  dragId: string;
}

export interface DraggableLesson extends LessonInModule {
  dragId: string;
}

export type DraggableItem = DraggableModule | DraggableLesson;

// ==============================================================================
// Store State Types
// ==============================================================================

export interface CoursesState {
  courses: Course[];
  currentCourse: CourseDetail | null;
  isLoading: boolean;
  error: string | null;
}

export interface ModulesState {
  modules: Module[];
  currentModule: ModuleDetail | null;
  isLoading: boolean;
  error: string | null;
}

export interface LessonsState {
  lessons: Lesson[];
  currentLesson: Lesson | null;
  isLoading: boolean;
  error: string | null;
}

// ==============================================================================
// Filter Types
// ==============================================================================

export interface CourseFilters {
  status?: ContentStatus | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: string | undefined;
}

export interface ModuleFilters {
  status?: ContentStatus;
  search?: string;
  limit?: number;
}

export interface LessonFilters {
  status?: ContentStatus;
  content_type?: ContentType;
  search?: string;
  limit?: number;
}
