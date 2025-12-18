/**
 * Users management page (admin only).
 *
 * Displays user list with filtering and role management.
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { UserDetailsDialog } from "@/components/users/UserDetailsDialog";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { User, UserRole } from "@/types/auth";
import {
  AlertCircle,
  Eye,
  Loader2,
  Monitor,
  Search,
  Shield,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function getInitials(name: string | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const roleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  teacher: "Professor",
  student: "Aluno",
  user: "Aluno", // Unificado com student - ambos são alunos
};

const roleColors: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  teacher: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  student: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  user: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const roleIcons: Record<UserRole, React.ElementType> = {
  admin: Shield,
  teacher: UserCog,
  student: UserCheck,
  user: Users,
};

function UsersContent() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Role edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<UserRole | "">("");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Deactivate dialog state
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Create user dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Details dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [userForDetails, setUserForDetails] = useState<User | null>(null);

  // Current logged-in user (to prevent self-edit/deactivate)
  const currentUser = useAuthStore((state) => state.user);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: { search?: string; role?: UserRole; limit?: number } = { limit: 100 };
      if (search) filters.search = search;
      if (roleFilter !== "all") filters.role = roleFilter;
      const response = await authApi.listUsers(filters);
      setUsers(response.items);
    } catch (err) {
      setError("Erro ao carregar usuarios. Tente novamente.");
      console.error("Error fetching users:", err);
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Users are already filtered by API, use directly
  const filteredUsers = users;

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    teachers: users.filter((u) => u.role === "teacher").length,
    students: users.filter((u) => u.role === "student").length,
    active: users.filter((u) => u.is_active).length,
  };

  // Open edit dialog
  const handleEditClick = useCallback((user: User) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setUpdateError(null);
    setEditDialogOpen(true);
  }, []);

  // Close edit dialog
  const handleCloseDialog = useCallback(() => {
    setEditDialogOpen(false);
    setSelectedUser(null);
    setNewRole("");
    setUpdateError(null);
  }, []);

  // Update user role
  const handleRoleUpdate = useCallback(async () => {
    if (!selectedUser || !newRole || newRole === selectedUser.role) return;

    setIsUpdatingRole(true);
    setUpdateError(null);

    try {
      await authApi.updateUserRole(selectedUser.id, newRole);
      await fetchUsers();
      handleCloseDialog();
    } catch (err) {
      console.error("Error updating user role:", err);
      setUpdateError("Erro ao atualizar perfil. Tente novamente.");
    } finally {
      setIsUpdatingRole(false);
    }
  }, [selectedUser, newRole, fetchUsers, handleCloseDialog]);

  // Open deactivate dialog
  const handleDeactivateClick = useCallback((user: User) => {
    setUserToDeactivate(user);
    setDeactivateDialogOpen(true);
  }, []);

  // Close deactivate dialog
  const handleCloseDeactivateDialog = useCallback(() => {
    setDeactivateDialogOpen(false);
    setUserToDeactivate(null);
  }, []);

  // Confirm deactivation
  const handleDeactivateConfirm = useCallback(async () => {
    if (!userToDeactivate) return;

    setIsDeactivating(true);

    try {
      await authApi.deactivateUser(userToDeactivate.id);
      await fetchUsers();
      handleCloseDeactivateDialog();
    } catch (err) {
      console.error("Error deactivating user:", err);
      setError("Erro ao desativar usuario. Tente novamente.");
      handleCloseDeactivateDialog();
    } finally {
      setIsDeactivating(false);
    }
  }, [userToDeactivate, fetchUsers, handleCloseDeactivateDialog]);

  // Open details dialog
  const handleViewDetails = useCallback((user: User) => {
    setUserForDetails(user);
    setDetailsDialogOpen(true);
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Usuarios
            </h1>
            <p className="text-muted-foreground">Gerencie os usuarios da plataforma</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo Usuario
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">{stats.active} ativos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.admins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Professores</CardTitle>
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.teachers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alunos</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.students}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as UserRole | "all")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os perfis</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="teacher">Professor</SelectItem>
                  <SelectItem value="student">Aluno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuarios</CardTitle>
            <CardDescription>
              {filteredUsers.length}{" "}
              {filteredUsers.length === 1 ? "usuario encontrado" : "usuarios encontrados"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium">Erro ao carregar</h3>
                <p className="text-muted-foreground mt-1">{error}</p>
                <Button variant="outline" className="mt-4" onClick={fetchUsers}>
                  Tentar novamente
                </Button>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Nenhum usuario encontrado</h3>
                <p className="text-muted-foreground mt-1">Tente ajustar os filtros de busca</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sessoes</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const RoleIcon = roleIcons[user.role];
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={user.avatar_url} alt={user.name} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {getInitials(user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs gap-1", roleColors[user.role])}
                          >
                            <RoleIcon className="h-3 w-3" />
                            {roleLabels[user.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "secondary"}>
                            {user.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-sm cursor-pointer hover:text-primary bg-transparent border-none p-0"
                            onClick={() => handleViewDetails(user)}
                            title="Ver detalhes"
                          >
                            <Monitor className="h-3.5 w-3.5" />
                            {user.max_concurrent_sessions ?? 10}
                          </button>
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Hide actions for admin users (protected) */}
                          {user.role === "admin" ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(user)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <span className="text-xs text-muted-foreground">Protegido</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(user)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(user)}
                                disabled={user.id === currentUser?.id}
                                title={
                                  user.id === currentUser?.id
                                    ? "Nao e possivel editar seu proprio perfil"
                                    : "Editar perfil"
                                }
                              >
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivateClick(user)}
                                disabled={user.id === currentUser?.id || !user.is_active}
                                title={
                                  user.id === currentUser?.id
                                    ? "Nao e possivel desativar sua propria conta"
                                    : !user.is_active
                                      ? "Usuario ja esta inativo"
                                      : "Desativar usuario"
                                }
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Role Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Perfil do Usuario</DialogTitle>
              <DialogDescription>
                Altere o perfil de acesso do usuario na plataforma.
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-4 py-4">
                {/* User Info */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedUser.avatar_url} alt={selectedUser.name} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>

                {/* Role Select */}
                <div className="space-y-2">
                  <Label htmlFor="role">Perfil de Acesso</Label>
                  <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Professor</SelectItem>
                      <SelectItem value="student">Aluno</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Professor: pode criar e gerenciar cursos. Aluno: pode assistir cursos.
                  </p>
                </div>

                {/* Error Alert */}
                {updateError && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {updateError}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog} disabled={isUpdatingRole}>
                Cancelar
              </Button>
              <Button
                onClick={handleRoleUpdate}
                disabled={isUpdatingRole || !newRole || newRole === selectedUser?.role}
              >
                {isUpdatingRole ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivate User Confirmation Dialog */}
        <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desativar Usuario</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja desativar a conta de{" "}
                <span className="font-semibold">{userToDeactivate?.name}</span>?
                <br />
                <span className="text-muted-foreground text-xs mt-1 block">
                  O usuario nao podera mais acessar a plataforma ate ser reativado.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {userToDeactivate && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={userToDeactivate.avatar_url} alt={userToDeactivate.name} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(userToDeactivate.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{userToDeactivate.name}</p>
                  <p className="text-sm text-muted-foreground">{userToDeactivate.email}</p>
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCloseDeactivateDialog} disabled={isDeactivating}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeactivateConfirm}
                disabled={isDeactivating}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeactivating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Desativando...
                  </>
                ) : (
                  "Desativar"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create User Dialog */}
        <CreateUserDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={fetchUsers}
        />

        {/* User Details Dialog */}
        <UserDetailsDialog
          user={userForDetails}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          onUserUpdated={fetchUsers}
        />
      </div>
    </AppLayout>
  );
}

export function UsersPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <UsersContent />
    </ProtectedRoute>
  );
}

export default UsersPage;
