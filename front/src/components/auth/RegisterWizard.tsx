/**
 * Multi-step registration wizard.
 *
 * Steps:
 * 1. Email and password
 * 2. Personal info (name, CPF, phone)
 * 3. Confirmation
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type RegisterFormData,
  applyCPFMask,
  applyPhoneMask,
  normalizeCPF,
  normalizePhone,
  registerSchemaWithConfirm,
  validateCPF,
} from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AxiosError } from "axios";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

interface RegisterWizardProps {
  onSuccess?: () => void;
  className?: string;
}

interface ApiErrorResponse {
  detail?: string;
}

type Step = 1 | 2 | 3;

const TOTAL_STEPS = 3;

export function RegisterWizard({ onSuccess, className }: RegisterWizardProps) {
  const { register: registerUser, isLoading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [cpfAvailable, setCpfAvailable] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isCheckingCpf, setIsCheckingCpf] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchemaWithConfirm),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
      cpf: "",
      phone: "",
    },
    mode: "onBlur",
  });

  const password = watch("password");
  const cpf = watch("cpf");
  const phone = watch("phone");

  // Handle CPF input with mask
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyCPFMask(e.target.value);
    setValue("cpf", masked, { shouldValidate: true });
  };

  // Handle phone input with mask
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyPhoneMask(e.target.value);
    setValue("phone", masked, { shouldValidate: true });
  };

  // Check email availability
  const checkEmailAvailability = async (email: string) => {
    if (!email || errors.email) {
      setEmailAvailable(null);
      return;
    }
    setIsCheckingEmail(true);
    try {
      const response = await authApi.validateEmail(email);
      setEmailAvailable(response.available);
    } catch {
      setEmailAvailable(null);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  // Check CPF availability
  const checkCpfAvailability = async (cpfValue: string) => {
    const validation = validateCPF(cpfValue);
    if (!validation.valid) {
      setCpfAvailable(null);
      return;
    }
    setIsCheckingCpf(true);
    try {
      const response = await authApi.validateCPF(normalizeCPF(cpfValue));
      setCpfAvailable(response.available ?? null);
    } catch {
      setCpfAvailable(null);
    } finally {
      setIsCheckingCpf(false);
    }
  };

  // Navigate to next step
  const goToNextStep = async () => {
    let fieldsToValidate: (keyof RegisterFormData)[] = [];

    if (step === 1) {
      fieldsToValidate = ["email", "password", "confirmPassword"];
    } else if (step === 2) {
      fieldsToValidate = ["name", "cpf", "phone"];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      // Additional checks for step 1
      if (step === 1 && emailAvailable === false) {
        setError("Este e-mail já está em uso");
        return;
      }
      // Additional checks for step 2
      if (step === 2 && cpfAvailable === false) {
        setError("Este CPF já está cadastrado");
        return;
      }

      setError(null);
      setStep((s) => Math.min(s + 1, TOTAL_STEPS) as Step);
    }
  };

  // Navigate to previous step
  const goToPreviousStep = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1) as Step);
  };

  // Submit registration
  const onSubmit = async (data: RegisterFormData) => {
    setError(null);
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        name: data.name,
        cpf: normalizeCPF(data.cpf),
        phone: normalizePhone(data.phone),
      });
      onSuccess?.();
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 409) {
        setError("E-mail ou CPF já cadastrado");
      } else if (axiosError.response?.data?.detail) {
        setError(axiosError.response.data.detail);
      } else {
        setError("Erro ao criar conta. Tente novamente.");
      }
    }
  };

  const isDisabled = isLoading || isSubmitting;
  const progressPercentage = (step / TOTAL_STEPS) * 100;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Passo {step} de {TOTAL_STEPS}
          </span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Step 1: Email and Password */}
        {step === 1 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  disabled={isDisabled}
                  className={cn("pl-10", errors.email && "border-destructive")}
                  {...register("email")}
                  onBlur={(e) => {
                    register("email").onBlur(e);
                    checkEmailAvailability(e.target.value);
                  }}
                />
                {isCheckingEmail && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {!isCheckingEmail && emailAvailable === true && (
                  <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
                )}
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              {emailAvailable === false && (
                <p className="text-sm text-destructive">E-mail já cadastrado</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  autoComplete="new-password"
                  disabled={isDisabled}
                  className={cn("pl-10 pr-10", errors.password && "border-destructive")}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
              <PasswordStrengthIndicator password={password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="********"
                  autoComplete="new-password"
                  disabled={isDisabled}
                  className={cn("pl-10 pr-10", errors.confirmPassword && "border-destructive")}
                  {...register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </>
        )}

        {/* Step 2: Personal Info */}
        {step === 2 && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  autoComplete="name"
                  disabled={isDisabled}
                  className={cn("pl-10", errors.name && "border-destructive")}
                  {...register("name")}
                />
              </div>
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  disabled={isDisabled}
                  className={cn("pl-10", errors.cpf && "border-destructive")}
                  value={cpf}
                  onChange={handleCpfChange}
                  onBlur={() => checkCpfAvailability(cpf)}
                />
                {isCheckingCpf && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {!isCheckingCpf && cpfAvailable === true && (
                  <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
                )}
              </div>
              {errors.cpf && <p className="text-sm text-destructive">{errors.cpf.message}</p>}
              {cpfAvailable === false && (
                <p className="text-sm text-destructive">CPF já cadastrado</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Celular</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                  disabled={isDisabled}
                  className={cn("pl-10", errors.phone && "border-destructive")}
                  value={phone}
                  onChange={handlePhoneChange}
                />
              </div>
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
          </>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium">Confirme seus dados</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="font-medium">{watch("email")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{watch("name")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">CPF</dt>
                <dd className="font-medium">{watch("cpf")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Celular</dt>
                <dd className="font-medium">{watch("phone")}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={goToPreviousStep}
              disabled={isDisabled}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          )}

          {step < TOTAL_STEPS && (
            <Button type="button" onClick={goToNextStep} disabled={isDisabled} className="flex-1">
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === TOTAL_STEPS && (
            <Button type="submit" disabled={isDisabled} className="flex-1">
              {isDisabled ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Criar conta
                </>
              )}
            </Button>
          )}
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-muted-foreground">
          Já tem uma conta?{" "}
          <Link to="/entrar" className="text-primary hover:underline">
            Fazer login
          </Link>
        </p>
      </form>
    </div>
  );
}

export default RegisterWizard;
