/**
 * List component for displaying attachments.
 *
 * Features:
 * - Sortable list with drag-and-drop
 * - Empty state
 * - Loading state
 * - Compact mode for nested views
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attachmentsApi } from "@/lib/attachments-api";
import { cn } from "@/lib/utils";
import type { AttachmentWithDownloadStatus, EntityType } from "@/types/attachments";
import { FileIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AttachmentCard } from "./AttachmentCard";

interface AttachmentListProps {
  entityType: EntityType;
  entityId: string;
  attachments?: AttachmentWithDownloadStatus[];
  onEdit?: (attachment: AttachmentWithDownloadStatus) => void;
  onDelete?: (attachmentId: string) => void;
  onDownload?: (attachment: AttachmentWithDownloadStatus) => void;
  showActions?: boolean;
  compact?: boolean;
  showHeader?: boolean;
  title?: string;
  className?: string;
  /** If true, fetches attachments automatically */
  autoFetch?: boolean;
}

export function AttachmentList({
  entityType,
  entityId,
  attachments: initialAttachments,
  onEdit,
  onDelete,
  onDownload,
  showActions = false,
  compact = false,
  showHeader = true,
  title = "Materiais",
  className,
  autoFetch = false,
}: AttachmentListProps) {
  const [attachments, setAttachments] = useState<AttachmentWithDownloadStatus[]>(
    initialAttachments || [],
  );
  const [isLoading, setIsLoading] = useState(autoFetch && !initialAttachments);
  const [error, setError] = useState<string | null>(null);

  // Update state when props change
  useEffect(() => {
    if (initialAttachments) {
      setAttachments(initialAttachments);
    }
  }, [initialAttachments]);

  // Auto-fetch attachments
  useEffect(() => {
    if (autoFetch && !initialAttachments) {
      const fetchAttachments = async () => {
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
      };
      fetchAttachments();
    }
  }, [autoFetch, entityType, entityId, initialAttachments]);

  const handleDownload = useCallback(
    async (attachment: AttachmentWithDownloadStatus) => {
      try {
        // Record download
        await attachmentsApi.recordDownload(attachment.id);
        // Update local state
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === attachment.id
              ? { ...a, has_downloaded: true, download_count: a.download_count + 1 }
              : a,
          ),
        );
        // Call parent handler
        onDownload?.(attachment);
      } catch (err) {
        console.error("Failed to record download:", err);
      }
    },
    [onDownload],
  );

  const handleDelete = useCallback(
    async (attachmentId: string) => {
      // Update local state optimistically
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      // Call parent handler
      onDelete?.(attachmentId);
    },
    [onDelete],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <p>{error}</p>
      </div>
    );
  }

  // Empty state
  if (attachments.length === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <FileIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">Nenhum material disponivel</p>
      </div>
    );
  }

  const content = (
    <div className={cn("space-y-2", compact && "space-y-1")}>
      {attachments.map((attachment) => (
        <AttachmentCard
          key={attachment.id}
          attachment={attachment}
          onDownload={handleDownload}
          {...(onEdit && { onEdit })}
          {...(showActions && { onDelete: handleDelete })}
          showActions={showActions}
          compact={compact}
        />
      ))}
    </div>
  );

  // Without header
  if (!showHeader) {
    return <div className={className}>{content}</div>;
  }

  // With header (Card wrapper)
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileIcon className="h-4 w-4" />
          {title}
          <span className="text-sm font-normal text-muted-foreground">({attachments.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export default AttachmentList;
