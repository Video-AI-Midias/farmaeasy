/**
 * Auth hooks for components.
 *
 * - useAuth: Access auth state and actions
 * - useAuthInit: Initialize auth on app startup
 * - useRequireAuth: Redirect if not authenticated
 * - useRequireRole: Redirect if user doesn't have required role
 */

import { useAuthStore } from "@/stores/auth";
import type { UserRole } from "@/types/auth";
import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Role hierarchy for permission checking
const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  student: 1,
  teacher: 2,
  admin: 3,
};

/**
 * Main auth hook - provides auth state and actions
 */
export function useAuth() {
  const store = useAuthStore();

  return {
    // State
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,

    // Actions
    login: store.login,
    register: store.register,
    logout: store.logout,
    updateProfile: store.updateProfile,
    changePassword: store.changePassword,

    // Role helpers
    hasRole: useCallback(
      (role: UserRole) => {
        if (!store.user) return false;
        return ROLE_HIERARCHY[store.user.role] >= ROLE_HIERARCHY[role];
      },
      [store.user],
    ),

    isAdmin: store.user?.role === "admin",
    isTeacher: store.user?.role === "teacher" || store.user?.role === "admin",
    isStudent:
      store.user?.role === "student" ||
      store.user?.role === "teacher" ||
      store.user?.role === "admin",
  };
}

/**
 * Initialize auth on app startup.
 * Call this once in App.tsx to restore session from refresh token.
 */
export function useAuthInit() {
  const refreshAuth = useAuthStore((state) => state.refreshAuth);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      refreshAuth();
    }
  }, [refreshAuth, isInitialized]);

  return isInitialized;
}

/**
 * Require authentication - redirects to login if not authenticated.
 * Returns true when auth check is complete and user is authenticated.
 */
export function useRequireAuth(redirectTo = "/login") {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isInitialized && !isLoading && !isAuthenticated) {
      // Save current location for redirect after login
      navigate(redirectTo, {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [isAuthenticated, isInitialized, isLoading, navigate, redirectTo, location.pathname]);

  return {
    isReady: isInitialized && !isLoading && isAuthenticated,
    isLoading: !isInitialized || isLoading,
  };
}

/**
 * Require specific role - redirects if user doesn't have permission.
 */
export function useRequireRole(role: UserRole, redirectTo = "/unauthorized") {
  const { user, isAuthenticated, isInitialized, isLoading, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitialized && !isLoading) {
      if (!isAuthenticated) {
        navigate("/login", { replace: true });
      } else if (!hasRole(role)) {
        navigate(redirectTo, { replace: true });
      }
    }
  }, [isAuthenticated, isInitialized, isLoading, hasRole, role, navigate, redirectTo]);

  return {
    isReady: isInitialized && !isLoading && isAuthenticated && hasRole(role),
    isLoading: !isInitialized || isLoading,
    user,
  };
}

/**
 * Redirect authenticated users away from public pages (login, register).
 */
export function useRedirectIfAuthenticated(redirectTo = "/dashboard") {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isInitialized && !isLoading && isAuthenticated) {
      // Redirect to saved location or default
      const from = (location.state as { from?: string })?.from ?? redirectTo;
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isInitialized, isLoading, navigate, redirectTo, location.state]);

  return {
    isReady: isInitialized && !isLoading,
    isAuthenticated,
  };
}

export default useAuth;
