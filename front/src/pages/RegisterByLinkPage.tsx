/**
 * Public registration page accessed via registration link.
 * URL: /cadastrar/:shortcode#t=<token>
 *
 * Token is passed in URL fragment (not query param) for security:
 * - Fragments are NOT sent to the server in HTTP requests
 * - Fragments are NOT logged in server access logs
 * - Fragments are processed client-side only
 */
import logoHorizontal from "@/assets/logo-horizontal.png";
import { RegistrationLinkWizard } from "@/components/registration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { setAccessToken } from "@/lib/api";
import type { RegistrationLinkFormData } from "@/lib/validators";
import { useAuthStore } from "@/stores/auth";
import type {
  CompleteRegistrationRequest,
  CompleteRegistrationResponse,
  ValidateLinkResponse,
} from "@/types/registration-link";
import { AlertCircle, CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

type PageState = "loading" | "valid" | "invalid" | "expired" | "used" | "error" | "success";

/** Default timeout for API requests in milliseconds */
const API_TIMEOUT_MS = 30000;

/**
 * Extract token from URL fragment.
 * Supports formats: #t=TOKEN or #token=TOKEN
 */
function getTokenFromFragment(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;

  // Parse fragment as URL params (remove leading #)
  const params = new URLSearchParams(hash.slice(1));
  return params.get("t") || params.get("token") || null;
}

export function RegisterByLinkPage() {
  const { shortcode } = useParams<{ shortcode: string }>();
  // Extract token from URL fragment (not query params) for security
  const token = useMemo(() => getTokenFromFragment(), []);
  const navigate = useNavigate();
  const { setUser, setInitialized } = useAuthStore();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [linkData, setLinkData] = useState<ValidateLinkResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<CompleteRegistrationResponse | null>(null);

  // Validate the link on mount
  useEffect(() => {
    const controller = new AbortController();

    const validateLink = async () => {
      if (!shortcode || !token) {
        setPageState("invalid");
        setErrorMessage("Link de cadastro inválido ou incompleto.");
        return;
      }

      try {
        // POST with token in body (not URL) for security
        const response = await fetch(`/api/v1/register/${shortcode}/validate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After") || "60";
          setPageState("error");
          setErrorMessage(
            `Muitas tentativas de acesso. Por favor, aguarde ${retryAfter} segundos e recarregue a página.`,
          );
          return;
        }

        // Handle service unavailable (503)
        if (response.status === 503) {
          const retryAfter = response.headers.get("Retry-After") || "30";
          setPageState("error");
          setErrorMessage(
            `Serviço temporariamente indisponível. Por favor, aguarde ${retryAfter} segundos e tente novamente.`,
          );
          return;
        }

        const data: ValidateLinkResponse = await response.json();

        if (!response.ok) {
          setLinkData(data);
          if (data.status === "expired") {
            setPageState("expired");
            setErrorMessage("Este link de cadastro expirou.");
          } else if (data.status === "used") {
            setPageState("used");
            setErrorMessage("Este link de cadastro já foi utilizado.");
          } else if (data.status === "revoked") {
            setPageState("invalid");
            setErrorMessage("Este link de cadastro foi revogado.");
          } else {
            setPageState("error");
            setErrorMessage(data.error || "Erro ao validar link de cadastro.");
          }
          return;
        }

        if (!data.valid) {
          setPageState("invalid");
          setErrorMessage(data.error || "Link de cadastro inválido.");
          return;
        }

        setLinkData(data);
        setPageState("valid");
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        // Handle timeout
        if (err instanceof DOMException && err.name === "TimeoutError") {
          setPageState("error");
          setErrorMessage(
            "A requisição demorou muito. Por favor, verifique sua conexão e tente novamente.",
          );
          return;
        }
        console.error("Failed to validate link:", err);
        setPageState("error");
        setErrorMessage("Erro de conexão. Por favor, tente novamente.");
      }
    };

    validateLink();

    return () => {
      controller.abort();
    };
  }, [shortcode, token]);

  // Handle form completion
  const handleComplete = useCallback(
    async (formData: RegistrationLinkFormData) => {
      if (!shortcode || !token) return;

      setIsSubmitting(true);
      setErrorMessage("");

      try {
        const requestBody: CompleteRegistrationRequest = {
          token,
          email: formData.email,
          password: formData.password,
          confirm_password: formData.confirmPassword,
          whatsapp: formData.whatsapp,
          full_name: formData.fullName,
          birth_date: formData.birthDate,
          cpf: formData.cpf,
          cnpj: formData.cnpj,
          store_type: formData.storeType,
          business_model: formData.businessModel,
          units_count: formData.unitsCount,
          erp_system: formData.erpSystem,
          zip_code: formData.zipCode,
          state: formData.state,
          city: formData.city,
          neighborhood: formData.neighborhood,
          street: formData.street,
          number: formData.number,
          instagram: formData.instagram,
          monthly_revenue: formData.monthlyRevenue,
        };
        if (formData.complement) {
          requestBody.complement = formData.complement;
        }

        const response = await fetch(`/api/v1/register/${shortcode}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After") || "60";
          throw new Error(
            `Muitas tentativas de cadastro. Por favor, aguarde ${retryAfter} segundos e tente novamente.`,
          );
        }

        // Handle service unavailable (503)
        if (response.status === 503) {
          const retryAfter = response.headers.get("Retry-After") || "30";
          throw new Error(
            `Serviço temporariamente indisponível. Por favor, aguarde ${retryAfter} segundos e tente novamente.`,
          );
        }

        const data: CompleteRegistrationResponse = await response.json();

        if (!response.ok) {
          const errorData = data as unknown as { detail?: string; message?: string };
          throw new Error(errorData.detail || errorData.message || "Erro ao completar cadastro.");
        }

        setSuccessData(data);
        setPageState("success");

        // Store the access token, set user as authenticated, and redirect after a delay
        if (data.access_token) {
          setAccessToken(data.access_token);
          // Create minimal user object from response - full profile will load on navigation
          setUser({
            id: data.user_id,
            email: data.email,
            name: data.name,
            role: "student",
            is_active: true,
            created_at: new Date().toISOString(),
          });
          setInitialized(true);
          setTimeout(() => {
            navigate("/aluno");
          }, 3000);
        }
      } catch (err) {
        // Handle timeout
        if (err instanceof DOMException && err.name === "TimeoutError") {
          setErrorMessage(
            "A requisição demorou muito. Por favor, verifique sua conexão e tente novamente.",
          );
          return;
        }
        console.error("Failed to complete registration:", err);
        setErrorMessage(err instanceof Error ? err.message : "Erro ao completar cadastro.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [shortcode, token, setUser, setInitialized, navigate],
  );

  // Loading state
  if (pageState === "loading") {
    return (
      <PageContainer>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  // Success state (full or partial)
  if (pageState === "success" && successData) {
    const isPartialSuccess = successData.partial_success === true;

    return (
      <PageContainer>
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                isPartialSuccess ? "bg-yellow-100" : "bg-primary/10"
              }`}
            >
              {isPartialSuccess ? (
                <AlertCircle className="h-8 w-8 text-yellow-600" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {isPartialSuccess ? "Cadastro realizado com pendências" : "Cadastro concluído!"}
            </CardTitle>
            <CardDescription>
              {isPartialSuccess
                ? `Bem-vindo(a), ${successData.name}! Seu cadastro foi realizado, mas há pendências.`
                : `Bem-vindo(a), ${successData.name}! Seu acesso foi liberado.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning for partial success */}
            {isPartialSuccess && successData.warning && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>{successData.warning}</AlertDescription>
              </Alert>
            )}

            {/* Courses granted */}
            {successData.courses_granted.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  {successData.courses_granted.length === 1
                    ? "1 curso liberado"
                    : `${successData.courses_granted.length} cursos liberados`}
                </AlertTitle>
                <AlertDescription>
                  {successData.courses_granted.map((course) => course.title).join(", ")}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecionando para sua área de aluno...
            </div>

            <Button asChild className="w-full">
              <Link to="/aluno">Acessar meus cursos</Link>
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  // Invalid/expired/used/error states
  if (pageState !== "valid") {
    return (
      <PageContainer>
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Link2Off className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">
              {pageState === "expired"
                ? "Link expirado"
                : pageState === "used"
                  ? "Link já utilizado"
                  : "Link inválido"}
            </CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>O que fazer?</AlertTitle>
              <AlertDescription>
                {pageState === "used"
                  ? "Se você já se cadastrou, faça login com seu e-mail e senha."
                  : "Entre em contato com o vendedor para solicitar um novo link de cadastro."}
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link to="/entrar">Fazer login</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Voltar para a página inicial</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  // Valid state - show wizard
  return (
    <PageContainer>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Complete seu cadastro</CardTitle>
          <CardDescription>
            Preencha os dados abaixo para ativar seu acesso aos cursos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <RegistrationLinkWizard
            courses={linkData?.courses ?? []}
            {...(linkData?.prefill_phone ? { prefillPhone: linkData.prefill_phone } : {})}
            persistenceKey={shortcode ?? "default"}
            onComplete={handleComplete}
            isSubmitting={isSubmitting}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}

// Page container with logo
function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Link to="/">
            <img src={logoHorizontal} alt="FarmaEasy" className="h-10 w-auto" />
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/entrar">Já tenho conta</Link>
          </Button>
        </nav>
      </header>

      {/* Content */}
      <main className="container mx-auto flex min-h-[calc(100vh-100px)] items-center justify-center px-4 py-8">
        {children}
      </main>
    </div>
  );
}
