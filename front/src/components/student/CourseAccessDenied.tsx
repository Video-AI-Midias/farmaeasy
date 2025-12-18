/**
 * Component shown when a student doesn't have access to a course.
 *
 * Features:
 * - Shows course info (title, description, thumbnail)
 * - Self-enroll button for free courses
 * - Contact message for paid courses
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acquisitionsApi } from "@/lib/acquisitions-api";
import type { Course } from "@/types/courses";
import { BookOpen, Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface CourseAccessDeniedProps {
  course: Course;
  canEnroll: boolean;
  onEnrollSuccess?: () => void;
}

export function CourseAccessDenied({
  course,
  canEnroll,
  onEnrollSuccess,
}: CourseAccessDeniedProps) {
  const [isEnrolling, setIsEnrolling] = useState(false);
  const navigate = useNavigate();

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      await acquisitionsApi.enrollFree(course.id);
      toast.success("Matricula realizada com sucesso!");
      onEnrollSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao realizar matricula";
      toast.error(message);
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Access Denied Alert */}
      <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
        <Lock className="h-4 w-4" />
        <AlertTitle>Acesso Restrito</AlertTitle>
        <AlertDescription>Voce ainda nao tem acesso a este curso.</AlertDescription>
      </Alert>

      {/* Course Info Card */}
      <Card>
        <CardHeader className="text-center pb-4">
          {course.thumbnail_url && (
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="w-full max-w-md mx-auto rounded-lg object-cover aspect-video mb-4"
            />
          )}
          <CardTitle className="text-2xl">{course.title}</CardTitle>
          {course.description && (
            <CardDescription className="text-base mt-2">{course.description}</CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Course Stats */}
          <div className="flex justify-center gap-6 text-sm text-muted-foreground pb-4 border-b">
            <div className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {course.module_count} modulos
            </div>
          </div>

          {/* Action Section */}
          <div className="text-center space-y-4 pt-2">
            {canEnroll ? (
              <>
                <p className="text-muted-foreground">
                  Este curso esta disponivel para voce. Clique no botao abaixo para se matricular.
                </p>
                <Button size="lg" onClick={handleEnroll} disabled={isEnrolling}>
                  {isEnrolling ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <BookOpen className="mr-2 h-5 w-5" />
                  )}
                  {isEnrolling ? "Matriculando..." : "Matricular-se Gratuitamente"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Este curso requer acesso especial. Entre em contato com a administracao para obter
                  acesso.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button variant="outline" asChild>
                    <a href="mailto:suporte@farmaeasy.com.br">
                      <Mail className="mr-2 h-4 w-4" />
                      Entrar em Contato
                    </a>
                  </Button>
                </div>
              </>
            )}

            {/* Back Button */}
            <div className="pt-4">
              <Button variant="ghost" onClick={() => navigate("/painel")}>
                Voltar ao Dashboard
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CourseAccessDenied;
