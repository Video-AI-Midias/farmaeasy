/**
 * Unauthorized access page.
 *
 * Redirects users to their appropriate home based on role.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, GraduationCap, Home, ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  const { isTeacher } = useAuth();

  // Determine correct home based on user role
  const homeLink = isTeacher ? "/painel" : "/aluno";
  const homeLabel = isTeacher ? "Ir para o Dashboard" : "Ir para Meus Cursos";
  const HomeIcon = isTeacher ? Home : GraduationCap;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acesso negado</CardTitle>
          <CardDescription>Voce nao tem permissao para acessar esta pagina</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link to={homeLink}>
              <HomeIcon className="mr-2 h-4 w-4" />
              {homeLabel}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default UnauthorizedPage;
