/**
 * Video thumbnail component with Bunny.net fallback support.
 *
 * Displays a thumbnail image for video content. Can use:
 * - An explicit thumbnail URL
 * - Auto-generated thumbnail from Bunny.net video ID/URL (fallback)
 *
 * Usage:
 * ```tsx
 * // With explicit thumbnail
 * <VideoThumbnail thumbnailUrl="https://example.com/thumb.jpg" />
 *
 * // With Bunny.net video content URL (auto-generates thumbnail)
 * <VideoThumbnail contentUrl="video-id-here" />
 *
 * // With fallback (uses thumbnailUrl if set, otherwise generates from contentUrl)
 * <VideoThumbnail thumbnailUrl={lesson.thumbnail_url} contentUrl={lesson.content_url} />
 * ```
 */

import { useVideoConfig } from "@/hooks/useVideoConfig";
import { cn } from "@/lib/utils";
import { ImageOff, Play, Video } from "lucide-react";
import { type ImgHTMLAttributes, useState } from "react";

export interface VideoThumbnailProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> {
  /** Explicit thumbnail URL (takes priority over contentUrl) */
  thumbnailUrl?: string | null;
  /** Video content URL or video ID for auto-generating Bunny thumbnail */
  contentUrl?: string | null;
  /** Show animated WebP preview instead of static JPEG */
  animated?: boolean;
  /** Alt text for the image */
  alt?: string;
  /** Size preset */
  size?: "sm" | "md" | "lg" | "full";
  /** Whether to show play icon overlay */
  showPlayIcon?: boolean;
  /** Custom fallback when no thumbnail is available */
  fallback?: React.ReactNode;
  /** Container className */
  containerClassName?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "h-12 w-12",
  md: "h-16 w-24",
  lg: "h-24 w-36",
  full: "w-full aspect-video",
};

export function VideoThumbnail({
  thumbnailUrl,
  contentUrl,
  animated = false,
  alt = "Video thumbnail",
  size = "md",
  showPlayIcon = true,
  fallback,
  containerClassName,
  className,
  ...imgProps
}: VideoThumbnailProps) {
  const { getThumbnailUrl, isLoading } = useVideoConfig();
  const [hasError, setHasError] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Determine the thumbnail URL to use
  // Priority: explicit thumbnailUrl > auto-generated from contentUrl
  const resolvedThumbnailUrl =
    thumbnailUrl || (contentUrl ? getThumbnailUrl(contentUrl, animated) : null);

  // Show loading state while config is loading
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-md animate-pulse",
          sizeClasses[size],
          containerClassName,
        )}
      >
        <Video className="h-1/3 w-1/3 text-muted-foreground/50" />
      </div>
    );
  }

  // No thumbnail available - show fallback
  if (!resolvedThumbnailUrl || hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-md",
          sizeClasses[size],
          containerClassName,
        )}
      >
        {hasError ? (
          <ImageOff className="h-1/3 w-1/3 text-muted-foreground/50" />
        ) : (
          <Video className="h-1/3 w-1/3 text-muted-foreground/50" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-md", sizeClasses[size], containerClassName)}
    >
      {/* Placeholder while image loads */}
      {!isImageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
          <Video className="h-1/3 w-1/3 text-muted-foreground/50" />
        </div>
      )}

      <img
        {...imgProps}
        src={resolvedThumbnailUrl}
        alt={alt}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-200",
          !isImageLoaded && "opacity-0",
          className,
        )}
        onLoad={() => setIsImageLoaded(true)}
        onError={() => setHasError(true)}
      />

      {/* Play icon overlay */}
      {showPlayIcon && isImageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 text-primary fill-primary ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoThumbnail;
