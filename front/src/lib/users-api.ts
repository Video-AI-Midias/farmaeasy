/**
 * API client for user operations (admin).
 *
 * Features:
 * - Search users by email/name
 * - Filter by role
 */

import type { User, UserRole } from "@/types/auth";
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

export const usersAdminApi = {
  /**
   * Search/list users (admin only).
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
