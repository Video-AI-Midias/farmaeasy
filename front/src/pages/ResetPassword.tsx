/**
 * Reset Password page - Enter code and new password.
 */

import logoHorizontal from "@/assets/logo-horizontal.png";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import { PublicRoute } from "@/components/auth/ProtectedRoute";
import { VerificationCodeInput } from "@/components/auth/VerificationCodeInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AxiosError } from "axios";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

interface LocationState {
  email?: string;
}

interface ApiErrorResponse {
  detail?: string;
  message?: string;
}

function ResetPasswordContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [email, setEmail] = useState(state?.email || "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError("As senhas nao coincidem.");
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      setError("A senha deve ter no minimo 8 caracteres.");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword({
        email,
        code,
        new_password: newPassword,
      });
      setSuccess(true);
      // Redirect to login after short delay
      setTimeout(() => {
        navigate("/login", {
          state: { message: "Senha alterada com sucesso! Faca login com sua nova senha." },
        });
      }, 2000);
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 400) {
        setError("Codigo invalido ou expirado. Tente novamente.");
      } else if (axiosError.response?.status === 429) {
        setError(
          axiosError.response.data?.detail || "Muitas tentativas. Tente novamente mais tarde.",
        );
      } else {
        setError("Erro ao redefinir senha. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) return;
    setIsResending(true);
    setError(null);

    try {
      await authApi.forgotPassword({ email });
      setCode("");
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 429) {
        setError("Muitas tentativas. Aguarde antes de solicitar novo codigo.");
      }
    } finally {
      setIsResending(false);
    }
  };

  // Mask email for display
  const maskEmail = (emailStr: string) => {
    if (!emailStr.includes("@")) return emailStr;
    const parts = emailStr.split("@");
    const local = parts[0] ?? "";
    const domain = parts[1] ?? "";
    const maskedLocal = local.length > 2 ? `${local[0]}***` : `${local[0]}*`;
    return `${maskedLocal}@${domain}`;
  };

  const isFormValid =
    code.length === 6 && newPassword.length >= 8 && newPassword === confirmPassword && email;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4 text-center">
          <img src={logoHorizontal} alt="Farma Easy" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-semibold">Redefinir Senha</h1>
            <CardDescription className="text-base mt-2">
              {email ? (
                <>
                  Digite o codigo enviado para <strong>{maskEmail(email)}</strong>
                </>
              ) : (
                "Digite o codigo recebido por email"
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Senha alterada com sucesso! Redirecionando para login...
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Email (if not passed via state) */}
              {!state?.email && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              )}

              {/* Verification Code */}
              <div className="space-y-2">
                <Label>Codigo de Verificacao</Label>
                <VerificationCodeInput
                  value={code}
                  onChange={setCode}
                  disabled={isLoading}
                  error={error && code.length === 6 ? "Codigo invalido" : undefined}
                  autoFocus={!!state?.email}
                />
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {newPassword && <PasswordStrengthIndicator password={newPassword} />}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={cn(
                      "pl-10",
                      confirmPassword && confirmPassword !== newPassword && "border-destructive",
                    )}
                    disabled={isLoading}
                  />
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-sm text-destructive">As senhas nao coincidem</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redefinindo...
                  </>
                ) : (
                  "Redefinir Senha"
                )}
              </Button>

              {/* Resend code */}
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nao recebeu o codigo?</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendCode}
                  disabled={isResending || !email}
                  className="text-primary"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reenviando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reenviar codigo
                    </>
                  )}
                </Button>
              </div>

              <div className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar para login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  return (
    <PublicRoute>
      <ResetPasswordContent />
    </PublicRoute>
  );
}

export default ResetPasswordPage;
