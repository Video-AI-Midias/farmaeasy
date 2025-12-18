/**
 * Protected route wrapper component.
 *
 * Usage:
 * <Route path="/painel" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 * <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>} />
 */

import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import { Navigate, useLocation } from "react-router-dom";

// Role hierarchy for permission checking
const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  student: 1,
  teacher: 2,
  admin: 3,
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  redirectTo?: string;
  unauthorizedRedirectTo?: string;
}

/**
 * Loading spinner component
 */
function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * Protected route component with role-based access control
 */
export function ProtectedRoute({
  children,
  requiredRole,
  redirectTo = "/entrar",
  unauthorizedRedirectTo = "/nao-autorizado",
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isInitialized, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (!isInitialized || isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location.pathname }} replace />;
  }

  // Check role if required
  if (requiredRole && user) {
    const userLevel = ROLE_HIERARCHY[user.role];
    const requiredLevel = ROLE_HIERARCHY[requiredRole];

    if (userLevel < requiredLevel) {
      return <Navigate to={unauthorizedRedirectTo} replace />;
    }
  }

  return <>{children}</>;
}

/**
 * Get role-based default redirect path
 */
function getRoleBasedRedirect(role: UserRole | undefined): string {
  if (!role) return "/aluno";

  const roleLevel = ROLE_HIERARCHY[role];

  // Teachers and admins go to admin dashboard
  if (roleLevel >= ROLE_HIERARCHY.teacher) {
    return "/painel";
  }

  // Students and regular users go to student home
  return "/aluno";
}

/**
 * Public route that redirects authenticated users based on their role
 */
interface PublicRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function PublicRoute({ children, redirectTo }: PublicRouteProps) {
  const { user, isAuthenticated, isInitialized, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (!isInitialized || isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect authenticated users based on role
  if (isAuthenticated) {
    const from = (location.state as { from?: string })?.from;
    // Use explicit redirectTo, then saved location, then role-based default
    const target = from ?? redirectTo ?? getRoleBasedRedirect(user?.role);
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

/**
 * Admin only route shorthand
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="admin">{children}</ProtectedRoute>;
}

/**
 * Teacher+ route shorthand (teacher or admin)
 */
export function TeacherRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="teacher">{children}</ProtectedRoute>;
}

/**
 * Student+ route shorthand (student, teacher, or admin)
 */
export function StudentRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="student">{children}</ProtectedRoute>;
}

export default ProtectedRoute;
