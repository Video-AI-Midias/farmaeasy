/**
 * Module form component for creating and editing modules.
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
  type CreateModuleRequest,
  type Module,
  type UpdateModuleRequest,
} from "@/types/courses";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const moduleSchema = z.object({
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

type ModuleFormData = z.infer<typeof moduleSchema>;

interface ModuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module?: Module | null;
  onSubmit: (data: CreateModuleRequest | UpdateModuleRequest) => Promise<void>;
  isSubmitting?: boolean;
}

export function ModuleForm({
  open,
  onOpenChange,
  module,
  onSubmit,
  isSubmitting = false,
}: ModuleFormProps) {
  const isEditing = !!module;

  const form = useForm<ModuleFormData>({
    resolver: zodResolver(moduleSchema),
    defaultValues: {
      title: "",
      description: "",
      thumbnail_url: "",
      status: ContentStatus.DRAFT,
    },
  });

  useEffect(() => {
    if (module) {
      form.reset({
        title: module.title,
        description: module.description || "",
        thumbnail_url: module.thumbnail_url || "",
        status: module.status,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        thumbnail_url: "",
        status: ContentStatus.DRAFT,
      });
    }
  }, [module, form]);

  const handleSubmit = async (data: ModuleFormData) => {
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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Modulo" : "Criar Modulo"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes do modulo"
              : "Preencha as informacoes para criar um novo modulo"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 overflow-hidden">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titulo *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Fundamentos de Quimica" {...field} />
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
                      placeholder="Descreva o conteudo do modulo..."
                      className="min-h-[100px] max-h-[200px] resize-y"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Uma breve descricao do que sera abordado neste modulo
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
                      entityType="module"
                      entityId={module?.id ?? "new"}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>Imagem de capa do modulo (upload ou URL)</FormDescription>
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

export default ModuleForm;
