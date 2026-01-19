/**
 * Upload component for attachments.
 *
 * Features:
 * - Drag and drop file upload
 * - Click to browse
 * - Progress indicator
 * - File type validation
 * - Multiple file support
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { attachmentsApi } from "@/lib/attachments-api";
import { cn } from "@/lib/utils";
import {
  type AttachmentWithDownloadStatus,
  type EntityType,
  formatFileSize,
} from "@/types/attachments";
import { AlertCircle, Check, CloudUpload, File, Loader2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AttachmentUploadProps {
  entityType: EntityType;
  entityId: string;
  onUploadComplete?: (attachment: AttachmentWithDownloadStatus) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number; // in MB, default 50
  allowedTypes?: string[]; // MIME types
  className?: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  title?: string;
  description?: string;
}

const DEFAULT_ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/zip",
  "audio/mpeg",
  "video/mp4",
  "text/plain",
  "text/csv",
];

export function AttachmentUpload({
  entityType,
  entityId,
  onUploadComplete,
  onUploadError,
  maxFileSize = 50,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  className,
}: AttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check size
      if (file.size > maxFileSize * 1024 * 1024) {
        return `Arquivo muito grande. Maximo: ${maxFileSize}MB`;
      }

      // Check type
      if (!allowedTypes.includes(file.type)) {
        return "Tipo de arquivo nao permitido";
      }

      return null;
    },
    [maxFileSize, allowedTypes],
  );

  const uploadFile = useCallback(
    async (file: File, customTitle?: string, customDescription?: string) => {
      const error = validateFile(file);
      if (error) {
        onUploadError?.(error);
        return;
      }

      // Add to uploading list
      const newFile: UploadingFile = {
        file,
        progress: 0,
        status: "uploading",
      };
      if (customTitle) newFile.title = customTitle;
      if (customDescription) newFile.description = customDescription;
      setUploadingFiles((prev) => [...prev, newFile]);

      try {
        // Simulate progress (actual progress would need XHR)
        const progressInterval = setInterval(() => {
          setUploadingFiles((prev) =>
            prev.map((uf) =>
              uf.file === file && uf.status === "uploading"
                ? { ...uf, progress: Math.min(uf.progress + 10, 90) }
                : uf,
            ),
          );
        }, 200);

        const uploadOptions: { title?: string; description?: string } = {};
        if (customTitle) uploadOptions.title = customTitle;
        if (customDescription) uploadOptions.description = customDescription;
        const response = await attachmentsApi.upload(file, entityType, entityId, uploadOptions);

        clearInterval(progressInterval);

        // Mark as complete
        setUploadingFiles((prev) =>
          prev.map((uf) => (uf.file === file ? { ...uf, progress: 100, status: "success" } : uf)),
        );

        // Notify parent
        onUploadComplete?.(response.attachment as AttachmentWithDownloadStatus);

        // Remove from list after delay
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((uf) => uf.file !== file));
        }, 2000);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Erro ao enviar arquivo";
        setUploadingFiles((prev) =>
          prev.map((uf) =>
            uf.file === file ? { ...uf, status: "error", error: errorMessage } : uf,
          ),
        );
        onUploadError?.(errorMessage);
      }
    },
    [entityType, entityId, validateFile, onUploadComplete, onUploadError],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 1) {
        const file = files[0];
        if (file) setSelectedFile(file);
      } else {
        // Multiple files - upload directly
        for (const file of files) {
          uploadFile(file);
        }
      }
    },
    [uploadFile],
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file) setSelectedFile(file);
    }
  }, []);

  const handleUploadClick = useCallback(() => {
    if (selectedFile) {
      uploadFile(selectedFile, title || undefined, description || undefined);
      setSelectedFile(null);
      setTitle("");
      setDescription("");
    }
  }, [selectedFile, title, description, uploadFile]);

  const handleCancelSelect = useCallback(() => {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
  }, []);

  const removeUploadingFile = useCallback((file: File) => {
    setUploadingFiles((prev) => prev.filter((uf) => uf.file !== file));
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop zone - div is required for drag/drop events, button elements don't support them well */}
      {!selectedFile && (
        // biome-ignore lint/a11y/useSemanticElements: Drop zones require div for drag events
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
          )}
        >
          <CloudUpload className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Arraste arquivos aqui ou{" "}
            <span className="font-medium text-primary">clique para selecionar</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Maximo {maxFileSize}MB - PDF, DOC, XLS, PPT, imagens, videos
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept={allowedTypes.join(",")}
          />
        </div>
      )}

      {/* Selected file form */}
      {selectedFile && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <File className="h-8 w-8 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCancelSelect}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="attachment-title">Titulo (opcional)</Label>
              <Input
                id="attachment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedFile.name}
              />
            </div>
            <div>
              <Label htmlFor="attachment-description">Descricao (opcional)</Label>
              <Textarea
                id="attachment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descricao do arquivo..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancelSelect}>
              Cancelar
            </Button>
            <Button onClick={handleUploadClick}>
              <CloudUpload className="mr-2 h-4 w-4" />
              Enviar
            </Button>
          </div>
        </div>
      )}

      {/* Uploading files list */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uf, index) => (
            <div
              key={`${uf.file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex-shrink-0">
                {uf.status === "uploading" && <Loader2 className="h-5 w-5 animate-spin" />}
                {uf.status === "success" && <Check className="h-5 w-5 text-green-500" />}
                {uf.status === "error" && <AlertCircle className="h-5 w-5 text-destructive" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{uf.file.name}</p>
                {uf.status === "uploading" && <Progress value={uf.progress} className="mt-1 h-1" />}
                {uf.status === "error" && (
                  <p className="mt-1 text-xs text-destructive">{uf.error}</p>
                )}
              </div>
              {uf.status === "error" && (
                <Button variant="ghost" size="icon" onClick={() => removeUploadingFile(uf.file)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AttachmentUpload;
