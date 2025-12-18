/**
 * Dialog for creating new users (admin only).
 *
 * Features:
 * - Required fields: email, password
 * - Optional fields: name, phone, cpf, rg, avatar_url, address, role
 * - Form validation with Zod
 * - Brazilian address format support
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThumbnailUpload } from "@/components/ui/thumbnail-upload";
import { authApi } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// Brazilian states list
const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

// Password strength validation matching backend requirements
const passwordSchema = z
  .string()
  .min(8, "Senha deve ter no minimo 8 caracteres")
  .refine((val) => /[A-Z]/.test(val), "Senha deve conter pelo menos uma letra maiuscula")
  .refine((val) => /[a-z]/.test(val), "Senha deve conter pelo menos uma letra minuscula")
  .refine((val) => /\d/.test(val), "Senha deve conter pelo menos um numero")
  .refine(
    (val) => /[!@#$%^&*(),.?":{}|<>]/.test(val),
    "Senha deve conter pelo menos um caractere especial (!@#$%^&*)",
  );

// Form validation schema
const createUserSchema = z.object({
  email: z.string().email("Email invalido"),
  password: passwordSchema,
  role: z.enum(["user", "student", "teacher"]),
  name: z.string(),
  phone: z
    .string()
    .refine(
      (val) => !val || /^\d{10,11}$/.test(val.replace(/\D/g, "")),
      "Telefone invalido (deve ter 10 ou 11 digitos)",
    ),
  cpf: z
    .string()
    .refine(
      (val) => !val || /^\d{11}$/.test(val.replace(/\D/g, "")),
      "CPF invalido (deve ter 11 digitos)",
    ),
  rg: z.string().max(20, "RG muito longo"),
  avatar_url: z.string(),
  address_street: z.string().max(200, "Rua muito longa"),
  address_number: z.string().max(20, "Numero muito longo"),
  address_complement: z.string().max(100, "Complemento muito longo"),
  address_neighborhood: z.string().max(100, "Bairro muito longo"),
  address_city: z.string().max(100, "Cidade muito longa"),
  address_state: z.string(),
  address_zip_code: z
    .string()
    .refine(
      (val) => !val || /^\d{8}$/.test(val.replace(/\D/g, "")),
      "CEP invalido (deve ter 8 digitos)",
    ),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Debounce delay in ms
const VALIDATION_DEBOUNCE_MS = 500;

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time validation states
  const [emailValidation, setEmailValidation] = useState<{
    checking: boolean;
    available: boolean | null;
  }>({ checking: false, available: null });
  const [cpfValidation, setCpfValidation] = useState<{
    checking: boolean;
    available: boolean | null;
    formatted: string | null;
  }>({ checking: false, available: null, formatted: null });

  // Refs for debounce timeouts
  const emailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cpfTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      password: "",
      role: "user",
      name: "",
      phone: "",
      cpf: "",
      rg: "",
      avatar_url: "",
      address_street: "",
      address_number: "",
      address_complement: "",
      address_neighborhood: "",
      address_city: "",
      address_state: "",
      address_zip_code: "",
    },
  });

  // Cleanup timeouts on unmount or close
  useEffect(() => {
    return () => {
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
      if (cpfTimeoutRef.current) clearTimeout(cpfTimeoutRef.current);
    };
  }, []);

  const handleClose = () => {
    form.reset();
    setError(null);
    setEmailValidation({ checking: false, available: null });
    setCpfValidation({ checking: false, available: null, formatted: null });
    onOpenChange(false);
  };

  // Debounced email validation
  const validateEmailAvailability = useCallback(
    (email: string) => {
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);

      // Reset if empty or invalid format
      if (!email || !z.string().email().safeParse(email).success) {
        setEmailValidation({ checking: false, available: null });
        return;
      }

      setEmailValidation({ checking: true, available: null });

      emailTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await authApi.validateEmail(email);
          setEmailValidation({ checking: false, available: result.available });
          if (!result.available) {
            form.setError("email", { type: "server", message: "Email ja cadastrado" });
          } else {
            form.clearErrors("email");
          }
        } catch {
          setEmailValidation({ checking: false, available: null });
        }
      }, VALIDATION_DEBOUNCE_MS);
    },
    [form],
  );

  // Debounced CPF validation
  const validateCpfAvailability = useCallback(
    (cpf: string) => {
      if (cpfTimeoutRef.current) clearTimeout(cpfTimeoutRef.current);

      // Remove non-digits
      const digits = cpf.replace(/\D/g, "");

      // Reset if empty or wrong length
      if (!digits || digits.length !== 11) {
        setCpfValidation({ checking: false, available: null, formatted: null });
        return;
      }

      setCpfValidation({ checking: true, available: null, formatted: null });

      cpfTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await authApi.validateCPF(cpf);
          setCpfValidation({
            checking: false,
            available: result.valid ? (result.available ?? null) : false,
            formatted: result.formatted ?? null,
          });
          if (result.valid && !result.available) {
            form.setError("cpf", { type: "server", message: "CPF ja cadastrado" });
          } else if (!result.valid) {
            form.setError("cpf", { type: "server", message: "CPF invalido" });
          } else {
            form.clearErrors("cpf");
          }
        } catch {
          setCpfValidation({ checking: false, available: null, formatted: null });
        }
      }, VALIDATION_DEBOUNCE_MS);
    },
    [form],
  );

  // Helper to convert empty string to undefined
  const emptyToUndefined = (val: string): string | undefined => (val.trim() ? val : undefined);

  const onSubmit = async (data: CreateUserFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Build address object if any address field is filled
      const hasAddress =
        data.address_street ||
        data.address_number ||
        data.address_complement ||
        data.address_neighborhood ||
        data.address_city ||
        data.address_state ||
        data.address_zip_code;

      // Build address only with non-empty fields
      const addressData: Record<string, string> = {};
      if (data.address_street.trim()) addressData.street = data.address_street;
      if (data.address_number.trim()) addressData.number = data.address_number;
      if (data.address_complement.trim()) addressData.complement = data.address_complement;
      if (data.address_neighborhood.trim()) addressData.neighborhood = data.address_neighborhood;
      if (data.address_city.trim()) addressData.city = data.address_city;
      if (data.address_state.trim()) addressData.state = data.address_state;
      if (data.address_zip_code.trim()) addressData.zip_code = data.address_zip_code;

      await authApi.createUser({
        email: data.email,
        password: data.password,
        role: data.role,
        name: emptyToUndefined(data.name),
        phone: emptyToUndefined(data.phone),
        cpf: emptyToUndefined(data.cpf),
        rg: emptyToUndefined(data.rg),
        avatar_url: emptyToUndefined(data.avatar_url),
        address: hasAddress ? addressData : undefined,
      });

      toast.success("Usuario criado com sucesso!", {
        description: `${data.name || data.email} foi cadastrado na plataforma.`,
      });
      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      console.error("Error creating user:", err);

      // Type guard for axios-like error
      interface ApiErrorResponse {
        response?: {
          status?: number;
          data?: {
            detail?: string | { message?: string; field?: string };
          };
        };
      }
      const apiErr = err as ApiErrorResponse;
      const status = apiErr?.response?.status;
      const detail = apiErr?.response?.data?.detail;

      if (status === 409) {
        // Handle structured error with field info
        if (typeof detail === "object" && detail !== null) {
          const field = detail.field;
          const message = detail.message ?? "Ja cadastrado no sistema";
          if (field === "email") {
            form.setError("email", { type: "server", message });
            setError(null);
          } else if (field === "cpf") {
            form.setError("cpf", { type: "server", message });
            setError(null);
          } else {
            setError(message);
          }
        } else {
          setError(typeof detail === "string" ? detail : "Email ou CPF ja cadastrado no sistema.");
        }
      } else if (status === 422) {
        setError("Dados invalidos. Verifique os campos preenchidos.");
      } else {
        setError("Erro ao criar usuario. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Cadastrar Usuario
          </DialogTitle>
          <DialogDescription>Preencha os dados do novo usuario da plataforma.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Required Fields Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Dados de Acesso *</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="email"
                            placeholder="email@exemplo.com"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              validateEmailAvailability(e.target.value);
                            }}
                          />
                          {emailValidation.checking && (
                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {!emailValidation.checking && emailValidation.available === true && (
                            <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                          )}
                          {!emailValidation.checking && emailValidation.available === false && (
                            <AlertCircle className="absolute right-3 top-2.5 h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Senha segura" {...field} />
                      </FormControl>
                      <FormDescription>
                        Min. 8 caracteres, maiuscula, minuscula, numero e especial (!@#$...)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil de Acesso</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o perfil" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="user">Usuario</SelectItem>
                        <SelectItem value="student">Aluno</SelectItem>
                        <SelectItem value="teacher">Professor</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Professor pode criar cursos. Aluno pode acessar cursos.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Personal Info Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Dados Pessoais</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do usuario" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(99) 99999-9999" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="000.000.000-00"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              validateCpfAvailability(e.target.value);
                            }}
                          />
                          {cpfValidation.checking && (
                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {!cpfValidation.checking && cpfValidation.available === true && (
                            <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                          )}
                          {!cpfValidation.checking && cpfValidation.available === false && (
                            <AlertCircle className="absolute right-3 top-2.5 h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </FormControl>
                      {cpfValidation.formatted && (
                        <FormDescription className="text-green-600">
                          CPF: {cpfValidation.formatted}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RG</FormLabel>
                      <FormControl>
                        <Input placeholder="00.000.000-0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="avatar_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto de Perfil</FormLabel>
                    <FormControl>
                      <ThumbnailUpload
                        value={field.value}
                        onChange={field.onChange}
                        entityType="user"
                        entityId="new"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>Usada no menu do usuario e nos comentarios.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Endereco</h3>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="address_street"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Rua</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da rua" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numero</FormLabel>
                      <FormControl>
                        <Input placeholder="123" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="address_complement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Complemento</FormLabel>
                      <FormControl>
                        <Input placeholder="Apto, Bloco, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_neighborhood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do bairro" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="address_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da cidade" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        defaultValue=""
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address_zip_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <Input placeholder="00000-000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Usuario"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
