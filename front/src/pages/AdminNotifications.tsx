/**
 * Admin Notifications page.
 *
 * Send system notifications to users (Admin only).
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notificationsApi } from "@/lib/notifications-api";
import { Bell, Loader2, Send, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type TargetAudience = "all" | "students" | "teachers";

const targetLabels: Record<TargetAudience, string> = {
  all: "Todos os usuarios",
  students: "Apenas alunos",
  teachers: "Apenas professores",
};

function AdminNotificationsContent() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<TargetAudience>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Titulo e obrigatorio");
      return;
    }

    if (!message.trim()) {
      toast.error("Mensagem e obrigatoria");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await notificationsApi.adminBroadcast(title.trim(), message.trim(), target);

      toast.success(response.message);

      // Clear form
      setTitle("");
      setMessage("");
      setTarget("all");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao enviar notificacao";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notificacoes do Sistema
          </h1>
          <p className="text-muted-foreground">
            Envie notificacoes para todos os usuarios ou grupos especificos.
          </p>
        </div>

        {/* Notification Form */}
        <Card className="max-w-2xl">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Nova Notificacao
              </CardTitle>
              <CardDescription>
                Preencha os campos abaixo para enviar uma notificacao do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Titulo</Label>
                <Input
                  id="title"
                  placeholder="Digite o titulo da notificacao"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">{title.length}/200 caracteres</p>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Digite a mensagem da notificacao"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">{message.length}/1000 caracteres</p>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <Label htmlFor="target">Destinatarios</Label>
                <Select
                  value={target}
                  onValueChange={(value) => setTarget(value as TargetAudience)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="target">
                    <SelectValue placeholder="Selecione os destinatarios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {targetLabels.all}
                      </div>
                    </SelectItem>
                    <SelectItem value="students">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {targetLabels.students}
                      </div>
                    </SelectItem>
                    <SelectItem value="teachers">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {targetLabels.teachers}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTitle("");
                  setMessage("");
                  setTarget("all");
                }}
                disabled={isSubmitting}
              >
                Limpar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar Notificacao
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Info Card */}
        <Card className="max-w-2xl bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Sobre as notificacoes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              As notificacoes enviadas aparecerao no sino de notificacoes de cada usuario
              selecionado.
            </p>
            <p>
              Use este recurso para comunicados importantes, avisos de manutencao, ou informacoes
              relevantes para todos os usuarios.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export function AdminNotificationsPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminNotificationsContent />
    </ProtectedRoute>
  );
}

export default AdminNotificationsPage;
