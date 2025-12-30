/**
 * Dialog for teachers to create new student accounts.
 *
 * Features:
 * - Create student with email and password
 * - Optional name, phone, CPF fields
 * - Option to send welcome email with credentials
 * - Password generator
 * - Integrates with teacher API endpoint
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { usersApi } from "@/lib/users-api";
import type { User } from "@/types/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Key, Loader2, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createStudentSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  name: z
    .string()
    .max(100)
    .nullable()
    .transform((v) => v || null),
  phone: z
    .string()
    .max(20)
    .nullable()
    .transform((v) => v || null),
  cpf: z
    .string()
    .max(14)
    .nullable()
    .transform((v) => v || null),
  send_welcome_email: z.boolean(),
});

type CreateStudentFormData = z.infer<typeof createStudentSchema>;

interface CreateStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Callback when student is created successfully.
   * Receives the created user.
   */
  onSuccess?: (user: User) => void;
  /**
   * Course ID to auto-grant access after creation.
   */
  courseId?: string;
  /**
   * Pre-fill the email field (e.g., from search term).
   */
  initialEmail?: string;
}

/**
 * Generate a random secure password.
 */
function generatePassword(): string {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  let password = "";

  // Ensure at least one of each type
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]; // uppercase
  password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]; // lowercase
  password += "0123456789"[Math.floor(Math.random() * 10)]; // number
  password += "!@#$%&*"[Math.floor(Math.random() * 7)]; // special

  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

export function CreateStudentDialog({
  open,
  onOpenChange,
  onSuccess,
  courseId,
  initialEmail = "",
}: CreateStudentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateStudentFormData>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      email: initialEmail,
      password: "",
      name: null,
      phone: null,
      cpf: null,
      send_welcome_email: true,
    },
  });

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    form.setValue("password", newPassword);
    form.clearErrors("password");
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Criando aluno...", {
      description: data.email,
    });

    try {
      const result = await usersApi.createStudent({
        email: data.email,
        password: data.password,
        name: data.name ?? undefined,
        phone: data.phone ?? undefined,
        cpf: data.cpf ?? undefined,
        send_welcome_email: data.send_welcome_email,
        course_id: courseId,
      });

      const successMessage = "Aluno criado com sucesso!";
      const details: string[] = [];

      if (result.welcome_email_sent) {
        details.push("Email de boas-vindas enviado");
      }
      if (result.course_access_granted) {
        details.push("Acesso ao curso concedido");
      }

      toast.success(successMessage, {
        id: toastId,
        description: details.length > 0 ? details.join(" • ") : undefined,
        icon: <CheckCircle2 className="h-4 w-4" />,
        duration: 4000,
      });

      form.reset();
      onOpenChange(false);
      onSuccess?.(result.user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao criar aluno";

      // Check for specific errors
      let errorTitle = "Falha ao criar aluno";
      if (message.includes("email") || message.includes("Email")) {
        errorTitle = "Email já cadastrado";
      } else if (message.includes("cpf") || message.includes("CPF")) {
        errorTitle = "CPF já cadastrado";
      }

      toast.error(errorTitle, {
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
      form.reset({
        email: "",
        password: "",
        name: null,
        phone: null,
        cpf: null,
        send_welcome_email: true,
      });
    }
    onOpenChange(newOpen);
  };

  // Update email when dialog opens with initialEmail
  if (open && initialEmail && form.getValues("email") !== initialEmail) {
    form.setValue("email", initialEmail);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Cadastrar Novo Aluno
          </DialogTitle>
          <DialogDescription>
            Crie uma conta de aluno. As credenciais podem ser enviadas por email.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (required) */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Email <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="aluno@email.com"
                        className="pl-9"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password (required) */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Senha <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Senha temporária"
                          className="pl-9"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleGeneratePassword}
                        disabled={isSubmitting}
                        title="Gerar senha aleatória"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>Mínimo 8 caracteres. O aluno poderá alterar.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name (optional) */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nome completo"
                      {...field}
                      value={field.value || ""}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone (optional) */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="(11) 99999-9999"
                      {...field}
                      value={field.value || ""}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Send welcome email checkbox */}
            <FormField
              control={form.control}
              name="send_welcome_email"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">Enviar email de boas-vindas</FormLabel>
                    <FormDescription>
                      O aluno receberá um email com as credenciais de acesso
                    </FormDescription>
                  </div>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Criar Aluno
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateStudentDialog;
