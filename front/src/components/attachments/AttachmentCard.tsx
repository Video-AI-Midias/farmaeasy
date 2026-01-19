/**
 * Card component for displaying attachment information.
 *
 * Features:
 * - File type icon with color coding
 * - Download button with tracking
 * - Edit/delete actions for admins
 * - Download status indicator
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_TYPE_INFO,
  type AttachmentWithDownloadStatus,
  formatFileSize,
  getFileExtension,
} from "@/types/attachments";
import { Check, Download, Edit, MoreVertical, Trash2 } from "lucide-react";
import { AttachmentIcon } from "./AttachmentIcon";

interface AttachmentCardProps {
  attachment: AttachmentWithDownloadStatus;
  onDownload?: (attachment: AttachmentWithDownloadStatus) => void;
  onEdit?: (attachment: AttachmentWithDownloadStatus) => void;
  onDelete?: (attachmentId: string) => void;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
}

export function AttachmentCard({
  attachment,
  onDownload,
  onEdit,
  onDelete,
  showActions = false,
  compact = false,
  className,
}: AttachmentCardProps) {
  const typeInfo = ATTACHMENT_TYPE_INFO[attachment.attachment_type];
  const extension = getFileExtension(attachment.original_filename);

  const handleDownloadClick = () => {
    onDownload?.(attachment);
    // Open file URL in new tab
    window.open(attachment.file_url, "_blank");
  };

  const hasActions = showActions && (onEdit || onDelete);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50",
        compact && "p-2",
        className,
      )}
    >
      {/* File type icon */}
      <div className="flex-shrink-0">
        <AttachmentIcon type={attachment.attachment_type} size={compact ? "sm" : "md"} />
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate font-medium", compact ? "text-sm" : "text-base")}>
            {attachment.title}
          </span>
          {attachment.has_downloaded && (
            <span title="Ja baixado">
              <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(attachment.file_size)}</span>
            <span>-</span>
            <Badge variant="outline" className="px-1.5 py-0 text-xs">
              {extension || typeInfo.label}
            </Badge>
            {attachment.download_count > 0 && (
              <>
                <span>-</span>
                <span>
                  {attachment.download_count} download{attachment.download_count !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          onClick={handleDownloadClick}
          title="Baixar arquivo"
        >
          <Download className="h-4 w-4" />
          {!compact && <span className="ml-1">Baixar</span>}
        </Button>

        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(attachment)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(attachment.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

export default AttachmentCard;
