/**
 * Registration page.
 */

import logoHorizontal from "@/assets/logo-horizontal.png";
import { PublicRoute } from "@/components/auth/ProtectedRoute";
import { RegisterWizard } from "@/components/auth/RegisterWizard";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

function RegisterPageContent() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate("/painel", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4 text-center">
          <img src={logoHorizontal} alt="Farma Easy" className="h-12 w-auto" />
          <CardDescription className="text-base">
            Preencha seus dados para criar sua conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterWizard onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  return (
    <PublicRoute>
      <RegisterPageContent />
    </PublicRoute>
  );
}

export default RegisterPage;
