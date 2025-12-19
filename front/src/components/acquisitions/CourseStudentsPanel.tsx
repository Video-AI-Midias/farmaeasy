import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GrantAccessDialog } from "./GrantAccessDialog";

interface CourseStudentsPanelProps {
  courseId: string;
  courseTitle: string;
}

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const acquisitionTypeLabels: Record<AcquisitionType, string> = {
  [AcquisitionType.FREE]: "Gratuito",
  [AcquisitionType.PURCHASE]: "Compra",
  [AcquisitionType.ADMIN_GRANT]: "Admin",
  [AcquisitionType.PROMO]: "Promoção",
  [AcquisitionType.GIFT]: "Presente",
};

const acquisitionTypeColors: Record<AcquisitionType, string> = {
  [AcquisitionType.FREE]: "bg-blue-100 text-blue-800",
  [AcquisitionType.PURCHASE]: "bg-green-100 text-green-800",
  [AcquisitionType.ADMIN_GRANT]: "bg-purple-100 text-purple-800",
  [AcquisitionType.PROMO]: "bg-orange-100 text-orange-800",
  [AcquisitionType.GIFT]: "bg-pink-100 text-pink-800",
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

function StudentRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-8 w-24" />
      </TableCell>
    </TableRow>
  );
}

export function CourseStudentsPanel({ courseId, courseTitle }: CourseStudentsPanelProps) {
  const [students, setStudents] = useState<CourseStudentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const fetchStudents = useCallback(
    async (showRefreshingState = false) => {
      if (showRefreshingState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await acquisitionsAdminApi.getCourseStudents(courseId);
        setStudents(result.items);

        if (showRefreshingState && result.items.length > students.length) {
          // Highlight newly added students
          const existingIds = new Set(students.map((s) => s.user_id));
          const newIds = new Set(
            result.items.filter((s) => !existingIds.has(s.user_id)).map((s) => s.user_id),
          );
          setNewlyAddedIds(newIds);

          // Remove highlight after animation
          setTimeout(() => setNewlyAddedIds(new Set()), 2000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar alunos";
        setError(message);
        toast.error(message, {
          description: "Clique em 'Tentar novamente' para recarregar",
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [courseId, students],
  );

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleGrantSuccess = async () => {
    toast.success("Acesso concedido com sucesso!", {
      description: "Atualizando lista de alunos...",
      icon: <CheckCircle2 className="h-4 w-4" />,
    });

    // Small delay to ensure backend has processed the request
    await new Promise((resolve) => setTimeout(resolve, 500));
    await fetchStudents(true);
  };

  const handleRevokeAccess = async (userId: string) => {
    if (!window.confirm("Deseja realmente revogar o acesso deste aluno?")) {
      return;
    }

    setRevokingId(userId);
    try {
      await acquisitionsAdminApi.revokeAccess(userId, courseId, {
        reason: "Revogado pelo administrador",
      });

      toast.success("Acesso revogado com sucesso", {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });

      // Optimistic update: remove from UI immediately
      setStudents((prev) => prev.filter((s) => s.user_id !== userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao revogar acesso";
      toast.error(message, {
        description: "Tente novamente em alguns instantes",
      });
      // Revert on error
      fetchStudents(true);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRetry = () => {
    fetchStudents();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const activeCount = students.filter((s) => s.status === AcquisitionStatus.ACTIVE).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alunos com Acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-9 w-40" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Concedido</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <StudentRowSkeleton key={i} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alunos com Acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Erro ao Carregar</h3>
            <p className="mb-6 text-sm text-muted-foreground">{error}</p>
            <Button onClick={handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Tentar Novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alunos com Acesso
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>
                  {students.length} {students.length === 1 ? "aluno" : "alunos"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchStudents(true)}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  Atualizar
                </Button>
                <Button onClick={() => setIsGrantDialogOpen(true)} size="sm" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Conceder Acesso
                </Button>
              </div>
            </div>

            {/* Table */}
            {students.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-semibold">Nenhum aluno com acesso</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Comece concedendo acesso aos primeiros alunos deste curso
                </p>
                <Button onClick={() => setIsGrantDialogOpen(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Conceder Primeiro Acesso
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Concedido</TableHead>
                      <TableHead>Expira</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow
                        key={student.user_id}
                        className={cn(
                          "transition-colors",
                          newlyAddedIds.has(student.user_id) &&
                            "animate-pulse bg-green-50 dark:bg-green-950/20",
                        )}
                      >
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
                            className={cn(
                              "text-xs",
                              acquisitionTypeColors[student.acquisition_type],
                            )}
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
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <GrantAccessDialog
        open={isGrantDialogOpen}
        onOpenChange={setIsGrantDialogOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        onSuccess={handleGrantSuccess}
      />
    </>
  );
}

export default CourseStudentsPanel;
