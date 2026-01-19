/**
 * Lesson selector dialog for linking existing lessons to a module.
 *
 * Displays a list of available lessons that can be added to a module.
 * Filters out lessons already linked to the module.
 */

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import { ContentStatus, ContentType } from "@/types/courses";
import {
  Check,
  Clock,
  FileIcon,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  PlayCircle,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";

interface LessonSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (lessonId: string) => Promise<void>;
  excludeIds?: string[];
  isSubmitting?: boolean;
}

export function LessonSelector({
  open,
  onOpenChange,
  onSelect,
  excludeIds = [],
  isSubmitting = false,
}: LessonSelectorProps) {
  const [search, setSearch] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { lessons, fetchLessons, isLoading } = useCoursesStore();

  useEffect(() => {
    if (open) {
      fetchLessons();
      setSelectedId(null);
      setSearch("");
      setContentTypeFilter("all");
    }
  }, [open, fetchLessons]);

  // Filter out already linked lessons and apply search/filters
  const availableLessons = lessons.filter((lesson) => {
    if (excludeIds.includes(lesson.id)) return false;
    if (contentTypeFilter !== "all" && lesson.content_type !== contentTypeFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        lesson.title.toLowerCase().includes(searchLower) ||
        lesson.description?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const handleSelect = async () => {
    if (!selectedId) return;
    await onSelect(selectedId);
    onOpenChange(false);
  };

  const contentTypeIcons: Record<ContentType, typeof PlayCircle> = {
    [ContentType.VIDEO]: PlayCircle,
    [ContentType.TEXT]: FileText,
    [ContentType.QUIZ]: HelpCircle,
    [ContentType.PDF]: FileIcon,
    [ContentType.EMBED]: Globe,
  };

  const contentTypeLabels: Record<ContentType, string> = {
    [ContentType.VIDEO]: "Video",
    [ContentType.TEXT]: "Texto",
    [ContentType.QUIZ]: "Quiz",
    [ContentType.PDF]: "PDF",
    [ContentType.EMBED]: "Apresentacao",
  };

  const statusColors: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    [ContentStatus.PUBLISHED]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    [ContentStatus.ARCHIVED]: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  const statusLabels: Record<ContentStatus, string> = {
    [ContentStatus.DRAFT]: "Rascunho",
    [ContentStatus.PUBLISHED]: "Publicado",
    [ContentStatus.ARCHIVED]: "Arquivado",
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}min`;
    return `${minutes}min ${remainingSeconds}s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Adicionar Aula</DialogTitle>
          <DialogDescription>
            Selecione uma aula existente para adicionar ao modulo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar aulas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={contentTypeFilter}
              onValueChange={(value) => setContentTypeFilter(value as ContentType | "all")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(contentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[300px] overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableLessons.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search || contentTypeFilter !== "all"
                  ? "Nenhuma aula encontrada"
                  : "Nenhuma aula disponivel"}
              </div>
            ) : (
              <div className="divide-y">
                {availableLessons.map((lesson) => {
                  const Icon = contentTypeIcons[lesson.content_type];

                  return (
                    <button
                      type="button"
                      key={lesson.id}
                      onClick={() => setSelectedId(lesson.id)}
                      className={cn(
                        "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                        selectedId === lesson.id && "bg-accent",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{lesson.title}</span>
                              <Badge
                                variant="outline"
                                className={cn("text-xs shrink-0", statusColors[lesson.status])}
                              >
                                {statusLabels[lesson.status]}
                              </Badge>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {contentTypeLabels[lesson.content_type]}
                              </Badge>
                            </div>
                            {lesson.description && (
                              <TruncatedText
                                lines={1}
                                className="text-sm text-muted-foreground mt-1"
                              >
                                {lesson.description}
                              </TruncatedText>
                            )}
                            {lesson.duration_seconds && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(lesson.duration_seconds)}
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedId === lesson.id && (
                          <Check className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSelect} disabled={!selectedId || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonSelector;
