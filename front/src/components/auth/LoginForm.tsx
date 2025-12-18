/**
 * Login form component with React Hook Form + Zod validation.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { type LoginFormData, loginSchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AxiosError } from "axios";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

interface LoginFormProps {
  onSuccess?: () => void;
  className?: string;
}

interface ApiErrorResponse {
  detail?: string | SessionLimitErrorDetail;
}

interface SessionLimitErrorDetail {
  message: string;
  code: string;
  current_sessions: number;
  max_sessions: number;
}

export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const { login, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data);
      onSuccess?.();
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 401) {
        setError("E-mail ou senha incorretos");
      } else if (axiosError.response?.status === 429) {
        // Session limit exceeded
        const detail = axiosError.response?.data?.detail;
        if (typeof detail === "object" && detail?.code === "session_limit_exceeded") {
          setError("Limite de acessos simultâneos atingido.");
        } else {
          setError("Limite de acessos simultâneos atingido.");
        }
      } else if (axiosError.response?.data?.detail) {
        const detail = axiosError.response.data.detail;
        setError(typeof detail === "string" ? detail : detail.message);
      } else {
        setError("Erro ao fazer login. Tente novamente.");
      }
    }
  };

  const isDisabled = isLoading || isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={cn("space-y-4", className)}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Email */}
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
          />
        </div>
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link
            to="/forgot-password"
            className="text-sm text-primary hover:underline"
            tabIndex={-1}
          >
            Esqueceu a senha?
          </Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="********"
            autoComplete="current-password"
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
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isDisabled}>
        {isDisabled ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>

      {/* Register link */}
      <p className="text-center text-sm text-muted-foreground">
        Não tem uma conta?{" "}
        <Link to="/register" className="text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export default LoginForm;
