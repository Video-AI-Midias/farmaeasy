import heroIllustration from "@/assets/hero-illustration.png";
import logoHorizontal from "@/assets/logo-horizontal.png";
import { ProtectedRoute, PublicRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthInit } from "@/hooks/useAuth";
import { AdminNotificationsPage } from "@/pages/AdminNotifications";
import { CourseDetailPage } from "@/pages/CourseDetail";
import { CoursesPage } from "@/pages/Courses";
import { DashboardPage } from "@/pages/Dashboard";
import { ForgotPasswordPage } from "@/pages/ForgotPassword";
import { LessonsPage } from "@/pages/Lessons";
import { LoginPage } from "@/pages/Login";
import { ModuleDetailPage } from "@/pages/ModuleDetail";
import { ModulesPage } from "@/pages/Modules";
import { RegisterPage } from "@/pages/Register";
import { ResetPasswordPage } from "@/pages/ResetPassword";
import { SettingsPage } from "@/pages/Settings";
import { UnauthorizedPage } from "@/pages/Unauthorized";
import { UsersPage } from "@/pages/Users";
import {
  StudentCourseViewContent,
  StudentHomePage,
  StudentLessonViewContent,
} from "@/pages/student";
import {
  Award,
  BookOpen,
  ExternalLink,
  GraduationCap,
  PlayCircle,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
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
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPasswordPage />
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <img src={logoHorizontal} alt="FarmaEasy" className="h-10 w-auto" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Criar conta</Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-12 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                Treinamento Comercial para Farmácias
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Padronize atendimento. <span className="text-primary">Venda mais.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Treinamento prático para sua equipe de farmácia: padronize atendimento no balcão,
                telefone e WhatsApp com roteiros prontos e planos de ação.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="gap-2 text-base" asChild>
                <Link to="/register">
                  <GraduationCap className="h-5 w-5" />
                  Começar agora
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="gap-2 text-base" asChild>
                <Link to="/login">
                  <PlayCircle className="h-5 w-5" />
                  Já tenho conta
                </Link>
              </Button>
            </div>

            {/* Social Proof - Informações reais do produto */}
            <div className="flex items-center gap-6 pt-4 border-t border-border/50">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">13</p>
                <p className="text-sm text-muted-foreground">Aulas práticas</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">5</p>
                <p className="text-sm text-muted-foreground">Módulos completos</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">100%</p>
                <p className="text-sm text-muted-foreground">Aplicação prática</p>
              </div>
            </div>
          </div>

          {/* Right - Hero Illustration */}
          <div className="relative hidden lg:block">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-accent/10 to-transparent rounded-3xl blur-3xl" />
            <div className="relative">
              <img
                src={heroIllustration}
                alt="Treinamento comercial para farmácias - atendimento de excelência"
                className="w-full h-auto rounded-2xl shadow-2xl border border-border/50"
              />
            </div>
          </div>
        </div>

        {/* Features Grid - Mobile */}
        <div className="grid grid-cols-2 gap-4 mt-12 lg:hidden">
          <Card className="bg-card backdrop-blur border-border/50">
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/20">
                <BookOpen className="h-7 w-7 text-primary" />
              </div>
              <span className="text-sm font-medium">Roteiros Prontos</span>
            </CardContent>
          </Card>
          <Card className="bg-card backdrop-blur border-border/50">
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-accent/20">
                <Award className="h-7 w-7 text-accent" />
              </div>
              <span className="text-sm font-medium">Planos de Ação</span>
            </CardContent>
          </Card>
          <Card className="bg-card backdrop-blur border-border/50">
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/20">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <span className="text-sm font-medium">Equipe Alinhada</span>
            </CardContent>
          </Card>
          <Card className="bg-card backdrop-blur border-border/50">
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-green-500/20">
                <Shield className="h-7 w-7 text-green-500" />
              </div>
              <span className="text-sm font-medium">Garantia 7 dias</span>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            © 2025 FarmaEasy. Todos os direitos reservados.
          </p>
          <Button variant="link" className="gap-2 text-muted-foreground hover:text-primary" asChild>
            <a href="https://farmaeasy.com.br" target="_blank" rel="noopener noreferrer">
              Conheça o treinamento completo
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </footer>
    </div>
  );
}
