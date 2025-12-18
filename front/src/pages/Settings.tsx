/**
 * User Settings page.
 *
 * Features:
 * - Profile editing (name, phone, avatar URL)
 * - Password change
 * - Session management (logout from all devices)
 * - Account information display
 */

import { EmailChangeDialog } from "@/components/auth/EmailChangeDialog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThumbnailUpload } from "@/components/ui/thumbnail-upload";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { UpdateProfileRequest } from "@/types/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calendar,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Phone,
  Save,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

function getInitials(name: string | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  teacher: "Professor",
  student: "Aluno",
  user: "Usuario",
};

// Profile form schema
const profileSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter no minimo 2 caracteres")
    .max(100, "Nome muito longo")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .refine(
      (val) => !val || /^\d{10,11}$/.test(val.replace(/\D/g, "")),
      "Telefone invalido (deve ter 10 ou 11 digitos)",
    )
    .optional()
    .or(z.literal("")),
  avatar_url: z
    .string()
    .max(500, "URL muito longa")
    .refine((val) => !val || val.startsWith("http"), "URL deve comecar com http:// ou https://")
    .optional()
    .or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// Password form schema
const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Senha atual obrigatoria"),
    new_password: z
      .string()
      .min(8, "Nova senha deve ter no minimo 8 caracteres")
      .refine((val) => /[A-Z]/.test(val), "Deve conter letra maiuscula")
      .refine((val) => /[a-z]/.test(val), "Deve conter letra minuscula")
      .refine((val) => /\d/.test(val), "Deve conter numero")
      .refine((val) => /[!@#$%^&*(),.?":{}|<>]/.test(val), "Deve conter caractere especial"),
    confirm_password: z.string().min(1, "Confirmacao obrigatoria"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "As senhas nao coincidem",
    path: ["confirm_password"],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

function SettingsContent() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const changePassword = useAuthStore((state) => state.changePassword);

  // Profile form state
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password form state
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Logout all state
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  // Email change dialog state
  const [isEmailChangeDialogOpen, setIsEmailChangeDialogOpen] = useState(false);

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      avatar_url: user?.avatar_url ?? "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  // Handle profile update
  const handleProfileSubmit = useCallback(
    async (data: ProfileFormData) => {
      setIsSavingProfile(true);
      try {
        // Build request only with non-empty values to avoid exactOptionalPropertyTypes issues
        const request: UpdateProfileRequest = {};
        if (data.name) request.name = data.name;
        if (data.phone) request.phone = data.phone;
        if (data.avatar_url) request.avatar_url = data.avatar_url;

        await updateProfile(request);
        toast.success("Perfil atualizado com sucesso!");
      } catch (err) {
        console.error("Error updating profile:", err);
        toast.error("Erro ao atualizar perfil. Tente novamente.");
      } finally {
        setIsSavingProfile(false);
      }
    },
    [updateProfile],
  );

  // Handle password change
  const handlePasswordSubmit = useCallback(
    async (data: PasswordFormData) => {
      setIsSavingPassword(true);
      try {
        await changePassword({
          current_password: data.current_password,
          new_password: data.new_password,
        });
        toast.success("Senha alterada com sucesso!");
        passwordForm.reset();
      } catch (err) {
        console.error("Error changing password:", err);
        // Check if it's invalid current password
        interface ApiError {
          response?: { status?: number };
        }
        const apiErr = err as ApiError;
        if (apiErr?.response?.status === 401) {
          passwordForm.setError("current_password", {
            type: "server",
            message: "Senha atual incorreta",
          });
        } else {
          toast.error("Erro ao alterar senha. Tente novamente.");
        }
      } finally {
        setIsSavingPassword(false);
      }
    },
    [changePassword, passwordForm],
  );

  // Handle logout from all devices
  const handleLogoutAll = useCallback(async () => {
    setIsLoggingOutAll(true);
    try {
      await api.post("/auth/me/logout-all");
      toast.success("Voce foi desconectado de todos os dispositivos.");
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      console.error("Error logging out all devices:", err);
      toast.error("Erro ao sair de todos os dispositivos.");
      setIsLoggingOutAll(false);
    }
  }, []);

  if (!user) return null;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Configuracoes
          </h1>
          <p className="text-muted-foreground">Gerencie seu perfil e configuracoes de conta</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Seguranca
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <KeyRound className="h-4 w-4" />
              Conta
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Informacoes do Perfil</CardTitle>
                <CardDescription>
                  Atualize suas informacoes pessoais. Estas informacoes serao visiveis para outros
                  usuarios.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...profileForm}>
                  <form
                    onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
                    className="space-y-6"
                  >
                    {/* Avatar Preview */}
                    <div className="flex items-center gap-4">
                      <Avatar className="h-20 w-20">
                        <AvatarImage
                          src={profileForm.watch("avatar_url") || user.avatar_url}
                          alt={user.name}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl">
                          {getInitials(profileForm.watch("name") || user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {profileForm.watch("name") || user.name || "Sem nome"}
                        </p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Name Field */}
                    <FormField
                      control={profileForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo</FormLabel>
                          <FormControl>
                            <Input placeholder="Seu nome completo" {...field} />
                          </FormControl>
                          <FormDescription>
                            Este nome sera exibido em seu perfil e comentarios.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Phone Field */}
                    <FormField
                      control={profileForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone</FormLabel>
                          <FormControl>
                            <Input placeholder="(99) 99999-9999" {...field} />
                          </FormControl>
                          <FormDescription>
                            Numero de telefone para contato. Apenas numeros (10 ou 11 digitos).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Avatar Upload Field */}
                    <FormField
                      control={profileForm.control}
                      name="avatar_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Foto de Perfil</FormLabel>
                          <FormControl>
                            <ThumbnailUpload
                              value={field.value}
                              onChange={field.onChange}
                              entityType="user"
                              entityId={user.id}
                              disabled={isSavingProfile}
                            />
                          </FormControl>
                          <FormDescription>
                            Faca upload de uma imagem ou cole uma URL externa.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Submit Button */}
                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSavingProfile}>
                        {isSavingProfile ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Salvar Alteracoes
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            {/* Password Change Card */}
            <Card>
              <CardHeader>
                <CardTitle>Alterar Senha</CardTitle>
                <CardDescription>
                  Mantenha sua conta segura alterando sua senha periodicamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...passwordForm}>
                  <form
                    onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
                    className="space-y-4"
                  >
                    {/* Current Password */}
                    <FormField
                      control={passwordForm.control}
                      name="current_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Senha Atual</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showCurrentPassword ? "text" : "password"}
                                placeholder="Digite sua senha atual"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              >
                                {showCurrentPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* New Password */}
                    <FormField
                      control={passwordForm.control}
                      name="new_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nova Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showNewPassword ? "text" : "password"}
                                placeholder="Digite a nova senha"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                              >
                                {showNewPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Min. 8 caracteres, com maiuscula, minuscula, numero e caractere
                            especial.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Confirm Password */}
                    <FormField
                      control={passwordForm.control}
                      name="confirm_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirmar Nova Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirme a nova senha"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              >
                                {showConfirmPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Submit Button */}
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={isSavingPassword}>
                        {isSavingPassword ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Alterando...
                          </>
                        ) : (
                          <>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Alterar Senha
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Session Management Card */}
            <Card>
              <CardHeader>
                <CardTitle>Gerenciamento de Sessoes</CardTitle>
                <CardDescription>Gerencie os dispositivos conectados a sua conta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Sessoes Ativas</p>
                    <p className="text-xs text-muted-foreground">
                      Limite de sessoes simultaneas: {user.max_concurrent_sessions ?? 10}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Sair de todos os dispositivos</p>
                    <p className="text-xs text-muted-foreground">
                      Encerra todas as sessoes ativas, exceto a atual.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isLoggingOutAll}>
                        {isLoggingOutAll ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair de Todos
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sair de todos os dispositivos?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acao encerra todas as suas sessoes ativas em todos os dispositivos,
                          incluindo esta sessao atual. Voce precisara fazer login novamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleLogoutAll}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Sair de Todos
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Informacoes da Conta</CardTitle>
                <CardDescription>
                  Detalhes da sua conta. Algumas informacoes nao podem ser alteradas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Email */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{user.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEmailChangeDialogOpen(true)}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Edit3 className="h-4 w-4" />
                    Alterar
                  </Button>
                </div>

                {/* Phone */}
                {user.phone && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{user.phone}</p>
                    </div>
                  </div>
                )}

                {/* Role */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Perfil de Acesso</p>
                    <p className="font-medium">{roleLabels[user.role] || user.role}</p>
                  </div>
                </div>

                {/* Member Since */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Membro desde</p>
                    <p className="font-medium">
                      {new Date(user.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                {/* CPF (if present) */}
                {user.cpf && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">CPF</p>
                      <p className="font-medium">{user.cpf}</p>
                    </div>
                  </div>
                )}

                {/* RG (if present) */}
                {user.rg && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">RG</p>
                      <p className="font-medium">{user.rg}</p>
                    </div>
                  </div>
                )}

                {/* Address (if present) */}
                {user.address && (user.address.city || user.address.state) && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Endereco</p>
                      <p className="font-medium">
                        {[
                          user.address.street,
                          user.address.number,
                          user.address.complement,
                          user.address.neighborhood,
                          user.address.city,
                          user.address.state,
                          user.address.zip_code,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                <p className="text-xs text-muted-foreground">
                  Algumas informacoes como CPF e RG so podem ser alteradas entrando em contato com o
                  suporte.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Email Change Dialog */}
        <EmailChangeDialog
          open={isEmailChangeDialogOpen}
          onOpenChange={setIsEmailChangeDialogOpen}
          currentEmail={user.email}
        />
      </div>
    </AppLayout>
  );
}

export function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

export default SettingsPage;
