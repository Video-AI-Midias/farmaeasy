/**
 * API client for course acquisition operations.
 *
 * Features:
 * - Student: Self-enroll in free courses, check access
 * - Admin: Grant/revoke access, manage course students
 */

import type {
  Acquisition,
  AcquisitionListResponse,
  BatchGrantAccessRequest,
  BatchGrantAccessResponse,
  CheckAccessResponse,
  GrantAccessRequest,
  RevokeAccessRequest,
  StudentCountResponse,
} from "@/types/acquisitions";
import { api } from "./api";

// ==============================================================================
// Student API
// ==============================================================================

export const acquisitionsApi = {
  /**
   * Enroll current user in a free course.
   * Creates a FREE acquisition automatically.
   */
  enrollFree: async (courseId: string): Promise<Acquisition> => {
    const response = await api.post<Acquisition>(`/acquisitions/enroll/${courseId}`);
    return response.data;
  },

  /**
   * Get all acquisitions for current user.
   */
  getMyAcquisitions: async (activeOnly = false): Promise<AcquisitionListResponse> => {
    const params = new URLSearchParams();
    if (activeOnly) {
      params.append("active_only", "true");
    }
    const response = await api.get<AcquisitionListResponse>(
      `/acquisitions/my${params.toString() ? `?${params.toString()}` : ""}`,
    );
    return response.data;
  },

  /**
   * Check if current user has access to a specific course.
   */
  checkAccess: async (courseId: string): Promise<CheckAccessResponse> => {
    const response = await api.get<CheckAccessResponse>(`/acquisitions/check/${courseId}`);
    return response.data;
  },
};

// ==============================================================================
// Admin API
// ==============================================================================

export const acquisitionsAdminApi = {
  /**
   * Grant access to a course for a specific user.
   */
  grantAccess: async (data: GrantAccessRequest): Promise<Acquisition> => {
    const response = await api.post<Acquisition>("/admin/acquisitions/grant", data);
    return response.data;
  },

  /**
   * Grant access to multiple users at once.
   */
  batchGrantAccess: async (data: BatchGrantAccessRequest): Promise<BatchGrantAccessResponse> => {
    const response = await api.post<BatchGrantAccessResponse>(
      "/admin/acquisitions/grant/batch",
      data,
    );
    return response.data;
  },

  /**
   * Revoke a user's access to a course.
   */
  revokeAccess: async (
    userId: string,
    courseId: string,
    data?: RevokeAccessRequest,
  ): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(
      `/admin/acquisitions/${userId}/course/${courseId}`,
      { data },
    );
    return response.data;
  },

  /**
   * List all users with access to a specific course.
   */
  getCourseStudents: async (courseId: string, limit = 100): Promise<AcquisitionListResponse> => {
    const response = await api.get<AcquisitionListResponse>(
      `/admin/acquisitions/course/${courseId}/students?limit=${limit}`,
    );
    return response.data;
  },

  /**
   * List all acquisitions for a specific user.
   */
  getUserAcquisitions: async (
    userId: string,
    activeOnly = false,
  ): Promise<AcquisitionListResponse> => {
    const params = new URLSearchParams();
    if (activeOnly) {
      params.append("active_only", "true");
    }
    const response = await api.get<AcquisitionListResponse>(
      `/admin/acquisitions/user/${userId}${params.toString() ? `?${params.toString()}` : ""}`,
    );
    return response.data;
  },

  /**
   * Count students with access to a specific course.
   */
  countCourseStudents: async (courseId: string): Promise<StudentCountResponse> => {
    const response = await api.get<StudentCountResponse>(
      `/admin/acquisitions/course/${courseId}/count`,
    );
    return response.data;
  },
};

export default {
  student: acquisitionsApi,
  admin: acquisitionsAdminApi,
};
