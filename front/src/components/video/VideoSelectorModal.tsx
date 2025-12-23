/**
 * Video selector modal component for selecting videos from Bunny.net library.
 *
 * Features:
 * - Grid display of available videos with thumbnails
 * - Search functionality
 * - Pagination
 * - Video preview on hover
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type VideoItem, type VideoListResponse, videoApi } from "@/lib/video-api";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Search,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface VideoSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (video: VideoItem) => void;
  selectedVideoId?: string | null | undefined;
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format date to locale string
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

/**
 * Get status badge color based on status code
 */
function getStatusColor(status: number): string {
  switch (status) {
    case 4: // finished
    case 5: // resolution_finished
      return "bg-green-500";
    case 2: // processing
    case 3: // encoding
      return "bg-yellow-500";
    case 6: // error
    case 7: // upload_failed
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

export function VideoSelectorModal({
  open,
  onOpenChange,
  onSelect,
  selectedVideoId,
}: VideoSelectorModalProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const itemsPerPage = 12;

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setInternalSelectedId(selectedVideoId || null);
      setSearchTerm("");
      setDebouncedSearch("");
      setCurrentPage(1);
      setError(null);
    }
  }, [open, selectedVideoId]);

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const request: Parameters<typeof videoApi.listVideos>[0] = {
        page: currentPage,
        items_per_page: itemsPerPage,
        order_by: "date",
      };
      if (debouncedSearch) {
        request.search = debouncedSearch;
      }
      const response: VideoListResponse = await videoApi.listVideos(request);

      setVideos(response.videos);
      setTotalPages(response.total_pages);
      setTotalItems(response.total_items);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar videos. Verifique se a API Key do Bunny.net esta configurada.",
      );
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  // Fetch videos when modal opens or pagination/search changes
  useEffect(() => {
    if (open) {
      fetchVideos();
    }
  }, [open, fetchVideos]);

  const handleSelectVideo = (video: VideoItem) => {
    setInternalSelectedId(video.video_id);
  };

  const handleConfirm = () => {
    const selectedVideo = videos.find((v) => v.video_id === internalSelectedId);
    if (selectedVideo) {
      onSelect(selectedVideo);
      onOpenChange(false);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Selecionar Video
          </DialogTitle>
          <DialogDescription>
            Selecione um video da biblioteca Bunny.net para usar na aula
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar videos por titulo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skeleton-${i.toString()}`} className="space-y-2">
                <Skeleton className="aspect-video w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Videos grid */}
        {!isLoading && !error && (
          <ScrollArea className="h-[400px] pr-4">
            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Video className="mb-4 h-12 w-12 opacity-50" />
                <p className="text-lg font-medium">Nenhum video encontrado</p>
                <p className="text-sm">
                  {debouncedSearch
                    ? "Tente outro termo de busca"
                    : "A biblioteca esta vazia ou nao configurada"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {videos.map((video) => (
                  <button
                    key={video.video_id}
                    type="button"
                    onClick={() => handleSelectVideo(video)}
                    onMouseEnter={() => setHoveredVideo(video.video_id)}
                    onMouseLeave={() => setHoveredVideo(null)}
                    className={cn(
                      "group relative flex flex-col rounded-lg border p-2 text-left transition-all hover:border-primary hover:bg-accent/50",
                      internalSelectedId === video.video_id &&
                        "border-primary bg-primary/10 ring-2 ring-primary",
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                      {hoveredVideo === video.video_id && video.thumbnail_animated_url ? (
                        <img
                          src={video.thumbnail_animated_url}
                          alt={video.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Video className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}

                      {/* Duration badge */}
                      {video.length > 0 && (
                        <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                          {formatDuration(video.length)}
                        </div>
                      )}

                      {/* Status indicator */}
                      <div
                        className={cn(
                          "absolute top-1 right-1 h-2 w-2 rounded-full",
                          getStatusColor(video.status),
                        )}
                        title={video.status_text}
                      />

                      {/* Selected checkmark */}
                      {internalSelectedId === video.video_id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                          <div className="rounded-full bg-primary p-1">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Video info */}
                    <div className="mt-2 flex-1">
                      <p
                        className="line-clamp-2 text-sm font-medium leading-tight"
                        title={video.title}
                      >
                        {video.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {video.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(video.date_uploaded)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}

        {/* Pagination */}
        {!isLoading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {totalItems} video{totalItems !== 1 ? "s" : ""} encontrado
              {totalItems !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Pagina {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!internalSelectedId || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Selecionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VideoSelectorModal;
