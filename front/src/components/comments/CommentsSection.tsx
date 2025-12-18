/**
 * Comments section component for lessons.
 *
 * Features:
 * - List comments with infinite scroll
 * - Create new comments
 * - Real-time comment count
 * - Error handling
 * - Authentication awareness
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useComments } from "@/hooks/useComments";
import { AlertCircle, Loader2, LogIn, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { CommentItem } from "./CommentItem";

interface CommentsSectionProps {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
}

function getInitials(name: string | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CommentsSection({ lessonId, courseSlug, lessonSlug }: CommentsSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const {
    comments,
    total,
    hasMore,
    isLoading,
    isSubmitting,
    error,
    createComment,
    loadMore,
    refresh,
    clearError,
  } = useComments(lessonId, courseSlug, lessonSlug);

  const [newComment, setNewComment] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newComment.trim()) return;

      try {
        await createComment(newComment.trim());
        setNewComment("");
      } catch {
        // Error handled by store
      }
    },
    [newComment, createComment],
  );

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      loadMore();
    }
  }, [isLoading, hasMore, loadMore]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5" />
              Comentarios
              {total > 0 && (
                <span className="text-sm font-normal text-muted-foreground">({total})</span>
              )}
            </CardTitle>
            <CardDescription>Deixe sua duvida ou comentario sobre esta aula</CardDescription>
          </div>
          {comments.length > 0 && (
            <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button variant="ghost" size="sm" onClick={clearError}>
                Fechar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* New comment form */}
        {isAuthenticated ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {user ? getInitials(user.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <Textarea
                placeholder="Escreva seu comentario..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                disabled={isSubmitting}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isSubmitting || !newComment.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <LogIn className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Faca login para comentar nesta aula
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/entrar">Entrar</Link>
            </Button>
          </div>
        )}

        <Separator />

        {/* Comments list */}
        {isLoading && comments.length === 0 ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          // Empty state
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum comentario ainda</p>
            <p className="text-xs">Seja o primeiro a comentar!</p>
          </div>
        ) : (
          // Comments list
          <div className="divide-y">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                lessonId={lessonId}
                courseSlug={courseSlug}
                lessonSlug={lessonSlug}
                parentId={null}
                depth={0}
                maxDepth={3}
                onCreateComment={createComment}
                isCreatingComment={isSubmitting}
              />
            ))}
          </div>
        )}

        {/* Load more button */}
        {hasMore && comments.length > 0 && (
          <div className="text-center pt-4">
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                "Carregar mais comentarios"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CommentsSection;
