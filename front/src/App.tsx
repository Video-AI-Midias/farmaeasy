import { ProtectedRoute, PublicRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { useAuthInit } from "@/hooks/useAuth";
import { AdminNotificationsPage } from "@/pages/AdminNotifications";
import { CourseDetailPage } from "@/pages/CourseDetail";
import { CoursesPage } from "@/pages/Courses";
import { DashboardPage } from "@/pages/Dashboard";
import { LessonsPage } from "@/pages/Lessons";
import { LoginPage } from "@/pages/Login";
import { ModuleDetailPage } from "@/pages/ModuleDetail";
import { ModulesPage } from "@/pages/Modules";
import { RegisterPage } from "@/pages/Register";
import { SettingsPage } from "@/pages/Settings";
import { UnauthorizedPage } from "@/pages/Unauthorized";
import { UsersPage } from "@/pages/Users";
import {
  StudentCourseViewContent,
  StudentHomePage,
  StudentLessonViewContent,
} from "@/pages/student";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

function AppRoutes() {
  const isInitialized = useAuthInit();

  // Show loading while initializing auth
  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes - accessible without authentication */}
      <Route path="/" element={<HomePage />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Protected routes - Admin/Teacher only */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requiredRole="teacher">
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CoursesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:id"
        element={
          <ProtectedRoute requiredRole="teacher">
            <CourseDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules"
        element={
          <ProtectedRoute requiredRole="teacher">
            <ModulesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/:id"
        element={
          <ProtectedRoute requiredRole="teacher">
            <ModuleDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lessons"
        element={
          <ProtectedRoute requiredRole="teacher">
            <LessonsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRole="admin">
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminNotificationsPage />
          </ProtectedRoute>
        }
      />

      {/* User settings - any authenticated user */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Student routes - Learning area (any authenticated user) */}
      <Route
        path="/student"
        element={
          <ProtectedRoute>
            <StudentHomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/:slug"
        element={
          <ProtectedRoute>
            <StudentCourseViewContent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/:courseSlug/lesson/:lessonSlug"
        element={
          <ProtectedRoute>
            <StudentLessonViewContent />
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-primary">FarmaEasy</h1>
      <p className="mt-4 text-muted-foreground">Sistema de Gestão de Farmácia</p>
      <div className="mt-8 flex gap-4">
        <Button asChild>
          <Link to="/login">Entrar</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/register">Criar conta</Link>
        </Button>
      </div>
    </main>
  );
}
