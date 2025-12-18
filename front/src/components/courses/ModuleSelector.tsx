/**
 * Module selector dialog for linking existing modules to a course.
 *
 * Displays a list of available modules that can be added to a course.
 * Filters out modules already linked to the course.
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
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import { ContentStatus } from "@/types/courses";
import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

interface ModuleSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (moduleId: string) => Promise<void>;
  excludeIds?: string[];
  isSubmitting?: boolean;
}

export function ModuleSelector({
  open,
  onOpenChange,
  onSelect,
  excludeIds = [],
  isSubmitting = false,
}: ModuleSelectorProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { modules, fetchModules, isLoading } = useCoursesStore();

  useEffect(() => {
    if (open) {
      fetchModules();
      setSelectedId(null);
      setSearch("");
    }
  }, [open, fetchModules]);

  // Filter out already linked modules and apply search
  const availableModules = modules.filter((module) => {
    if (excludeIds.includes(module.id)) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        module.title.toLowerCase().includes(searchLower) ||
        module.description?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const handleSelect = async () => {
    if (!selectedId) return;
    await onSelect(selectedId);
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Adicionar Modulo</DialogTitle>
          <DialogDescription>
            Selecione um modulo existente para adicionar ao curso
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar modulos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableModules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search ? "Nenhum modulo encontrado" : "Nenhum modulo disponivel"}
              </div>
            ) : (
              <div className="divide-y">
                {availableModules.map((module) => (
                  <button
                    type="button"
                    key={module.id}
                    onClick={() => setSelectedId(module.id)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                      selectedId === module.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{module.title}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-xs shrink-0", statusColors[module.status])}
                          >
                            {statusLabels[module.status]}
                          </Badge>
                        </div>
                        {module.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {module.description}
                          </p>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {module.lesson_count} {module.lesson_count === 1 ? "aula" : "aulas"}
                        </div>
                      </div>
                      {selectedId === module.id && (
                        <Check className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
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

export default ModuleSelector;
