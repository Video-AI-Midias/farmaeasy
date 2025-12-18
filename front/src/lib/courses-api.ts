/**
 * API client for course management operations.
 *
 * Features:
 * - CRUD operations for courses, modules, and lessons
 * - Link/unlink operations for course-module and module-lesson relationships
 * - Reorder operations for drag-and-drop functionality
 * - Usage queries to check where modules/lessons are used
 */

import type {
  Course,
  CourseDetail,
  CourseFilters,
  CourseListResponse,
  CreateCourseRequest,
  CreateLessonRequest,
  CreateModuleRequest,
  Lesson,
  LessonFilters,
  LessonListResponse,
  LessonUsageResponse,
  LinkLessonRequest,
  LinkModuleRequest,
  MessageResponse,
  Module,
  ModuleDetail,
  ModuleFilters,
  ModuleListResponse,
  ModuleUsageResponse,
  ReorderRequest,
  UpdateCourseRequest,
  UpdateLessonRequest,
  UpdateModuleRequest,
} from "@/types/courses";
import { api } from "./api";

// ==============================================================================
// Courses API
// ==============================================================================

export const coursesApi = {
  /**
   * List courses with filters (admin view).
   */
  list: async (filters?: CourseFilters): Promise<CourseListResponse> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset);

    const response = await api.get<CourseListResponse>(`/courses/admin?${params.toString()}`);
    return response.data;
  },

  /**
   * List published courses (public view).
   */
  listPublished: async (limit?: number, offset?: string): Promise<CourseListResponse> => {
    const params = new URLSearchParams();
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset);

    const response = await api.get<CourseListResponse>(`/courses?${params.toString()}`);
    return response.data;
  },

  /**
   * Get course by ID with full details.
   */
  get: async (id: string): Promise<CourseDetail> => {
    const response = await api.get<CourseDetail>(`/courses/${id}`);
    return response.data;
  },

  /**
   * Get course by slug (public view).
   */
  getBySlug: async (slug: string): Promise<CourseDetail> => {
    const response = await api.get<CourseDetail>(`/courses/slug/${slug}`);
    return response.data;
  },

  /**
   * Create a new course.
   */
  create: async (data: CreateCourseRequest): Promise<Course> => {
    const response = await api.post<Course>("/courses", data);
    return response.data;
  },

  /**
   * Update an existing course.
   */
  update: async (id: string, data: UpdateCourseRequest): Promise<Course> => {
    const response = await api.put<Course>(`/courses/${id}`, data);
    return response.data;
  },

  /**
   * Delete a course.
   */
  delete: async (id: string): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/courses/${id}`);
    return response.data;
  },

  /**
   * Get modules linked to a course.
   */
  getModules: async (courseId: string): Promise<ModuleDetail[]> => {
    const response = await api.get<ModuleDetail[]>(`/courses/${courseId}/modules`);
    return response.data;
  },

  /**
   * Link a module to a course.
   */
  linkModule: async (courseId: string, data: LinkModuleRequest): Promise<MessageResponse> => {
    const response = await api.post<MessageResponse>(`/courses/${courseId}/modules`, data);
    return response.data;
  },

  /**
   * Unlink a module from a course.
   */
  unlinkModule: async (courseId: string, moduleId: string): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/courses/${courseId}/modules/${moduleId}`);
    return response.data;
  },

  /**
   * Reorder modules within a course.
   */
  reorderModules: async (courseId: string, data: ReorderRequest): Promise<MessageResponse> => {
    const response = await api.put<MessageResponse>(`/courses/${courseId}/modules/reorder`, data);
    return response.data;
  },
};

// ==============================================================================
// Modules API
// ==============================================================================

export const modulesApi = {
  /**
   * List all modules with filters.
   */
  list: async (filters?: ModuleFilters): Promise<ModuleListResponse> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const response = await api.get<ModuleListResponse>(`/modules?${params.toString()}`);
    return response.data;
  },

  /**
   * Get module by ID.
   */
  get: async (id: string): Promise<ModuleDetail> => {
    const response = await api.get<ModuleDetail>(`/modules/${id}`);
    return response.data;
  },

  /**
   * Create a new module.
   */
  create: async (data: CreateModuleRequest): Promise<Module> => {
    const response = await api.post<Module>("/modules", data);
    return response.data;
  },

  /**
   * Update an existing module.
   */
  update: async (id: string, data: UpdateModuleRequest): Promise<Module> => {
    const response = await api.put<Module>(`/modules/${id}`, data);
    return response.data;
  },

  /**
   * Delete a module.
   * @param id - Module ID
   * @param force - If true, unlink from all courses before deleting (requires ADMIN)
   */
  delete: async (id: string, force = false): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/modules/${id}`, {
      params: force ? { force: true } : undefined,
    });
    return response.data;
  },

  /**
   * Get lessons linked to a module.
   */
  getLessons: async (moduleId: string): Promise<Lesson[]> => {
    const response = await api.get<Lesson[]>(`/modules/${moduleId}/lessons`);
    return response.data;
  },

  /**
   * Link a lesson to a module.
   */
  linkLesson: async (moduleId: string, data: LinkLessonRequest): Promise<MessageResponse> => {
    const response = await api.post<MessageResponse>(`/modules/${moduleId}/lessons`, data);
    return response.data;
  },

  /**
   * Unlink a lesson from a module.
   */
  unlinkLesson: async (moduleId: string, lessonId: string): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/modules/${moduleId}/lessons/${lessonId}`);
    return response.data;
  },

  /**
   * Reorder lessons within a module.
   */
  reorderLessons: async (moduleId: string, data: ReorderRequest): Promise<MessageResponse> => {
    const response = await api.put<MessageResponse>(`/modules/${moduleId}/lessons/reorder`, data);
    return response.data;
  },

  /**
   * Get courses that use this module.
   */
  getUsage: async (moduleId: string): Promise<ModuleUsageResponse> => {
    const response = await api.get<ModuleUsageResponse>(`/modules/${moduleId}/courses`);
    return response.data;
  },
};

// ==============================================================================
// Lessons API
// ==============================================================================

export const lessonsApi = {
  /**
   * List all lessons with filters.
   */
  list: async (filters?: LessonFilters): Promise<LessonListResponse> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.content_type) params.append("content_type", filters.content_type);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.limit) params.append("limit", filters.limit.toString());

    const response = await api.get<LessonListResponse>(`/lessons?${params.toString()}`);
    return response.data;
  },

  /**
   * Get lesson by ID.
   */
  get: async (id: string): Promise<Lesson> => {
    const response = await api.get<Lesson>(`/lessons/${id}`);
    return response.data;
  },

  /**
   * Create a new lesson.
   */
  create: async (data: CreateLessonRequest): Promise<Lesson> => {
    const response = await api.post<Lesson>("/lessons", data);
    return response.data;
  },

  /**
   * Update an existing lesson.
   */
  update: async (id: string, data: UpdateLessonRequest): Promise<Lesson> => {
    const response = await api.put<Lesson>(`/lessons/${id}`, data);
    return response.data;
  },

  /**
   * Delete a lesson.
   * @param id - Lesson ID
   * @param force - If true, unlink from all modules before deleting (requires ADMIN)
   */
  delete: async (id: string, force = false): Promise<MessageResponse> => {
    const response = await api.delete<MessageResponse>(`/lessons/${id}`, {
      params: force ? { force: true } : undefined,
    });
    return response.data;
  },

  /**
   * Get modules that use this lesson.
   */
  getUsage: async (lessonId: string): Promise<LessonUsageResponse> => {
    const response = await api.get<LessonUsageResponse>(`/lessons/${lessonId}/modules`);
    return response.data;
  },
};

export default {
  courses: coursesApi,
  modules: modulesApi,
  lessons: lessonsApi,
};
