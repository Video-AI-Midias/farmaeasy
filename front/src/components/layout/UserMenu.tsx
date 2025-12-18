/**
 * User menu dropdown component.
 *
 * Displays user avatar and dropdown with role-specific options:
 * - Admin: Users, Notifications, Settings
 * - Teacher: Content management links
 * - Student: My courses, Progress
 * - All: Profile, Logout
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/types/auth";
import {
  Bell,
  ChevronDown,
  GraduationCap,
  Home,
  Layers,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  User as UserIcon,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

interface UserMenuProps {
  user: User;
}

function getInitials(name: string | undefined): string {
  if (!name) return "??";
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
    user: "Usuario",
  };
  return labels[role] ?? role;
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  if (role === "teacher") return "secondary";
  return "outline";
}

export function UserMenu({ user }: UserMenuProps) {
  const { logout, isLoading, isAdmin, isTeacher } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar_url} alt={user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start text-left md:flex">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        {/* User info header */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                {getRoleLabel(user.role)}
              </Badge>
            </div>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Common links for all users */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings" className="group cursor-pointer">
              <UserIcon className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
              Meu Perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/student" className="group cursor-pointer">
              <Home className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
              Meus Cursos
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Content management - Teacher/Admin only */}
        {(isTeacher || isAdmin) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Gerenciar Conteudo
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/courses" className="group cursor-pointer">
                  <GraduationCap className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                  Cursos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/modules" className="group cursor-pointer">
                  <Layers className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                  Modulos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/lessons" className="group cursor-pointer">
                  <PlayCircle className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                  Aulas
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        {/* Admin section - Admin only */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Administracao
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/users" className="group cursor-pointer">
                  <Users className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                  Usuarios
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin/notifications" className="group cursor-pointer">
                  <Bell className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
                  Enviar Notificacoes
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        {/* Settings and logout */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings" className="group cursor-pointer">
              <Settings className="mr-2 h-4 w-4 text-foreground transition-colors group-hover:text-accent-foreground" />
              Configuracoes
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoading}
          className="group cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4 text-destructive transition-colors group-hover:text-destructive-foreground" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenu;
