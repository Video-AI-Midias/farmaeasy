/**
 * Confirmation dialog for revoking a registration link.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RegistrationLink } from "@/lib/registration-links-api";
import { Link2Off, Loader2 } from "lucide-react";
import { useState } from "react";

interface RevokeLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: RegistrationLink | null;
  onConfirm: () => Promise<void>;
}

export function RevokeLinkDialog({ open, onOpenChange, link, onConfirm }: RevokeLinkDialogProps) {
  const [isRevoking, setIsRevoking] = useState(false);

  const handleConfirm = async () => {
    setIsRevoking(true);
    try {
      await onConfirm();
    } finally {
      setIsRevoking(false);
    }
  };

  if (!link) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Link2Off className="h-5 w-5 text-destructive" />
            Revogar Link de Cadastro?
          </AlertDialogTitle>
          <AlertDialogDescription>
            O link <code className="rounded bg-muted px-1 font-mono">{link.shortcode}</code> sera
            invalidado e nao podera mais ser utilizado para cadastro.
            <br />
            <br />
            <strong>Cursos associados:</strong>{" "}
            {link.courses.map((c) => c.title).join(", ") || "Nenhum"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRevoking}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isRevoking}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRevoking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Revogando...
              </>
            ) : (
              <>
                <Link2Off className="mr-2 h-4 w-4" />
                Revogar Link
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
