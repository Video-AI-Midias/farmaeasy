/**
 * Forgot Password page - Request password reset code.
 */

import logoHorizontal from "@/assets/logo-horizontal.png";
import { PublicRoute } from "@/components/auth/ProtectedRoute";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AxiosError } from "axios";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface ApiErrorResponse {
  detail?: string;
  message?: string;
}

function ForgotPasswordContent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
      // Redirect to reset password page after short delay
      setTimeout(() => {
        navigate("/reset-password", { state: { email } });
      }, 2000);
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 429) {
        setError(
          axiosError.response.data?.detail || "Muitas tentativas. Tente novamente mais tarde.",
        );
      } else {
        // Always show success to not reveal if email exists
        setSuccess(true);
        setTimeout(() => {
          navigate("/reset-password", { state: { email } });
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isValidEmail = email.includes("@") && email.includes(".");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4 text-center">
          <img src={logoHorizontal} alt="Farma Easy" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-semibold">Esqueceu sua senha?</h1>
            <CardDescription className="text-base mt-2">
              Digite seu email para receber um codigo de recuperacao
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Se o email existir, um codigo de verificacao foi enviado. Redirecionando...
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn("pl-10")}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !isValidEmail}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Codigo"
                )}
              </Button>

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

export function ForgotPasswordPage() {
  return (
    <PublicRoute>
      <ForgotPasswordContent />
    </PublicRoute>
  );
}

export default ForgotPasswordPage;
