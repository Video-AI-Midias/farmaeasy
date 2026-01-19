/**
 * Combined section for attachments management.
 *
 * Includes:
 * - Upload component
 * - List of attachments
 * - Edit/delete actions
 *
 * Used in admin pages for courses, modules, and lessons.
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { attachmentsApi } from "@/lib/attachments-api";
import type { AttachmentWithDownloadStatus, EntityType } from "@/types/attachments";
import { FileIcon, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AttachmentCard } from "./AttachmentCard";
import { AttachmentUpload } from "./AttachmentUpload";

interface AttachmentsSectionProps {
  entityType: EntityType;
  entityId: string;
  title?: string;
  className?: string;
  /** Whether to show upload interface */
  allowUpload?: boolean;
  /** Whether to show edit/delete actions */
  allowManage?: boolean;
}

export function AttachmentsSection({
  entityType,
  entityId,
  title = "Materiais",
  className,
  allowUpload = true,
  allowManage = true,
}: AttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<AttachmentWithDownloadStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Edit dialog state
  const [editingAttachment, setEditingAttachment] = useState<AttachmentWithDownloadStatus | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete dialog state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await attachmentsApi.listByEntity(entityType, entityId);
      setAttachments(response.items);
    } catch (err) {
      setError("Erro ao carregar materiais");
      console.error("Failed to fetch attachments:", err);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Handle upload complete
  const handleUploadComplete = useCallback((attachment: AttachmentWithDownloadStatus) => {
    setAttachments((prev) => [...prev, attachment]);
    setShowUpload(false);
  }, []);

  // Handle download
  const handleDownload = useCallback(async (attachment: AttachmentWithDownloadStatus) => {
    try {
      await attachmentsApi.recordDownload(attachment.id);
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === attachment.id
            ? { ...a, has_downloaded: true, download_count: a.download_count + 1 }
            : a,
        ),
      );
    } catch (err) {
      console.error("Failed to record download:", err);
    }
  }, []);

  // Handle edit
  const handleEditClick = useCallback((attachment: AttachmentWithDownloadStatus) => {
    setEditingAttachment(attachment);
    setEditTitle(attachment.title);
    setEditDescription(attachment.description || "");
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingAttachment) return;

    setIsSaving(true);
    try {
      const updated = await attachmentsApi.update(editingAttachment.id, {
        title: editTitle,
        description: editDescription || null,
      });
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === editingAttachment.id
            ? { ...a, ...updated, has_downloaded: a.has_downloaded }
            : a,
        ),
      );
      setEditingAttachment(null);
    } catch (err) {
      console.error("Failed to update attachment:", err);
    } finally {
      setIsSaving(false);
    }
  }, [editingAttachment, editTitle, editDescription]);

  const handleEditCancel = useCallback(() => {
    setEditingAttachment(null);
    setEditTitle("");
    setEditDescription("");
  }, []);

  // Handle delete
  const handleDeleteClick = useCallback((attachmentId: string) => {
    setDeletingId(attachmentId);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      await attachmentsApi.delete(deletingId);
      setAttachments((prev) => prev.filter((a) => a.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingId]);

  const handleDeleteCancel = useCallback(() => {
    setDeletingId(null);
  }, []);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileIcon className="h-4 w-4" />
            {title}
            {!isLoading && (
              <span className="text-sm font-normal text-muted-foreground">
                ({attachments.length})
              </span>
            )}
          </CardTitle>
          {allowUpload && !showUpload && (
            <Button variant="outline" size="sm" onClick={() => setShowUpload(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload section */}
        {showUpload && (
          <div className="space-y-2">
            <AttachmentUpload
              entityType={entityType}
              entityId={entityId}
              onUploadComplete={handleUploadComplete}
            />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="text-center py-4 text-muted-foreground">
            <p>{error}</p>
            <Button variant="link" onClick={fetchAttachments}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && attachments.length === 0 && !showUpload && (
          <div className="text-center py-8">
            <FileIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">Nenhum material adicionado</p>
            {allowUpload && (
              <Button variant="link" onClick={() => setShowUpload(true)}>
                Adicionar material
              </Button>
            )}
          </div>
        )}

        {/* Attachments list */}
        {!isLoading && attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                onDownload={handleDownload}
                {...(allowManage && { onEdit: handleEditClick, onDelete: handleDeleteClick })}
                showActions={allowManage}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editingAttachment} onOpenChange={(open) => !open && handleEditCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar material</DialogTitle>
            <DialogDescription>Altere o titulo e descricao do material.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-title">Titulo</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Descricao</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleEditCancel} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={isSaving || !editTitle.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir material?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. O arquivo sera removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default AttachmentsSection;
