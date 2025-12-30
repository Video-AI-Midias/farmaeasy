/**
 * Dialog for granting access to a course.
 *
 * Features:
 * - Search users by email/name
 * - Grant permanent or temporary access
 * - Add optional notes
 * - Improved UX with loading states and feedback
 * - Integration with CreateStudentDialog for creating new students
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TruncatedText } from "@/components/ui/truncated-text";
import { UserCombobox } from "@/components/ui/user-combobox";
import { CreateStudentDialog } from "@/components/users";
import { acquisitionsAdminApi } from "@/lib/acquisitions-api";
import { useAuthStore } from "@/stores/auth";
import type { User } from "@/types/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const grantAccessSchema = z.object({
  user_id: z.string().min(1, "Selecione um usuario"),
  access_type: z.enum(["permanent", "temporary"]),
  expires_in_days: z.coerce
    .number()
    .min(1)
    .max(365)
    .nullable()
    .transform((v) => v ?? null),
  notes: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => v || null),
});

interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  onSuccess?: () => void;
}

export function GrantAccessDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  onSuccess,
}: GrantAccessDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createStudentOpen, setCreateStudentOpen] = useState(false);

  // Get current user to determine API to use
  const currentUser = useAuthStore((state) => state.user);
  const isTeacher = currentUser?.role === "teacher";
  const isAdmin = currentUser?.role === "admin";

  const form = useForm({
    resolver: zodResolver(grantAccessSchema),
    defaultValues: {
      user_id: "",
      access_type: "permanent" as const,
      expires_in_days: null as number | null,
      notes: null as string | null,
    },
  });

  const accessType = form.watch("access_type");

  const handleUserSelect = (user: User | null) => {
    setSelectedUser(user);
    if (user) {
      form.setValue("user_id", user.id);
      form.clearErrors("user_id");
    } else {
      form.setValue("user_id", "");
    }
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    if (!selectedUser) {
      toast.error("Selecione um usuario para conceder acesso");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Concedendo acesso...", {
      description: `Para ${selectedUser.name || selectedUser.email}`,
    });

    try {
      await acquisitionsAdminApi.grantAccess({
        user_id: data.user_id,
        course_id: courseId,
        expires_in_days: data.access_type === "temporary" ? data.expires_in_days : null,
        notes: data.notes,
      });

      toast.success("Acesso concedido com sucesso!", {
        id: toastId,
        description: `${selectedUser.name || selectedUser.email} agora tem acesso ao curso`,
        icon: <CheckCircle2 className="h-4 w-4" />,
        duration: 3000,
      });

      form.reset();
      setSelectedUser(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao conceder acesso";

      toast.error("Falha ao conceder acesso", {
        id: toastId,
        description: message,
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isSubmitting) {
      form.reset();
      setSelectedUser(null);
    }
    onOpenChange(newOpen);
  };

  // Handle student created successfully
  const handleStudentCreated = (user: User) => {
    setSelectedUser(user);
    form.setValue("user_id", user.id);
    form.clearErrors("user_id");
    setCreateStudentOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Conceder Acesso
          </DialogTitle>
          <DialogDescription>Conceder acesso ao curso &quot;{courseTitle}&quot;</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User search */}
            <FormField
              control={form.control}
              name="user_id"
              render={({ field, fieldState }) => (
                <FormItem>
                  <UserCombobox
                    value={field.value}
                    onValueChange={field.onChange}
                    onUserSelect={handleUserSelect}
                    label="Usuario"
                    placeholder="Buscar por email ou nome..."
                    required
                    error={fieldState.error?.message}
                    disabled={isSubmitting}
                    useTeacherApi={isTeacher && !isAdmin}
                    emptyStateAction={
                      (isTeacher || isAdmin) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCreateStudentOpen(true)}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Cadastrar novo aluno
                        </Button>
                      )
                    }
                  />
                </FormItem>
              )}
            />

            {/* Selected user preview */}
            {selectedUser && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <TruncatedText lines={1} className="text-sm font-medium">
                  {selectedUser.name || selectedUser.email}
                </TruncatedText>
                <TruncatedText lines={1} className="text-xs text-muted-foreground">
                  {selectedUser.email}
                </TruncatedText>
              </div>
            )}

            {/* Access type */}
            <FormField
              control={form.control}
              name="access_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Acesso</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col gap-2"
                      disabled={isSubmitting}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="permanent" id="permanent" disabled={isSubmitting} />
                        <Label htmlFor="permanent" className="font-normal">
                          Permanente
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="temporary" id="temporary" disabled={isSubmitting} />
                        <Label htmlFor="temporary" className="font-normal">
                          Temporario
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expiration days (only for temporary) */}
            {accessType === "temporary" && (
              <FormField
                control={form.control}
                name="expires_in_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expira em (dias)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value?.toString() ?? ""}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o prazo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="7">7 dias</SelectItem>
                        <SelectItem value="14">14 dias</SelectItem>
                        <SelectItem value="30">30 dias (1 mês)</SelectItem>
                        <SelectItem value="60">60 dias (2 meses)</SelectItem>
                        <SelectItem value="90">90 dias (3 meses)</SelectItem>
                        <SelectItem value="180">180 dias (6 meses)</SelectItem>
                        <SelectItem value="365">365 dias (1 ano)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Apos esse prazo o acesso sera automaticamente revogado
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Motivo da concessao, observacoes..."
                      className="min-h-[80px] resize-none"
                      {...field}
                      value={field.value || ""}
                      disabled={isSubmitting}
                      maxLength={500}
                    />
                  </FormControl>
                  <FormDescription>
                    Anotacoes internas sobre esta concessao de acesso (máx. 500 caracteres)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedUser}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Concedendo...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Conceder Acesso
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {/* Create Student Dialog */}
      <CreateStudentDialog
        open={createStudentOpen}
        onOpenChange={setCreateStudentOpen}
        onSuccess={handleStudentCreated}
        courseId={courseId}
      />
    </Dialog>
  );
}

export default GrantAccessDialog;
