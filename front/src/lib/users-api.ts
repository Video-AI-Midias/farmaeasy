/**
 * API client for user operations.
 *
 * Features:
 * - Admin: Full user search by email/name with role filter
 * - Teacher: Search users (filtered to students/users only)
 * - Teacher: Create student accounts
 */

import type {
  CreateStudentRequest,
  CreateStudentResponse,
  SearchUsersForTeacherParams,
  User,
  UserRole,
} from "@/types/auth";
import { api } from "./api";

export interface UserListResponse {
  items: User[];
  total: number;
}

export interface SearchUsersParams {
  search?: string;
  role?: UserRole;
  limit?: number;
}

/**
 * Users API for teachers (create students, search users).
 */
export const usersApi = {
  /**
   * Search users for teachers (returns only students/users).
   * Uses /auth/users/search endpoint (teacher+).
   */
  searchUsersForTeacher: async (
    params: SearchUsersForTeacherParams = {},
  ): Promise<UserListResponse> => {
    const searchParams = new URLSearchParams();

    if (params.search) {
      searchParams.append("search", params.search);
    }
    if (params.limit) {
      searchParams.append("limit", String(params.limit));
    }

    const queryString = searchParams.toString();
    const url = `/auth/users/search${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<UserListResponse>(url);
    return response.data;
  },

  /**
   * Create a new student account (teacher+).
   * Uses /auth/users/student endpoint.
   */
  createStudent: async (data: CreateStudentRequest): Promise<CreateStudentResponse> => {
    const response = await api.post<CreateStudentResponse>("/auth/users/student", data);
    return response.data;
  },
};

/**
 * Users API for admins (full user management).
 */
export const usersAdminApi = {
  /**
   * Search/list users (admin only).
   * Uses /auth/users endpoint with full role filtering.
   */
  searchUsers: async (params: SearchUsersParams = {}): Promise<UserListResponse> => {
    const searchParams = new URLSearchParams();

    if (params.search) {
      searchParams.append("search", params.search);
    }
    if (params.role) {
      searchParams.append("role", params.role);
    }
    if (params.limit) {
      searchParams.append("limit", String(params.limit));
    }

    const queryString = searchParams.toString();
    const url = `/auth/users${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<UserListResponse>(url);
    return response.data;
  },
};

export default usersAdminApi;
