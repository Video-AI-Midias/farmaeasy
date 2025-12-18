/**
 * Course form component for creating and editing courses.
 *
 * Uses React Hook Form with Zod validation.
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
import { ThumbnailUpload } from "@/components/ui/thumbnail-upload";
import {
  ContentStatus,
  type Course,
  type CreateCourseRequest,
  type UpdateCourseRequest,
} from "@/types/courses";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const courseSchema = z.object({
  title: z
    .string()
    .min(3, "Titulo deve ter pelo menos 3 caracteres")
    .max(200, "Titulo deve ter no maximo 200 caracteres"),
  description: z
    .string()
    .max(5000, "Descricao deve ter no maximo 5000 caracteres")
    .optional()
    .nullable(),
  thumbnail_url: z
    .string()
    .url("URL invalida")
    .max(500, "URL deve ter no maximo 500 caracteres")
    .optional()
    .nullable()
    .or(z.literal("")),
  status: z.nativeEnum(ContentStatus).optional(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface CourseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: Course | null;
  onSubmit: (data: CreateCourseRequest | UpdateCourseRequest) => Promise<void>;
  isSubmitting?: boolean;
}

export function CourseForm({
  open,
  onOpenChange,
  course,
  onSubmit,
  isSubmitting = false,
}: CourseFormProps) {
  const isEditing = !!course;

  const form = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      description: "",
      thumbnail_url: "",
      status: ContentStatus.DRAFT,
    },
  });

  useEffect(() => {
    if (course) {
      form.reset({
        title: course.title,
        description: course.description || "",
        thumbnail_url: course.thumbnail_url || "",
        status: course.status,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        thumbnail_url: "",
        status: ContentStatus.DRAFT,
      });
    }
  }, [course, form]);

  const handleSubmit = async (data: CourseFormData) => {
    const submitData = {
      title: data.title,
      description: data.description || null,
      thumbnail_url: data.thumbnail_url || null,
      ...(isEditing && { status: data.status }),
    };

    await onSubmit(submitData);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Curso" : "Criar Curso"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes do curso"
              : "Preencha as informacoes para criar um novo curso"}
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
                    <Input placeholder="Ex: Introducao a Farmacologia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descricao</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o conteudo do curso..."
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Uma descricao clara ajuda os alunos a entender o curso
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="thumbnail_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagem de Capa</FormLabel>
                  <FormControl>
                    <ThumbnailUpload
                      value={field.value}
                      onChange={field.onChange}
                      entityType="course"
                      entityId={course?.id ?? "new"}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>Imagem de capa do curso (upload ou URL)</FormDescription>
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
      </DialogContent>
    </Dialog>
  );
}

export default CourseForm;
