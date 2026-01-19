/**
 * Step 1: Access Data - Email, password, WhatsApp
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type RegistrationStep1Data,
  applyPhoneMask,
  getPasswordStrength,
  registrationStep1Schema,
} from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface AccessDataStepProps {
  defaultValues?: Partial<RegistrationStep1Data>;
  prefillPhone?: string;
  onNext: (data: RegistrationStep1Data) => void;
}

export function AccessDataStep({ defaultValues, prefillPhone, onNext }: AccessDataStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registrationStep1Schema),
    defaultValues: {
      email: defaultValues?.email ?? "",
      password: defaultValues?.password ?? "",
      confirmPassword: defaultValues?.confirmPassword ?? "",
      whatsapp: defaultValues?.whatsapp ?? prefillPhone ?? "",
    },
  });

  const password = watch("password");
  const passwordStrength = password ? getPasswordStrength(password) : null;

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyPhoneMask(e.target.value);
    setValue("whatsapp", masked, { shouldValidate: true });
  };

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onNext(data as RegistrationStep1Data);
      })}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={
                errors.password
                  ? "password-error"
                  : passwordStrength
                    ? "password-strength"
                    : undefined
              }
              {...register("password")}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </Button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-sm text-destructive" role="alert">
              {errors.password.message}
            </p>
          )}
          {passwordStrength && (
            <div id="password-strength" className="space-y-2" aria-live="polite">
              {/* Strength Indicator Bar */}
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      level <= passwordStrength.score
                        ? passwordStrength.score <= 1
                          ? "bg-destructive"
                          : passwordStrength.score === 2
                            ? "bg-yellow-500"
                            : "bg-primary"
                        : "bg-muted"
                    }`}
                    role="presentation"
                  />
                ))}
              </div>

              {/* Strength Label */}
              <p
                className={`text-xs font-medium ${
                  passwordStrength.score <= 1
                    ? "text-destructive"
                    : passwordStrength.score === 2
                      ? "text-yellow-600"
                      : "text-primary"
                }`}
              >
                Força: {passwordStrength.label}
              </p>

              {/* Feedback Messages - What's missing */}
              {passwordStrength.feedback.length > 0 && (
                <ul
                  className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside"
                  aria-label="Requisitos de senha faltando"
                >
                  {passwordStrength.feedback.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}

              {/* Requirements checklist when score is good */}
              {passwordStrength.score >= 3 && passwordStrength.feedback.length === 0 && (
                <p className="text-xs text-primary">Sua senha atende todos os requisitos.</p>
              )}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar Senha</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Repita a senha"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* WhatsApp */}
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input
            id="whatsapp"
            type="tel"
            placeholder="(11) 99999-9999"
            autoComplete="tel"
            {...register("whatsapp", { onChange: handleWhatsappChange })}
          />
          {errors.whatsapp && <p className="text-sm text-destructive">{errors.whatsapp.message}</p>}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        Próximo
      </Button>
    </form>
  );
}
