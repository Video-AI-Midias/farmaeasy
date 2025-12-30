/**
 * Hook for searching users with debounce and progressive loading.
 *
 * Features:
 * - Debounced search (300ms)
 * - Progressive loading (load more results)
 * - Cache to avoid repeated requests
 * - Loading and error states
 * - Support for admin API (full users) or teacher API (students/users only)
 */

import { usersAdminApi, usersApi } from "@/lib/users-api";
import type { User, UserRole } from "@/types/auth";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseUserSearchOptions {
  /**
   * Filter by role (only works with admin API).
   */
  role?: UserRole | undefined;
  /**
   * Minimum search term length before searching.
   * @default 2
   */
  minSearchLength?: number;
  /**
   * Debounce delay in milliseconds.
   * @default 300
   */
  debounceMs?: number;
  /**
   * Initial result limit.
   * @default 20
   */
  initialLimit?: number;
  /**
   * Use teacher API (returns only students/users).
   * If false, uses admin API (all users with role filter).
   * @default false
   */
  useTeacherApi?: boolean;
}

interface UseUserSearchReturn {
  users: User[];
  isSearching: boolean;
  hasMore: boolean;
  error: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  loadMore: () => void;
  reset: () => void;
}

/**
 * Hook for searching users with advanced features.
 *
 * @example
 * // Admin: search all users with role filter
 * const { users, setSearchTerm } = useUserSearch({ role: "student" });
 *
 * @example
 * // Teacher: search students/users only
 * const { users, setSearchTerm } = useUserSearch({ useTeacherApi: true });
 */
export function useUserSearch(options: UseUserSearchOptions = {}): UseUserSearchReturn {
  const {
    role,
    minSearchLength = 2,
    debounceMs = 300,
    initialLimit = 20,
    useTeacherApi = false,
  } = options;

  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLimit, setCurrentLimit] = useState(initialLimit);
  const [hasMore, setHasMore] = useState(false);

  // Cache to avoid repeated requests
  const cacheRef = useRef(new Map<string, User[]>());
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (term: string, limit: number) => {
      // Se o termo não estiver vazio mas for muito curto, não buscar ainda
      if (term.length > 0 && term.length < minSearchLength) {
        setUsers([]);
        setHasMore(false);
        return;
      }

      // Check cache first (include API type in cache key)
      const apiType = useTeacherApi ? "teacher" : "admin";
      const cacheKey = `${apiType}-${term}-${role || "all"}-${limit}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setUsers(cached);
        setHasMore(cached.length >= limit);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsSearching(true);
      setError(null);

      try {
        let result: { items: User[]; total: number };

        if (useTeacherApi) {
          // Teacher API: /auth/users/search (no role filter, backend handles it)
          result = await usersApi.searchUsersForTeacher({
            search: term.length > 0 ? term : undefined,
            limit,
          });
        } else {
          // Admin API: /auth/users (with optional role filter)
          const params: Parameters<typeof usersAdminApi.searchUsers>[0] = {
            limit,
          };

          if (term.length > 0) {
            params.search = term;
          }

          if (role) {
            params.role = role;
          }

          result = await usersAdminApi.searchUsers(params);
        }

        setUsers(result.items);
        setHasMore(result.items.length >= limit);

        // Cache results
        cacheRef.current.set(cacheKey, result.items);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError("Erro ao buscar usuarios");
        setUsers([]);
        setHasMore(false);
      } finally {
        setIsSearching(false);
        abortControllerRef.current = null;
      }
    },
    [minSearchLength, role, useTeacherApi],
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(searchTerm, currentLimit);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, currentLimit, search, debounceMs]);

  const loadMore = useCallback(() => {
    const newLimit = currentLimit + 20;
    setCurrentLimit(newLimit);
    search(searchTerm, newLimit);
  }, [currentLimit, searchTerm, search]);

  const reset = useCallback(() => {
    setSearchTerm("");
    setUsers([]);
    setError(null);
    setCurrentLimit(initialLimit);
    setHasMore(false);
    cacheRef.current.clear();
  }, [initialLimit]);

  return {
    users,
    isSearching,
    hasMore,
    error,
    searchTerm,
    setSearchTerm,
    loadMore,
    reset,
  };
}

export default useUserSearch;
