/**
 * Panel displaying students with access to a course.
 *
 * Features:
 * - List students with access type and status
 * - Revoke access action
 * - Grant new access via dialog
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { acquisitionsAdminApi } from "@/lib/acquisitions-api";
import { cn } from "@/lib/utils";
import type { CourseStudentResponse } from "@/types/acquisitions";
import { AcquisitionStatus, AcquisitionType } from "@/types/acquisitions";
import { AlertCircle, Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GrantAccessDialog } from "./GrantAccessDialog";

interface CourseStudentsPanelProps {
  courseId: string;
  courseTitle: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const acquisitionTypeLabels: Record<AcquisitionType, string> = {
  [AcquisitionType.FREE]: "Gratuito",
  [AcquisitionType.PURCHASE]: "Compra",
  [AcquisitionType.ADMIN_GRANT]: "Admin",
  [AcquisitionType.PROMO]: "Promocao",
  [AcquisitionType.GIFT]: "Presente",
};

const acquisitionTypeColors: Record<AcquisitionType, string> = {
  [AcquisitionType.FREE]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [AcquisitionType.PURCHASE]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [AcquisitionType.ADMIN_GRANT]:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [AcquisitionType.PROMO]: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  [AcquisitionType.GIFT]: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

const statusLabels: Record<AcquisitionStatus, string> = {
  [AcquisitionStatus.PENDING]: "Pendente",
  [AcquisitionStatus.ACTIVE]: "Ativo",
  [AcquisitionStatus.EXPIRED]: "Expirado",
  [AcquisitionStatus.REVOKED]: "Revogado",
};

const statusColors: Record<AcquisitionStatus, string> = {
  [AcquisitionStatus.PENDING]: "bg-yellow-100 text-yellow-800",
  [AcquisitionStatus.ACTIVE]: "bg-green-100 text-green-800",
  [AcquisitionStatus.EXPIRED]: "bg-gray-100 text-gray-800",
  [AcquisitionStatus.REVOKED]: "bg-red-100 text-red-800",
};

export function CourseStudentsPanel({ courseId, courseTitle }: CourseStudentsPanelProps) {
  const [students, setStudents] = useState<CourseStudentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await acquisitionsAdminApi.getCourseStudents(courseId);
      setStudents(result.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar alunos";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleRevokeAccess = async (userId: string) => {
    if (!window.confirm("Deseja realmente revogar o acesso deste aluno?")) {
      return;
    }

    setRevokingId(userId);
    try {
      await acquisitionsAdminApi.revokeAccess(userId, courseId, {
        reason: "Revogado pelo administrador",
      });
      toast.success("Acesso revogado com sucesso");
      fetchStudents();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao revogar acesso";
      toast.error(message);
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-destructive">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p>{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchStudents}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Alunos com Acesso
            </CardTitle>
            <CardDescription>
              {students.length} {students.length === 1 ? "aluno" : "alunos"} com acesso ao curso
            </CardDescription>
          </div>
          <Button onClick={() => setIsGrantDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Conceder Acesso
          </Button>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Users className="mb-4 h-12 w-12" />
              <p className="text-lg font-medium">Nenhum aluno matriculado</p>
              <p className="text-sm">Clique em &quot;Conceder Acesso&quot; para adicionar alunos</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Concedido em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(student.user_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{student.user_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {student.user_email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", acquisitionTypeColors[student.acquisition_type])}
                      >
                        {acquisitionTypeLabels[student.acquisition_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", statusColors[student.status])}
                      >
                        {statusLabels[student.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(student.granted_at)}</TableCell>
                    <TableCell>
                      {student.expires_at ? formatDate(student.expires_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {student.status === AcquisitionStatus.ACTIVE && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRevokeAccess(student.user_id)}
                          disabled={revokingId === student.user_id}
                        >
                          {revokingId === student.user_id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <UserMinus className="mr-1 h-4 w-4" />
                          )}
                          Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <GrantAccessDialog
        open={isGrantDialogOpen}
        onOpenChange={setIsGrantDialogOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        onSuccess={fetchStudents}
      />
    </>
  );
}

export default CourseStudentsPanel;
