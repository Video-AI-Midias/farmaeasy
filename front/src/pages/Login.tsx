/**
 * Login page.
 */

import logoHorizontal from "@/assets/logo-horizontal.png";
import { LoginForm } from "@/components/auth/LoginForm";
import { PublicRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

function LoginPageContent() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4 text-center">
          <img src={logoHorizontal} alt="Farma Easy" className="h-12 w-auto" />
          <CardDescription className="text-base">Faça login para acessar sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </div>
  );
}

export function LoginPage() {
  return (
    <PublicRoute>
      <LoginPageContent />
    </PublicRoute>
  );
}

export default LoginPage;
