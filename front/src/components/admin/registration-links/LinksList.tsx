/**
 * List of registration links with filtering and actions.
 */
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type RegistrationLink, registrationLinksApi } from "@/lib/registration-links-api";
import { Copy, ExternalLink, GraduationCap, Link2Off, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LinkStatusBadge } from "./LinkStatusBadge";
import { RevokeLinkDialog } from "./RevokeLinkDialog";

interface LinksListProps {
  statusFilter?: "pending" | "used" | "expired" | "revoked";
  onRefreshRequest?: () => void;
}

export function LinksList({ statusFilter, onRefreshRequest }: LinksListProps) {
  const [links, setLinks] = useState<RegistrationLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    link: RegistrationLink | null;
  }>({ open: false, link: null });

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await registrationLinksApi.listLinks({
        ...(statusFilter ? { status: statusFilter } : {}),
        limit: 50,
      });
      setLinks(response.items);
    } catch (error) {
      console.error("Failed to fetch links:", error);
      toast.error("Erro ao carregar links");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleCopyLink = async (link: RegistrationLink) => {
    const url = `${window.location.origin}/cadastrar/${link.shortcode}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleRevokeClick = (link: RegistrationLink) => {
    setRevokeDialog({ open: true, link });
  };

  const handleRevokeConfirm = async () => {
    if (!revokeDialog.link) return;

    try {
      await registrationLinksApi.revokeLink(revokeDialog.link.id);
      toast.success("Link revogado com sucesso");
      setRevokeDialog({ open: false, link: null });
      fetchLinks();
      onRefreshRequest?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao revogar link";
      toast.error(message);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <GraduationCap className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Nenhum link encontrado</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={fetchLinks}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cursos</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-mono font-medium">{link.shortcode}</TableCell>
                <TableCell>
                  <LinkStatusBadge status={link.status} />
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">
                        {link.courses.length} curso{link.courses.length !== 1 && "s"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <ul className="text-xs">
                        {link.courses.map((course) => (
                          <li key={course.id}>{course.title}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(link.created_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(link.expires_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {link.status === "pending" && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => handleCopyLink(link)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar link</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`/cadastrar/${link.shortcode}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir link</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRevokeClick(link)}
                            >
                              <Link2Off className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Revogar link</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    {link.status === "used" && link.user_email && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help text-xs text-muted-foreground">
                            {link.user_name || link.user_email}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Usado por: {link.user_email}
                          {link.used_at && (
                            <>
                              <br />
                              Em: {formatDate(link.used_at)}
                            </>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RevokeLinkDialog
        open={revokeDialog.open}
        onOpenChange={(open) => setRevokeDialog({ open, link: open ? revokeDialog.link : null })}
        link={revokeDialog.link}
        onConfirm={handleRevokeConfirm}
      />
    </TooltipProvider>
  );
}
