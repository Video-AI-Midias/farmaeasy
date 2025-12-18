/**
 * Image preview component for URL inputs.
 *
 * Displays a preview of an image URL with loading and error states.
 */

import { cn } from "@/lib/utils";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ImgHTMLAttributes, useState } from "react";

export interface ImagePreviewProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Image URL to preview */
  url: string | null | undefined;
  /** Alt text for the image */
  alt?: string;
  /** Container className */
  containerClassName?: string;
  /** Max width of the preview */
  maxWidth?: number;
}

export function ImagePreview({
  url,
  alt = "Preview",
  containerClassName,
  maxWidth = 200,
  className,
  ...imgProps
}: ImagePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Reset states when URL changes
  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  if (!url) {
    return null;
  }

  return (
    <div className={cn("mt-3 space-y-2", containerClassName)} style={{ maxWidth }}>
      <p className="text-sm text-muted-foreground">Preview:</p>
      <div className="relative overflow-hidden rounded-md border bg-muted aspect-video">
        {/* Loading state */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
            <span className="text-xs">Falha ao carregar</span>
          </div>
        )}

        {/* Image */}
        {!hasError && (
          <img
            {...imgProps}
            src={url}
            alt={alt}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              isLoading && "opacity-0",
              className,
            )}
            onLoadStart={handleLoadStart}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default ImagePreview;
