/**
 * Dashboard page (protected).
 *
 * Main dashboard with stats, quick actions, and user profile.
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCoursesStore } from "@/stores/courses";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  GraduationCap,
  Layers,
  Mail,
  Phone,
  Plus,
  User,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrador",
    teacher: "Professor",
    student: "Aluno",
    user: "Aluno", // Unificado com student - ambos são alunos
  };
  return labels[role] ?? role;
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  if (role === "teacher") return "secondary";
  return "outline";
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}min atras`;
  if (diffHours < 24) return `${diffHours}h atras`;
  if (diffDays === 1) return "1 dia atras";
  if (diffDays < 7) return `${diffDays} dias atras`;
  return date.toLocaleDateString("pt-BR");
}

function DashboardContent() {
  const { user, isTeacher, isAdmin } = useAuth();
  const { courses, modules, lessons, isLoading, fetchCourses, fetchModules, fetchLessons } =
    useCoursesStore();

  // Fetch data on mount
  useEffect(() => {
    if (isTeacher) {
      fetchCourses();
      fetchModules();
      fetchLessons();
    }
  }, [isTeacher, fetchCourses, fetchModules, fetchLessons]);

  // Calculate stats from real data
  const stats = {
    totalCourses: courses.length,
    totalModules: modules.length,
    totalLessons: lessons.length,
    totalStudents: 0, // Would need users API
    completionRate: 67, // Would need progress API
  };

  const quickActions = [
    {
      label: "Criar Curso",
      href: "/cursos",
      icon: BookOpen,
      description: "Adicionar novo curso",
      roles: ["teacher", "admin"],
    },
    {
      label: "Novo Modulo",
      href: "/modulos",
      icon: Layers,
      description: "Criar modulo de aulas",
      roles: ["teacher", "admin"],
    },
    {
      label: "Ver Cursos",
      href: "/cursos",
      icon: GraduationCap,
      description: "Gerenciar cursos existentes",
      roles: ["teacher", "admin"],
    },
    {
      label: "Usuarios",
      href: "/usuarios",
      icon: Users,
      description: "Gerenciar usuarios",
      roles: ["admin"],
    },
    {
      label: "Notificacoes",
      href: "/admin/notificacoes",
      icon: Mail,
      description: "Enviar notificacoes",
      roles: ["admin"],
    },
  ];

  const filteredActions = quickActions.filter((action) => {
    if (!action.roles) return true;
    if (isAdmin) return true;
    if (isTeacher && action.roles.includes("teacher")) return true;
    return false;
  });

  // Build recent activity from real data
  const recentActivity = [
    ...courses.slice(0, 2).map((course) => ({
      id: course.id,
      type: "course" as const,
      title: course.title,
      action: "criado",
      time: formatRelativeTime(course.created_at),
      createdAt: course.created_at,
    })),
    ...modules.slice(0, 2).map((module) => ({
      id: module.id,
      type: "module" as const,
      title: module.title,
      action: "criado",
      time: formatRelativeTime(module.created_at),
      createdAt: module.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome section */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bem-vindo, {user?.name?.split(" ")[0]}!
            </h1>
            <p className="text-muted-foreground">Aqui esta um resumo das suas atividades.</p>
          </div>
          {isTeacher && (
            <Button asChild>
              <Link to="/cursos">
                <Plus className="mr-2 h-4 w-4" />
                Novo Curso
              </Link>
            </Button>
          )}
        </div>

        {/* Stats cards */}
        {isTeacher && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Cursos</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalCourses}</div>
                )}
                <p className="text-xs text-muted-foreground">cursos cadastrados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Modulos</CardTitle>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalModules}</div>
                )}
                <p className="text-xs text-muted-foreground">modulos cadastrados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aulas</CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalLessons}</div>
                )}
                <p className="text-xs text-muted-foreground">aulas disponiveis</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Alunos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">em breve</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Profile card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Meu Perfil
              </CardTitle>
              <CardDescription>Suas informacoes pessoais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user?.avatar_url} alt={user?.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {user?.name ? getInitials(user.name) : "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{user?.name}</h3>
                  <Badge variant={getRoleBadgeVariant(user?.role ?? "user")}>
                    {getRoleLabel(user?.role ?? "user")}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{user?.email}</span>
                </div>
                {user?.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{user.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Membro desde{" "}
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString("pt-BR", {
                          month: "long",
                          year: "numeric",
                        })
                      : "-"}
                  </span>
                </div>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link to="/configuracoes">
                  Editar Perfil
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Quick actions */}
          {filteredActions.length > 0 && (
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Acoes Rapidas</CardTitle>
                <CardDescription>Atalhos para tarefas comuns</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {filteredActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.href + action.label}
                      variant="outline"
                      className="justify-start h-auto py-3"
                      asChild
                    >
                      <Link to={action.href}>
                        <Icon className="mr-3 h-5 w-5 text-muted-foreground" />
                        <div className="text-left">
                          <div className="font-medium">{action.label}</div>
                          <div className="text-xs text-muted-foreground">{action.description}</div>
                        </div>
                      </Link>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Recent activity */}
          {isTeacher && (
            <Card className="md:col-span-1 lg:col-span-1">
              <CardHeader>
                <CardTitle>Atividade Recente</CardTitle>
                <CardDescription>Ultimas atualizacoes</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma atividade recente
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="rounded-full bg-muted p-2">
                          {activity.type === "course" && (
                            <BookOpen className="h-3 w-3 text-muted-foreground" />
                          )}
                          {activity.type === "module" && (
                            <Layers className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {activity.action} - {activity.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Progress section for students */}
        {!isTeacher && (
          <Card>
            <CardHeader>
              <CardTitle>Seu Progresso</CardTitle>
              <CardDescription>Continue de onde parou</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Farmacologia Basica</span>
                  <span className="text-sm text-muted-foreground">{stats.completionRate}%</span>
                </div>
                <Progress value={stats.completionRate} className="h-2" />
              </div>
              <Button variant="outline" className="w-full">
                Continuar Aprendendo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

export function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

export default DashboardPage;
