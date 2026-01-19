import { AttachmentsSection } from "@/components/attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VideoSelectorModal } from "@/components/video/VideoSelectorModal";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import type { VideoItem } from "@/lib/video-api";
import { EntityType } from "@/types/attachments";
import {
  ContentStatus,
  ContentType,
  type CreateLessonRequest,
  type Lesson,
  type UpdateLessonRequest,
  isAllowedEmbedUrl,
} from "@/types/courses";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Regex for Bunny.net video ID (UUID format: 8-4-4-4-12 hex chars)
const VIDEO_ID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Supported video URL patterns
const BUNNY_URL_PATTERNS = [
  /iframe\.mediadelivery\.net\/embed\/\d+\/[a-f0-9-]+/i, // Embed URL
  /iframe\.mediadelivery\.net\/play\/\d+\/[a-f0-9-]+/i, // Play URL
  /\.b-cdn\.net\//i, // CDN URL
  /\.m3u8/i, // HLS stream
];

/**
 * Extracts URL from iframe HTML code if present.
 * Returns the original value if no iframe is detected.
 */
function extractUrlFromIframe(value: string): string {
  if (!value) return value;

  // Check if it looks like iframe HTML (contains src= or iframe tag)
  const srcMatch = value.match(/src=["']([^"']+)["']/i);
  if (srcMatch?.[1]) {
    return srcMatch[1];
  }

  return value;
}

/**
 * Validates video content URL.
 * Accepts:
 * - Bunny.net video ID (UUID format)
 * - Bunny.net embed/play URLs
 * - CDN URLs
 * - HLS streams (.m3u8)
 * - Standard URLs (http/https)
 */
function isValidVideoContent(value: string): boolean {
  if (!value) return true; // Empty is OK (optional field)

  // Check if it's a video ID (UUID format)
  if (VIDEO_ID_REGEX.test(value)) {
    return true;
  }

  // Check if it's a known Bunny.net URL pattern
  if (BUNNY_URL_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }

  // Check if it's a valid URL
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates any URL (for PDF and generic content).
 */
function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const lessonSchema = z
  .object({
    title: z
      .string()
      .min(3, "Titulo deve ter pelo menos 3 caracteres")
      .max(200, "Titulo deve ter no maximo 200 caracteres"),
    description: z
      .string()
      .max(5000, "Descricao deve ter no maximo 5000 caracteres")
      .optional()
      .nullable(),
    content_type: z.nativeEnum(ContentType),
    content_url: z
      .string()
      .max(2000, "URL deve ter no maximo 2000 caracteres")
      .optional()
      .nullable()
      .or(z.literal("")),
    duration_seconds: z
      .number()
      .int("Duracao deve ser um numero inteiro")
      .min(0, "Duracao nao pode ser negativa")
      .optional()
      .nullable(),
    status: z.nativeEnum(ContentStatus).optional(),
  })
  .superRefine((data, ctx) => {
    // VIDEO: requires content_url and validates Bunny.net format
    if (data.content_type === ContentType.VIDEO) {
      if (!data.content_url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL do video e obrigatoria para aulas do tipo Video",
          path: ["content_url"],
        });
      } else if (!isValidVideoContent(data.content_url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Informe uma URL valida ou um ID de video Bunny.net (ex: 5f41bf1c-bc67-4155-b700-2aeb489dbeea)",
          path: ["content_url"],
        });
      }
    }

    // PDF: requires content_url and validates URL format
    if (data.content_type === ContentType.PDF) {
      if (!data.content_url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL do PDF e obrigatoria para aulas do tipo PDF",
          path: ["content_url"],
        });
      } else if (!isValidUrl(data.content_url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe uma URL valida para o PDF",
          path: ["content_url"],
        });
      }
    }

    // TEXT: requires description
    if (data.content_type === ContentType.TEXT && !data.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Descricao/conteudo e obrigatorio para aulas do tipo Texto",
        path: ["description"],
      });
    }

    // EMBED: requires content_url from allowed domains
    if (data.content_type === ContentType.EMBED) {
      if (!data.content_url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL do embed e obrigatoria para aulas do tipo Apresentacao",
          path: ["content_url"],
        });
      } else {
        // Try to extract URL from iframe HTML if user pasted the full code
        const extractedUrl = extractUrlFromIframe(data.content_url);
        if (!isAllowedEmbedUrl(extractedUrl)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Informe apenas a URL do embed (ex: https://gamma.app/embed/xyz). Dominios permitidos: gamma.app, canva.com, docs.google.com, figma.com, etc.",
            path: ["content_url"],
          });
        }
      }
    }
  });

type LessonFormData = z.infer<typeof lessonSchema>;

interface LessonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson?: Lesson | null;
  onSubmit: (data: CreateLessonRequest | UpdateLessonRequest) => Promise<void>;
  isSubmitting?: boolean;
}

export function LessonForm({
  open,
  onOpenChange,
  lesson,
  onSubmit,
  isSubmitting = false,
}: LessonFormProps) {
  const isEditing = !!lesson;
  const [videoSelectorOpen, setVideoSelectorOpen] = useState(false);

  const form = useForm<LessonFormData>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      title: "",
      description: "",
      content_type: ContentType.VIDEO,
      content_url: "",
      duration_seconds: null,
      status: ContentStatus.DRAFT,
    },
  });

  // Handler for video selection from modal
  const handleVideoSelect = (video: VideoItem) => {
    form.setValue("content_url", video.video_id, { shouldValidate: true });
    // Auto-fill duration if available
    if (video.length > 0) {
      form.setValue("duration_seconds", video.length, { shouldValidate: true });
    }
  };

  // Watch content_type for dynamic label updates
  const contentType = form.watch("content_type");

  // Determine which fields are required based on content_type
  const isUrlRequired =
    contentType === ContentType.VIDEO ||
    contentType === ContentType.PDF ||
    contentType === ContentType.EMBED;
  const isDescriptionRequired = contentType === ContentType.TEXT;

  useEffect(() => {
    if (lesson) {
      form.reset({
        title: lesson.title,
        description: lesson.description || "",
        content_type: lesson.content_type,
        content_url: lesson.content_url || "",
        duration_seconds: lesson.duration_seconds,
        status: lesson.status,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        content_type: ContentType.VIDEO,
        content_url: "",
        duration_seconds: null,
        status: ContentStatus.DRAFT,
      });
    }
  }, [lesson, form]);

  const handleSubmit = async (data: LessonFormData) => {
    const submitData = {
      title: data.title,
      description: data.description || null,
      content_type: data.content_type,
      content_url: data.content_url || null,
      duration_seconds: data.duration_seconds ?? null,
      ...(isEditing && { status: data.status }),
    };

    await onSubmit(submitData);
    form.reset();
    onOpenChange(false);
  };

  const contentTypeOptions = [
    { value: ContentType.VIDEO, label: "Video" },
    { value: ContentType.TEXT, label: "Texto" },
    { value: ContentType.QUIZ, label: "Quiz" },
    { value: ContentType.PDF, label: "PDF" },
    { value: ContentType.EMBED, label: "Apresentacao" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={isEditing ? "sm:max-w-[600px] max-h-[90vh] overflow-y-auto" : "sm:max-w-[500px]"}
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Aula" : "Criar Aula"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes da aula"
              : "Preencha as informacoes para criar uma nova aula"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titulo *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Introducao aos Antibioticos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Conteudo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descricao {isDescriptionRequired && <span className="text-destructive">*</span>}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={
                        isDescriptionRequired
                          ? "Conteudo da aula em texto (obrigatorio)..."
                          : "Descreva o conteudo da aula..."
                      }
                      className="min-h-[80px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  {isDescriptionRequired && (
                    <FormDescription>
                      Para aulas do tipo Texto, a descricao e o conteudo principal
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    URL do Conteudo {isUrlRequired && <span className="text-destructive">*</span>}
                  </FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="text"
                        placeholder={
                          contentType === ContentType.VIDEO
                            ? "ID do video ou URL (obrigatorio)"
                            : contentType === ContentType.PDF
                              ? "URL do PDF (obrigatorio)"
                              : contentType === ContentType.EMBED
                                ? "URL do embed (gamma.app, canva.com, etc.)"
                                : "URL do conteudo (opcional)"
                        }
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    {contentType === ContentType.VIDEO && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setVideoSelectorOpen(true)}
                        title="Selecionar video da biblioteca"
                      >
                        <Video className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormDescription>
                    {contentType === ContentType.VIDEO
                      ? "ID do video Bunny.net, URL de embed/play, ou clique no icone para selecionar"
                      : contentType === ContentType.PDF
                        ? "URL do arquivo PDF"
                        : contentType === ContentType.EMBED
                          ? "URL de apresentacao (Gamma, Canva, Google Slides, Figma, etc.)"
                          : "URL do conteudo (opcional)"}
                  </FormDescription>
                  <FormMessage />

                  {/* Video thumbnail preview */}
                  {contentType === ContentType.VIDEO && field.value && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-muted-foreground">Preview da thumbnail:</p>
                      <VideoThumbnail
                        contentUrl={field.value}
                        size="lg"
                        showPlayIcon={false}
                        containerClassName="max-w-[200px]"
                      />
                    </div>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="duration_seconds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duracao (segundos)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Ex: 300 (5 minutos)"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === "" ? null : Number.parseInt(value, 10));
                      }}
                    />
                  </FormControl>
                  <FormDescription>Duracao em segundos (para videos e audios)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEditing && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ContentStatus.DRAFT}>Rascunho</SelectItem>
                        <SelectItem value={ContentStatus.PUBLISHED}>Publicado</SelectItem>
                        <SelectItem value={ContentStatus.ARCHIVED}>Arquivado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Attachments section (only when editing) */}
            {isEditing && lesson && (
              <div className="pt-4 border-t">
                <AttachmentsSection
                  entityType={EntityType.LESSON}
                  entityId={lesson.id}
                  title="Materiais da Aula"
                  className="border-0 shadow-none"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {/* Video selector modal */}
        <VideoSelectorModal
          open={videoSelectorOpen}
          onOpenChange={setVideoSelectorOpen}
          onSelect={handleVideoSelect}
          selectedVideoId={form.watch("content_url")}
        />
      </DialogContent>
    </Dialog>
  );
}

export default LessonForm;
