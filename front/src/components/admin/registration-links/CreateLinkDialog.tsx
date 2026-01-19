/**
 * Dialog for creating a new registration link.
 */
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { type CreateLinkResponse, registrationLinksApi } from "@/lib/registration-links-api";
import { applyPhoneMask } from "@/lib/validators";
import { CheckCircle2, Copy, ExternalLink, GraduationCap, Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Course {
  id: string;
  title: string;
  thumbnail_url?: string;
}

interface CreateLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateLinkDialog({ open, onOpenChange, onSuccess }: CreateLinkDialogProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [prefillPhone, setPrefillPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<CreateLinkResponse | null>(null);

  // Fetch available courses
  useEffect(() => {
    if (open && courses.length === 0) {
      const fetchCourses = async () => {
        setIsLoadingCourses(true);
        try {
          const response = await fetch("/api/v1/courses?published=true");
          const data = await response.json();
          setCourses(data.items || data || []);
        } catch (error) {
          console.error("Failed to fetch courses:", error);
          toast.error("Erro ao carregar cursos");
        } finally {
          setIsLoadingCourses(false);
        }
      };
      fetchCourses();
    }
  }, [open, courses.length]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrefillPhone(applyPhoneMask(e.target.value));
  };

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedCourseIds.length === 0) {
      toast.error("Selecione pelo menos um curso");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registrationLinksApi.createLink({
        course_ids: selectedCourseIds,
        expires_in_days: Number.parseInt(expiresInDays, 10),
        ...(prefillPhone ? { prefill_phone: prefillPhone } : {}),
        ...(notes ? { notes } : {}),
      });

      setCreatedLink(response);
      toast.success("Link criado com sucesso!");
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar link";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (createdLink) {
      await navigator.clipboard.writeText(createdLink.url);
      toast.success("Link copiado!");
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedCourseIds([]);
      setExpiresInDays("7");
      setPrefillPhone("");
      setNotes("");
      setCreatedLink(null);
      onOpenChange(false);
    }
  };

  // Success view
  if (createdLink) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Link Criado com Sucesso!
            </DialogTitle>
            <DialogDescription>
              Compartilhe este link com o cliente para que ele complete o cadastro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
              <code className="flex-1 truncate text-sm">{createdLink.url}</code>
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                <strong>Shortcode:</strong> {createdLink.shortcode}
              </p>
              <p>
                <strong>Expira em:</strong>{" "}
                {new Date(createdLink.expires_at).toLocaleDateString("pt-BR")}
              </p>
              <p>
                <strong>Cursos:</strong> {createdLink.courses.map((c) => c.title).join(", ")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Fechar
            </Button>
            <Button asChild>
              <a href={createdLink.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir Link
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Criar Link de Cadastro
          </DialogTitle>
          <DialogDescription>
            Gere um link para o cliente completar seu cadastro e receber acesso aos cursos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Course selection */}
          <div className="space-y-2">
            <Label>Cursos a liberar *</Label>
            {isLoadingCourses ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum curso disponivel</p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                {courses.map((course) => (
                  <label
                    key={course.id}
                    htmlFor={`course-${course.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`course-${course.id}`}
                      checked={selectedCourseIds.includes(course.id)}
                      onCheckedChange={() => toggleCourse(course.id)}
                    />
                    <div className="flex items-center gap-2">
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt=""
                          className="h-8 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-10 items-center justify-center rounded bg-primary/10">
                          <GraduationCap className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <span className="text-sm">{course.title}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {selectedCourseIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedCourseIds.length} curso(s) selecionado(s)
              </p>
            )}
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expires">Expira em</Label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger id="expires">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="3">3 dias</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prefill phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp do cliente (opcional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={prefillPhone}
              onChange={handlePhoneChange}
            />
            <p className="text-xs text-muted-foreground">
              Sera pre-preenchido no formulario de cadastro
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observacoes (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Notas internas sobre este link..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px] resize-none"
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedCourseIds.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Criar Link
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
