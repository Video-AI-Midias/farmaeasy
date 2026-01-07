/**
 * Auth hooks for components.
 *
 * Re-exports authorization utilities from @farmaeasy/authorization module.
 * Provides:
 * - useAuth: Access auth state and actions
 * - useAuthInit: Initialize auth on app startup
 * - useRequireAuth: Redirect if not authenticated
 * - useRequireRole: Redirect if user doesn't have required role
 * - usePermissions: Permission checking utilities (from authorization module)
 */

import { useAuthStore } from "@/stores/auth";
import type { UserRole } from "@/types/auth";
import {
  isAdmin as checkIsAdmin,
  hasPermission,
  isAtLeastStudent,
  isAtLeastTeacher,
} from "@farmaeasy/authorization";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Re-export usePermissions for direct use
export { usePermissions } from "@farmaeasy/authorization";

/**
 * Main auth hook - provides auth state and actions
 */
export function useAuth() {
  const store = useAuthStore();

  const permissions = useMemo(() => {
    const role = store.user?.role ?? "user";
    return {
      isAdmin: checkIsAdmin(role),
      isTeacher: isAtLeastTeacher(role),
      isStudent: isAtLeastStudent(role),
    };
  }, [store.user?.role]);

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

    // Role helpers (using authorization module)
    hasRole: useCallback(
      (role: UserRole) => {
        if (!store.user) return false;
        return hasPermission(store.user.role, role);
      },
      [store.user],
    ),

    ...permissions,
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
export function useRequireAuth(redirectTo = "/entrar") {
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
export function useRequireRole(role: UserRole, redirectTo = "/nao-autorizado") {
  const { user, isAuthenticated, isInitialized, isLoading, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitialized && !isLoading) {
      if (!isAuthenticated) {
        navigate("/entrar", { replace: true });
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
export function useRedirectIfAuthenticated(redirectTo = "/painel") {
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
