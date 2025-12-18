/**
 * Report dialog for reporting comments.
 *
 * Allows users to select a reason and optionally add details.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type ReportReason, ReportReasons, reportReasonLabels } from "@/types/comments";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, description?: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function ReportDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason) {
      setError("Selecione um motivo");
      return;
    }

    setError(null);

    try {
      await onSubmit(reason, description.trim() || undefined);
      // Reset and close on success
      setReason("");
      setDescription("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar denuncia");
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setReason("");
      setDescription("");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Denunciar Comentario
          </DialogTitle>
          <DialogDescription>
            Selecione o motivo da denuncia. Nossa equipe analisara o comentario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo *</Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as ReportReason)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="reason">
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ReportReasons).map((r) => (
                  <SelectItem key={r} value={r}>
                    {reportReasonLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Detalhes (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Adicione mais detalhes sobre o problema..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting || !reason}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Denuncia"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportDialog;
