/**
 * Dialog for granting access to a course.
 *
 * Features:
 * - Search users by email/name
 * - Grant permanent or temporary access
 * - Add optional notes
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { acquisitionsAdminApi } from "@/lib/acquisitions-api";
import { usersAdminApi } from "@/lib/users-api";
import type { User } from "@/types/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const grantAccessSchema = z.object({
  user_id: z.string().min(1, "Selecione um usuario"),
  access_type: z.enum(["permanent", "temporary"]),
  expires_in_days: z.coerce
    .number()
    .min(1)
    .max(365)
    .nullable()
    .transform((v) => v ?? null),
  notes: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => v || null),
});

interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  onSuccess?: () => void;
}

export function GrantAccessDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  onSuccess,
}: GrantAccessDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const form = useForm({
    resolver: zodResolver(grantAccessSchema),
    defaultValues: {
      user_id: "",
      access_type: "permanent" as const,
      expires_in_days: null as number | null,
      notes: null as string | null,
    },
  });

  const accessType = form.watch("access_type");

  // Search users with debounce
  const searchUsers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const result = await usersAdminApi.searchUsers({
        search: term,
        role: "student",
        limit: 10,
      });
      setSearchResults(result.items);
    } catch {
      toast.error("Erro ao buscar usuarios");
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, searchUsers]);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    form.setValue("user_id", user.id);
    setSearchResults([]);
    setSearchTerm("");
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    try {
      await acquisitionsAdminApi.grantAccess({
        user_id: data.user_id,
        course_id: courseId,
        expires_in_days: data.access_type === "temporary" ? data.expires_in_days : null,
        notes: data.notes,
      });

      toast.success("Acesso concedido com sucesso");
      form.reset();
      setSelectedUser(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao conceder acesso";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
      setSelectedUser(null);
      setSearchTerm("");
      setSearchResults([]);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Conceder Acesso
          </DialogTitle>
          <DialogDescription>Conceder acesso ao curso &quot;{courseTitle}&quot;</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User search */}
            <FormField
              control={form.control}
              name="user_id"
              render={() => (
                <FormItem>
                  <FormLabel>Usuario *</FormLabel>
                  {selectedUser ? (
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{selectedUser.name}</p>
                        <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(null);
                          form.setValue("user_id", "");
                        }}
                      >
                        Alterar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por email ou nome..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9"
                        />
                        {isSearching && (
                          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" />
                        )}
                      </div>
                      {searchResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-md border">
                          {searchResults.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-muted"
                              onClick={() => handleSelectUser(user)}
                            >
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Access type */}
            <FormField
              control={form.control}
              name="access_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Acesso</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="permanent" id="permanent" />
                        <Label htmlFor="permanent">Permanente</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="temporary" id="temporary" />
                        <Label htmlFor="temporary">Temporario</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expiration days (only for temporary) */}
            {accessType === "temporary" && (
              <FormField
                control={form.control}
                name="expires_in_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expira em (dias)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value?.toString() ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o prazo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="7">7 dias</SelectItem>
                        <SelectItem value="14">14 dias</SelectItem>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="60">60 dias</SelectItem>
                        <SelectItem value="90">90 dias</SelectItem>
                        <SelectItem value="180">180 dias</SelectItem>
                        <SelectItem value="365">365 dias</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Apos esse prazo o acesso sera automaticamente revogado
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Motivo da concessao, observacoes..."
                      className="min-h-[80px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Anotacoes internas sobre esta concessao de acesso
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedUser}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conceder Acesso
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default GrantAccessDialog;
