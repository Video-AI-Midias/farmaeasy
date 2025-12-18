/**
 * Dialog showing extended user details for admin panel.
 *
 * Features:
 * - Session info (active, max, first/last access)
 * - Progress summary (courses, lessons, watch time)
 * - Comments count
 * - Edit session limit capability
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { authApi } from "@/lib/api";
import type { User, UserDetailsResponse } from "@/types/auth";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Edit2,
  Loader2,
  MessageSquare,
  Monitor,
  Play,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function getInitials(name: string | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "Nunca";
  const date = new Date(dateStr);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}

interface UserDetailsDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated?: () => void;
}

export function UserDetailsDialog({
  user,
  open,
  onOpenChange,
  onUserUpdated,
}: UserDetailsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<UserDetailsResponse | null>(null);

  // Edit session limit state
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await authApi.getUserDetails(user.id);
      setDetails(data);
    } catch (err) {
      console.error("Error fetching user details:", err);
      setError("Erro ao carregar detalhes do usuario.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      fetchDetails();
      setIsEditingLimit(false);
    }
  }, [open, user, fetchDetails]);

  const handleStartEditLimit = () => {
    setNewLimit(details?.session_info.max_sessions.toString() ?? "10");
    setIsEditingLimit(true);
  };

  const handleCancelEditLimit = () => {
    setIsEditingLimit(false);
    setNewLimit("");
  };

  const handleSaveLimit = async () => {
    if (!user || !details) return;

    const limitValue = Number.parseInt(newLimit, 10);
    if (Number.isNaN(limitValue) || limitValue < 1 || limitValue > 100) {
      toast.error("Limite deve ser um numero entre 1 e 100");
      return;
    }

    setIsSavingLimit(true);

    try {
      await authApi.updateUserMaxSessions(user.id, limitValue);
      toast.success("Limite de sessoes atualizado!");
      setIsEditingLimit(false);
      fetchDetails();
      onUserUpdated?.();
    } catch (err) {
      console.error("Error updating session limit:", err);
      toast.error("Erro ao atualizar limite de sessoes.");
    } finally {
      setIsSavingLimit(false);
    }
  };

  const handleClose = () => {
    setDetails(null);
    setError(null);
    setIsEditingLimit(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes do Usuario</DialogTitle>
          <DialogDescription>
            Informacoes detalhadas sobre o usuario e sua atividade na plataforma.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchDetails}>
              Tentar novamente
            </Button>
          </div>
        ) : details ? (
          <div className="space-y-5">
            {/* User Header */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Avatar className="h-12 w-12">
                <AvatarImage src={details.user.avatar_url} alt={details.user.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {getInitials(details.user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{details.user.name || "Sem nome"}</p>
                <p className="text-sm text-muted-foreground truncate">{details.user.email}</p>
              </div>
              <Badge variant={details.user.is_active ? "default" : "secondary"}>
                {details.user.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>

            <Separator />

            {/* Session Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                Sessoes e Acessos
              </h3>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Primeiro acesso</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDateTime(details.session_info.first_access)}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ultimo acesso</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDateTime(details.session_info.last_access)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Sessoes ativas / Limite</Label>
                <div className="flex items-center gap-2">
                  {isEditingLimit ? (
                    <>
                      <span className="font-medium">{details.session_info.active_sessions} /</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={newLimit}
                        onChange={(e) => setNewLimit(e.target.value)}
                        className="w-20 h-8"
                        disabled={isSavingLimit}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSaveLimit}
                        disabled={isSavingLimit}
                        className="h-8 w-8 p-0"
                      >
                        {isSavingLimit ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEditLimit}
                        disabled={isSavingLimit}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">
                        {details.session_info.active_sessions} / {details.session_info.max_sessions}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleStartEditLimit}
                        className="h-8 w-8 p-0"
                        title="Editar limite"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Progress Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Progresso
              </h3>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cursos matriculados</Label>
                  <p className="font-medium">{details.progress.total_courses_enrolled}</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Aulas concluidas</Label>
                  <p className="flex items-center gap-1 font-medium">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    {details.progress.total_lessons_completed} /{" "}
                    {details.progress.total_lessons_total}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tempo total assistido</Label>
                  <p className="flex items-center gap-1 font-medium">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDuration(details.progress.total_watch_time_seconds)}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Comentarios</Label>
                  <p className="flex items-center gap-1 font-medium">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    {details.comments_count}
                  </p>
                </div>
              </div>

              {details.progress.last_lesson && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ultima aula acessada</Label>
                  <p className="flex items-center gap-1 text-sm">
                    <Play className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDateTime(details.progress.last_lesson.last_accessed_at)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
