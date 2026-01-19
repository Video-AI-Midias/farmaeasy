/**
 * Aggregated course materials component for student view.
 *
 * Features:
 * - Fetches all materials for a course (course/module/lesson level)
 * - Groups materials by module and lesson
 * - Shows download status indicator
 * - Tracks downloads when user clicks
 * - Collapsible sections for better organization
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { attachmentsApi } from "@/lib/attachments-api";
import { cn } from "@/lib/utils";
import type {
  AggregatedMaterial,
  CourseMaterialsResponse,
  LessonMaterialsGroup,
  ModuleMaterialsGroup,
} from "@/types/attachments";
import { formatFileSize } from "@/types/attachments";
import { BookOpen, Check, ChevronDown, Download, FileIcon, Layers, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AttachmentIcon } from "./AttachmentIcon";

interface CourseMaterialsProps {
  courseId: string;
  className?: string;
}

interface MaterialItemProps {
  material: AggregatedMaterial;
  onDownload: (material: AggregatedMaterial) => void;
  compact?: boolean;
}

function MaterialItem({ material, onDownload, compact = false }: MaterialItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onDownload(material);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50",
        compact && "p-2",
      )}
    >
      <div className="flex-shrink-0">
        <AttachmentIcon type={material.attachment_type} size={compact ? "sm" : "md"} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate font-medium", compact ? "text-sm" : "text-base")}>
            {material.title}
          </span>
          {material.has_downloaded && (
            <span title="Ja baixado">
              <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
            </span>
          )}
        </div>
        {!compact && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(material.file_size)}</span>
            {material.description && (
              <>
                <span>-</span>
                <span className="truncate">{material.description}</span>
              </>
            )}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size={compact ? "icon" : "sm"}
        onClick={handleDownload}
        disabled={isDownloading}
        title="Baixar arquivo"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {!compact && !isDownloading && <span className="ml-1">Baixar</span>}
      </Button>
    </div>
  );
}

interface MaterialsSectionProps {
  title: string;
  description?: string;
  materials: AggregatedMaterial[];
  onDownload: (material: AggregatedMaterial) => void;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
}

function MaterialsSection({
  title,
  description,
  materials,
  onDownload,
  icon,
  defaultOpen = false,
}: MaterialsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const downloadedCount = materials.filter((m) => m.has_downloaded).length;

  if (materials.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer items-center justify-between rounded-lg p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <h4 className="font-medium">{title}</h4>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {downloadedCount}/{materials.length} baixados
            </Badge>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 pl-4 pt-2">
          {materials.map((material) => (
            <MaterialItem key={material.id} material={material} onDownload={onDownload} compact />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface LessonMaterialsSectionProps {
  lesson: LessonMaterialsGroup;
  onDownload: (material: AggregatedMaterial) => void;
}

function LessonMaterialsSection({ lesson, onDownload }: LessonMaterialsSectionProps) {
  return (
    <MaterialsSection
      title={lesson.lesson_title}
      materials={lesson.materials}
      onDownload={onDownload}
      icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
    />
  );
}

interface ModuleMaterialsSectionProps {
  module: ModuleMaterialsGroup;
  moduleNumber: number;
  onDownload: (material: AggregatedMaterial) => void;
}

function ModuleMaterialsSection({ module, moduleNumber, onDownload }: ModuleMaterialsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const totalMaterials =
    module.module_materials.length + module.lessons.reduce((sum, l) => sum + l.materials.length, 0);
  const downloadedCount =
    module.module_materials.filter((m) => m.has_downloaded).length +
    module.lessons.reduce((sum, l) => sum + l.materials.filter((m) => m.has_downloaded).length, 0);

  if (totalMaterials === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  {moduleNumber}
                </div>
                <div>
                  <CardTitle className="text-lg">{module.module_title}</CardTitle>
                  <CardDescription>
                    {totalMaterials} {totalMaterials === 1 ? "material" : "materiais"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs">
                  {downloadedCount}/{totalMaterials} baixados
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Module-level materials */}
            {module.module_materials.length > 0 && (
              <MaterialsSection
                title="Materiais do Modulo"
                materials={module.module_materials}
                onDownload={onDownload}
                icon={<Layers className="h-4 w-4 text-muted-foreground" />}
                defaultOpen
              />
            )}

            {/* Lesson materials */}
            {module.lessons.map(
              (lesson) =>
                lesson.materials.length > 0 && (
                  <LessonMaterialsSection
                    key={lesson.lesson_id}
                    lesson={lesson}
                    onDownload={onDownload}
                  />
                ),
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function CourseMaterials({ courseId, className }: CourseMaterialsProps) {
  const [materials, setMaterials] = useState<CourseMaterialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await attachmentsApi.getCourseMaterials(courseId);
      setMaterials(response);
    } catch (err) {
      setError("Erro ao carregar materiais");
      console.error("Failed to fetch course materials:", err);
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleDownload = useCallback(async (material: AggregatedMaterial) => {
    try {
      // Record download
      await attachmentsApi.recordDownload(material.id);

      // Update local state
      setMaterials((prev) => {
        if (!prev) return prev;

        const updateMaterial = (m: AggregatedMaterial): AggregatedMaterial =>
          m.id === material.id
            ? { ...m, has_downloaded: true, download_count: m.download_count + 1 }
            : m;

        return {
          ...prev,
          total_downloaded: prev.total_downloaded + (material.has_downloaded ? 0 : 1),
          course_materials: prev.course_materials.map(updateMaterial),
          modules: prev.modules.map((mod) => ({
            ...mod,
            module_materials: mod.module_materials.map(updateMaterial),
            lessons: mod.lessons.map((lesson) => ({
              ...lesson,
              materials: lesson.materials.map(updateMaterial),
            })),
          })),
        };
      });

      // Open file in new tab
      window.open(material.file_url, "_blank");
    } catch (err) {
      console.error("Failed to record download:", err);
      // Still open the file even if tracking fails
      window.open(material.file_url, "_blank");
    }
  }, []);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="link" onClick={fetchMaterials}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!materials || materials.total_materials === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum material disponivel</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Materiais de apoio serao adicionados em breve
          </p>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = (materials.total_downloaded / materials.total_materials) * 100;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Progress summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileIcon className="h-5 w-5" />
              Materiais do Curso
            </CardTitle>
            <Badge variant="outline">
              {materials.total_downloaded}/{materials.total_materials} baixados
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {Math.round(progressPercent)}% dos materiais ja foram baixados
          </p>
        </CardContent>
      </Card>

      {/* Course-level materials */}
      {materials.course_materials.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Materiais Gerais do Curso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {materials.course_materials.map((material) => (
              <MaterialItem key={material.id} material={material} onDownload={handleDownload} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Module materials */}
      {materials.modules.map((module, index) => (
        <ModuleMaterialsSection
          key={module.module_id}
          module={module}
          moduleNumber={index + 1}
          onDownload={handleDownload}
        />
      ))}
    </div>
  );
}

export default CourseMaterials;
