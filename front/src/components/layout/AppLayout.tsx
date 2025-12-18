/**
 * Application layout component.
 *
 * Provides consistent header with navigation and user menu for protected pages.
 * Mobile menu with collapsible sections for better organization.
 */

import logoHorizontal from "@/assets/logo-horizontal.png";
import { WhatsAppBubble } from "@/components/WhatsAppBubble";
import { NotificationBell } from "@/components/notifications";
import { ThemeToggle } from "@/components/theme";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationWebSocket } from "@/hooks/useNotificationWebSocket";
import { cn } from "@/lib/utils";
import {
  Bell,
  BookOpen,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  Menu,
  PlayCircle,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MainNav } from "./MainNav";
import { UserMenu } from "./UserMenu";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isAdmin, isTeacher } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize WebSocket connection for real-time notifications
  useNotificationWebSocket();

  // Check if user can manage content (teacher or admin)
  const canManageContent = isTeacher || isAdmin;

  // Helper to check if path is active
  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(`${href}/`);

  // Close mobile menu on navigation
  const handleNavClick = () => setMobileMenuOpen(false);

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo + Nav */}
          <div className="flex items-center gap-6">
            {/* Mobile menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center">
                    <img src={logoHorizontal} alt="Farma Easy" className="h-8 w-auto" />
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1">
                  {/* Dashboard - always visible */}
                  <Link
                    to="/dashboard"
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive("/dashboard")
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>

                  {/* Meus Cursos - always visible */}
                  <Link
                    to="/student"
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive("/student")
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Home className="h-4 w-4" />
                    Meus Cursos
                  </Link>

                  {/* Content Management - Teacher/Admin */}
                  {canManageContent && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="content" className="border-none">
                        <AccordionTrigger
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:no-underline",
                            "hover:bg-accent hover:text-accent-foreground",
                            isActive("/courses") || isActive("/modules") || isActive("/lessons")
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span className="flex-1 text-left">Gerenciar Conteudo</span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-1">
                          <div className="ml-4 flex flex-col gap-1 border-l pl-4">
                            <Link
                              to="/courses"
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive("/courses")
                                  ? "bg-accent/50 text-accent-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <GraduationCap className="h-4 w-4" />
                              Cursos
                            </Link>
                            <Link
                              to="/modules"
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive("/modules")
                                  ? "bg-accent/50 text-accent-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <Layers className="h-4 w-4" />
                              Modulos
                            </Link>
                            <Link
                              to="/lessons"
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive("/lessons")
                                  ? "bg-accent/50 text-accent-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <PlayCircle className="h-4 w-4" />
                              Aulas
                            </Link>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Admin Section */}
                  {isAdmin && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="admin" className="border-none">
                        <AccordionTrigger
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:no-underline",
                            "hover:bg-accent hover:text-accent-foreground",
                            isActive("/users") || isActive("/admin")
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <Shield className="h-4 w-4" />
                          <span className="flex-1 text-left">Administracao</span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-1">
                          <div className="ml-4 flex flex-col gap-1 border-l pl-4">
                            <Link
                              to="/users"
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive("/users")
                                  ? "bg-accent/50 text-accent-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <Users className="h-4 w-4" />
                              Usuarios
                            </Link>
                            <Link
                              to="/admin/notifications"
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive("/admin/notifications")
                                  ? "bg-accent/50 text-accent-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <Bell className="h-4 w-4" />
                              Notificacoes
                            </Link>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Settings - always visible */}
                  <Link
                    to="/settings"
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive("/settings")
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    Configuracoes
                  </Link>

                  {/* Theme toggle - mobile only */}
                  <Separator className="my-2" />
                  <div className="px-3">
                    <span className="mb-2 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Aparencia
                    </span>
                    <ThemeToggle showLabel className="w-full justify-start" />
                  </div>
                </nav>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center">
              <img src={logoHorizontal} alt="Farma Easy" className="h-8 w-auto sm:h-10" />
            </Link>

            {/* Desktop navigation */}
            <div className="hidden md:flex">
              <MainNav />
            </div>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle className="hidden sm:flex" />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>

      {/* WhatsApp floating button */}
      <WhatsAppBubble />
    </div>
  );
}

export default AppLayout;
