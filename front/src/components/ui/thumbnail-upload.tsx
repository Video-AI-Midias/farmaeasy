/**
 * Thumbnail upload component with drag-and-drop support.
 *
 * Features:
 * - Drag and drop file upload
 * - Click to select file
 * - Preview of uploaded/selected image
 * - Progress indicator during upload
 * - URL input fallback
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { type EntityType, type StorageConfig, storageApi } from "@/lib/storage-api";
import { cn } from "@/lib/utils";
import { AlertCircle, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

// ==============================================================================
// Types
// ==============================================================================

export interface ThumbnailUploadProps {
  /** Current thumbnail URL (from form state) */
  value: string | null | undefined;
  /** Callback when thumbnail URL changes */
  onChange: (url: string | null) => void;
  /** Entity type for the upload */
  entityType: EntityType;
  /** Entity ID for the upload (use "new" for new entities) */
  entityId: string;
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Container className */
  className?: string;
  /** Maximum file size in MB (from config or override) */
  maxFileSizeMb?: number;
  /** Allowed MIME types */
  allowedTypes?: string[];
}

// ==============================================================================
// Component
// ==============================================================================

export function ThumbnailUpload({
  value,
  onChange,
  entityType,
  entityId,
  disabled = false,
  className,
  maxFileSizeMb: maxFileSizeMbProp,
  allowedTypes: allowedTypesProp,
}: ThumbnailUploadProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [config, setConfig] = useState<StorageConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");

  // Config values (prop overrides server config)
  const maxFileSizeMb = maxFileSizeMbProp ?? config?.max_file_size_mb ?? 10;
  const allowedTypes = allowedTypesProp ??
    config?.allowed_types ?? ["image/jpeg", "image/png", "image/webp"];
  const isConfigured = config?.configured ?? false;

  // Load storage config on mount
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const configData = await storageApi.getConfig();
        if (!cancelled) {
          setConfig(configData);
        }
      } catch {
        // Config fetch failed - will show URL input only
        if (!cancelled) {
          setConfig({ configured: false, bucket: null, max_file_size_mb: 10, allowed_types: [] });
        }
      } finally {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Validate file before upload
  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!allowedTypes.includes(file.type)) {
        return `Tipo de arquivo nao permitido. Use: ${allowedTypes.map((t) => t.split("/")[1] ?? t).join(", ")}`;
      }

      // Check file size
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        return `Arquivo muito grande. Maximo: ${maxFileSizeMb}MB`;
      }

      return null;
    },
    [allowedTypes, maxFileSizeMb],
  );

  // Handle file upload
  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const result = await storageApi.uploadThumbnail(file, entityType, entityId, (percent) => {
          setUploadProgress(percent);
        });

        onChange(result.file_url);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao fazer upload. Tente novamente.";
        setError(message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [entityType, entityId, onChange, validateFile],
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      // Reset input so same file can be selected again
      event.target.value = "";
    },
    [handleUpload],
  );

  // Handle drag events
  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload],
  );

  // Handle URL input submit
  const handleUrlSubmit = useCallback(() => {
    if (urlInputValue.trim()) {
      onChange(urlInputValue.trim());
      setShowUrlInput(false);
      setUrlInputValue("");
    }
  }, [urlInputValue, onChange]);

  // Handle clear
  const handleClear = useCallback(() => {
    onChange(null);
    setError(null);
  }, [onChange]);

  // Show loading state
  if (isConfigLoading) {
    return (
      <div className={cn("flex items-center justify-center h-32 rounded-lg border", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show URL input only mode if upload not configured
  if (!isConfigured && !value) {
    return (
      <div className={cn("space-y-2", className)}>
        <Input
          type="url"
          placeholder="https://exemplo.com/imagem.jpg"
          value={urlInputValue}
          onChange={(e) => setUrlInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
          disabled={disabled}
        />
        {urlInputValue && (
          <Button type="button" size="sm" onClick={handleUrlSubmit} disabled={disabled}>
            Usar URL
          </Button>
        )}
      </div>
    );
  }

  // Show preview if has value
  if (value) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="relative rounded-lg border overflow-hidden aspect-video max-w-[300px]">
          <img
            src={value}
            alt="Thumbnail preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remover imagem</span>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate max-w-[300px]">{value}</p>
      </div>
    );
  }

  // Show URL input mode
  if (showUrlInput) {
    return (
      <div className={cn("space-y-2", className)}>
        <Input
          type="url"
          placeholder="https://exemplo.com/imagem.jpg"
          value={urlInputValue}
          onChange={(e) => setUrlInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
          disabled={disabled}
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleUrlSubmit} disabled={disabled}>
            Usar URL
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowUrlInput(false)}
            disabled={disabled}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // Show upload drop zone
  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={disabled || isUploading}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer w-full",
          isDragging && "border-primary bg-primary/5",
          !isDragging && "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
          isUploading && "pointer-events-none",
        )}
        onDragEnter={disabled ? undefined : handleDragEnter}
        onDragLeave={disabled ? undefined : handleDragLeave}
        onDragOver={disabled ? undefined : handleDragOver}
        onDrop={disabled ? undefined : handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={allowedTypes.join(",")}
          className="sr-only"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
        />

        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Enviando...</p>
            <Progress value={uploadProgress} className="w-full max-w-[200px]" />
          </>
        ) : (
          <>
            {isDragging ? (
              <ImageIcon className="h-8 w-8 text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragging
                  ? "Solte a imagem aqui"
                  : "Arraste uma imagem ou clique para selecionar"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {allowedTypes.map((t) => (t.split("/")[1] ?? t).toUpperCase()).join(", ")} • Máx{" "}
                {maxFileSizeMb}MB
              </p>
            </div>
          </>
        )}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {isConfigured && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setShowUrlInput(true)}
          disabled={disabled || isUploading}
        >
          Usar URL externa
        </Button>
      )}
    </div>
  );
}

export default ThumbnailUpload;
