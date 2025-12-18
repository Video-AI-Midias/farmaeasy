/**
 * Email Change Dialog component.
 * Two-step process: request code -> verify code.
 */

import { VerificationCodeInput } from "@/components/auth/VerificationCodeInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { AxiosError } from "axios";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useCallback, useState } from "react";

interface EmailChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

type Step = "request" | "verify" | "success";

interface ApiErrorResponse {
  detail?: string;
  message?: string;
}

export function EmailChangeDialog({ open, onOpenChange, currentEmail }: EmailChangeDialogProps) {
  const logout = useAuthStore((state) => state.logout);

  // Form state
  const [step, setStep] = useState<Step>("request");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  // Loading/error state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // Reset state when closing
        setStep("request");
        setNewEmail("");
        setPassword("");
        setCode("");
        setError(null);
        setMaskedEmail("");
      }
      onOpenChange(isOpen);
    },
    [onOpenChange],
  );

  // Step 1: Request email change
  const handleRequestChange = useCallback(async () => {
    setError(null);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError("Digite um email valido.");
      return;
    }

    // Validate email is different
    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setError("O novo email deve ser diferente do atual.");
      return;
    }

    // Validate password
    if (!password) {
      setError("Digite sua senha atual.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.requestEmailChange({
        new_email: newEmail,
        password,
      });
      setMaskedEmail(response.email_masked);
      setStep("verify");
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 401) {
        setError("Senha incorreta. Tente novamente.");
      } else if (axiosError.response?.status === 409) {
        setError("Este email ja esta em uso por outra conta.");
      } else if (axiosError.response?.status === 429) {
        setError(
          axiosError.response.data?.detail || "Muitas tentativas. Tente novamente mais tarde.",
        );
      } else {
        setError("Erro ao solicitar alteracao. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [newEmail, password, currentEmail]);

  // Step 2: Verify code and confirm change
  const handleVerifyCode = useCallback(async () => {
    setError(null);

    if (code.length !== 6) {
      setError("Digite o codigo de 6 digitos.");
      return;
    }

    setIsLoading(true);

    try {
      await authApi.confirmEmailChange({ code });
      setStep("success");

      // Logout after 3 seconds
      setTimeout(() => {
        logout();
        handleOpenChange(false);
      }, 3000);
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 400) {
        setError("Codigo invalido ou expirado. Tente novamente.");
      } else if (axiosError.response?.status === 429) {
        setError(axiosError.response.data?.detail || "Muitas tentativas. Solicite um novo codigo.");
      } else {
        setError("Erro ao confirmar alteracao. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [code, logout, handleOpenChange]);

  // Resend code
  const handleResendCode = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await authApi.requestEmailChange({
        new_email: newEmail,
        password,
      });
      setMaskedEmail(response.email_masked);
      setCode("");
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      if (axiosError.response?.status === 429) {
        setError("Aguarde antes de solicitar um novo codigo.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [newEmail, password]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "request" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Alterar Email
              </DialogTitle>
              <DialogDescription>
                Para alterar seu email, digite o novo endereco e confirme sua senha.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Current Email (read-only) */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Email atual</Label>
                <Input value={currentEmail} disabled className="bg-muted" />
              </div>

              {/* New Email */}
              <div className="space-y-2">
                <Label htmlFor="new-email">Novo email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="novo@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Password Confirmation */}
              <div className="space-y-2">
                <Label htmlFor="password">Confirme sua senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha atual"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="pr-10"
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
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button onClick={handleRequestChange} disabled={isLoading || !newEmail || !password}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Solicitar Codigo"
                )}
              </Button>
            </div>
          </>
        )}

        {step === "verify" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Verificar Email
              </DialogTitle>
              <DialogDescription>
                Um codigo foi enviado para <strong>{maskedEmail}</strong>. Digite o codigo de 6
                digitos para confirmar a alteracao.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <VerificationCodeInput
                value={code}
                onChange={setCode}
                disabled={isLoading}
                autoFocus
              />

              <div className="text-center">
                <p className="text-sm text-muted-foreground">Nao recebeu o codigo?</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="text-primary"
                >
                  Reenviar codigo
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("request")} disabled={isLoading}>
                Voltar
              </Button>
              <Button onClick={handleVerifyCode} disabled={isLoading || code.length !== 6}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Confirmar Alteracao"
                )}
              </Button>
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Email Alterado!
              </DialogTitle>
            </DialogHeader>

            <div className="py-6 text-center space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Seu email foi alterado com sucesso para <strong>{newEmail}</strong>.
                </AlertDescription>
              </Alert>

              <p className="text-sm text-muted-foreground">
                Voce sera desconectado e precisara fazer login com seu novo email.
              </p>

              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EmailChangeDialog;
