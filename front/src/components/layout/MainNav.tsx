/**
 * Main navigation component.
 *
 * Horizontal navigation bar with links to main sections.
 * Uses dropdowns for grouped items (Conteudo, Admin).
 */

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Bell,
  BookOpen,
  ChevronDown,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  PlayCircle,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function MainNav() {
  const location = useLocation();
  const { isAdmin, isTeacher } = useAuth();

  const isContentActive =
    location.pathname.startsWith("/cursos") ||
    location.pathname.startsWith("/modulos") ||
    location.pathname.startsWith("/aulas");

  const isAdminActive =
    location.pathname.startsWith("/usuarios") || location.pathname.startsWith("/admin");

  const isStudentActive = location.pathname.startsWith("/aluno");

  // Check if user can manage content (teacher or admin)
  const canManageContent = isTeacher || isAdmin;

  return (
    <nav className="flex items-center gap-1">
      {/* Painel - Teacher/Admin only */}
      {canManageContent && (
        <Link
          to="/painel"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            location.pathname === "/painel"
              ? "bg-accent text-accent-foreground"
              : "text-foreground/80 hover:text-foreground",
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden lg:inline">Painel</span>
        </Link>
      )}

      {/* Conteudo dropdown - Teacher/Admin only */}
      {canManageContent && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "flex items-center gap-1 px-3 py-2 text-sm font-medium",
                isContentActive
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              )}
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden lg:inline">Conteudo</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Gerenciar Conteudo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/cursos" className="group cursor-pointer">
                <GraduationCap className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Cursos
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/modulos" className="group cursor-pointer">
                <Layers className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Modulos
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/aulas" className="group cursor-pointer">
                <PlayCircle className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Aulas
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Area do Aluno - visible for all authenticated users */}
      <Link
        to="/aluno"
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          isStudentActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:text-foreground",
        )}
      >
        <Home className="h-4 w-4" />
        <span className="hidden lg:inline">Meus Cursos</span>
      </Link>

      {/* Admin dropdown - Admin only */}
      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "flex items-center gap-1 px-3 py-2 text-sm font-medium",
                isAdminActive
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              )}
            >
              <Shield className="h-4 w-4" />
              <span className="hidden lg:inline">Admin</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Administracao</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/usuarios" className="group cursor-pointer">
                <Users className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Usuarios
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/notificacoes" className="group cursor-pointer">
                <Bell className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Notificacoes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/configuracoes" className="group cursor-pointer">
                <Settings className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                Configuracoes
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

export default MainNav;
