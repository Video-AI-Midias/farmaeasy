/**
 * Individual comment component with nested replies.
 *
 * Features:
 * - Display author info and content
 * - Edit and delete own comments
 * - Reactions with emoji picker
 * - Reply functionality with nested display
 * - Report functionality
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useComment } from "@/hooks/useComments";
import { cn } from "@/lib/utils";
import type { Comment, ReportReason } from "@/types/comments";
import {
  ChevronDown,
  Flag,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ReactionPicker } from "./ReactionPicker";
import { ReportDialog } from "./ReportDialog";

interface CommentItemProps {
  comment: Comment;
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  parentId?: string | null;
  depth?: number;
  maxDepth?: number;
  /** Create comment action passed from parent to avoid multiple useComments hook calls */
  onCreateComment: (
    content: string,
    options?: { parentId?: string; rating?: number; isReview?: boolean },
  ) => Promise<Comment>;
  /** Whether a comment is being created */
  isCreatingComment: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "agora";
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
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

export function CommentItem({
  comment,
  lessonId,
  courseSlug,
  lessonSlug,
  parentId = null,
  depth = 0,
  maxDepth = 3,
  onCreateComment,
  isCreatingComment,
}: CommentItemProps) {
  const { user, isAuthenticated } = useAuth();

  const {
    replies,
    hasMoreReplies,
    repliesLoaded,
    repliesLoading,
    isEditing,
    isReplying,
    isSubmitting,
    updateComment,
    deleteComment,
    toggleReaction,
    reportComment,
    fetchReplies,
    loadMoreReplies,
    startEditing,
    cancelEditing,
    startReplying,
    cancelReplying,
  } = useComment(comment.id, lessonId, parentId, comment.created_at, courseSlug, lessonSlug);

  const [editContent, setEditContent] = useState(comment.content);
  const [replyContent, setReplyContent] = useState("");
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  const isOwner = user?.id === comment.author.id;
  const isDeleted = comment.is_deleted;
  const canReply = depth < maxDepth && !isDeleted;

  // Auto-fetch preview reply when comment has replies
  useEffect(() => {
    if (comment.reply_count > 0 && !repliesLoaded) {
      fetchReplies();
    }
  }, [comment.reply_count, repliesLoaded, fetchReplies]);

  // Preview: show only 1 reply, full: show all loaded replies
  const previewReply = replies[0];
  const remainingRepliesCount = comment.reply_count - 1;
  const canLoadMoreReplies = remainingRepliesCount > 0 || hasMoreReplies;

  // Handle edit submit
  const handleEditSubmit = useCallback(async () => {
    if (!editContent.trim() || editContent === comment.content) {
      cancelEditing();
      return;
    }

    try {
      await updateComment(editContent.trim());
    } catch {
      // Error handled by store
    }
  }, [editContent, comment.content, updateComment, cancelEditing]);

  // Handle reply submit
  const handleReplySubmit = useCallback(async () => {
    if (!replyContent.trim()) return;

    try {
      await onCreateComment(replyContent.trim(), { parentId: comment.id });
      setReplyContent("");
      cancelReplying();
      setShowAllReplies(true);
    } catch {
      // Error handled by store
    }
  }, [replyContent, onCreateComment, comment.id, cancelReplying]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    try {
      await deleteComment();
      setShowDeleteDialog(false);
    } catch {
      // Error handled by store
    }
  }, [deleteComment]);

  // Handle report
  const handleReport = useCallback(
    async (reason: ReportReason, description?: string) => {
      await reportComment(description ? { reason, description } : { reason });
    },
    [reportComment],
  );

  // Toggle showing all replies (beyond preview)
  const handleShowMoreReplies = useCallback(() => {
    setShowAllReplies(true);
    // Load more if API has more
    if (hasMoreReplies) {
      loadMoreReplies();
    }
  }, [hasMoreReplies, loadMoreReplies]);

  // Start editing with current content
  const handleStartEditing = useCallback(() => {
    setEditContent(comment.content);
    startEditing();
  }, [comment.content, startEditing]);

  // Start replying - pre-fill with @username mention
  const handleStartReplying = useCallback(() => {
    setReplyContent(`@${comment.author.name} `);
    startReplying();
    setShowAllReplies(true);
  }, [startReplying, comment.author.name]);

  if (isDeleted) {
    return (
      <div className="flex gap-3 py-3">
        <div className="w-8 h-8 rounded-full bg-muted" />
        <div className="flex-1">
          <p className="text-sm text-muted-foreground italic">[Comentario removido]</p>
          {/* Replies for deleted comment - show loading, preview, or expanded */}
          {(previewReply || repliesLoading) && (
            <div className="mt-3 pl-4 border-l-2 border-muted space-y-1">
              {/* Loading skeleton */}
              {repliesLoading && !previewReply && (
                <div className="flex gap-3 py-2">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              )}
              {/* Preview reply */}
              {previewReply && (
                <CommentItem
                  key={previewReply.id}
                  comment={previewReply}
                  lessonId={lessonId}
                  courseSlug={courseSlug}
                  lessonSlug={lessonSlug}
                  parentId={comment.id}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  onCreateComment={onCreateComment}
                  isCreatingComment={isCreatingComment}
                />
              )}
              {/* Show more replies button */}
              {canLoadMoreReplies && !showAllReplies && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShowMoreReplies}
                  className="h-7 px-2 text-xs text-primary"
                >
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Ver mais {remainingRepliesCount}{" "}
                  {remainingRepliesCount === 1 ? "resposta" : "respostas"}
                </Button>
              )}
              {/* All replies when expanded */}
              {showAllReplies &&
                replies
                  .slice(1)
                  .map((reply) => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      lessonId={lessonId}
                      courseSlug={courseSlug}
                      lessonSlug={lessonSlug}
                      parentId={comment.id}
                      depth={depth + 1}
                      maxDepth={maxDepth}
                      onCreateComment={onCreateComment}
                      isCreatingComment={isCreatingComment}
                    />
                  ))}
              {/* Load more from API */}
              {showAllReplies && hasMoreReplies && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMoreReplies}
                  disabled={repliesLoading}
                  className="h-7 px-2 text-xs"
                >
                  {repliesLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    "Carregar mais respostas"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3">
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={comment.author.avatar ?? undefined} alt={comment.author.name} />
        <AvatarFallback className="text-xs">{getInitials(comment.author.name)}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{comment.author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.created_at)}
          </span>
          {comment.is_edited && <span className="text-xs text-muted-foreground">(editado)</span>}
        </div>

        {/* Content or Edit Form */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              disabled={isSubmitting}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEditSubmit}
                disabled={isSubmitting || !editContent.trim()}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEditing} disabled={isSubmitting}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">{comment.content}</p>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {/* Reactions */}
            {isAuthenticated && (
              <ReactionPicker
                reactions={comment.reactions}
                userReaction={comment.user_reaction}
                onReact={(type) => toggleReaction(type, comment.user_reaction)}
                onRemoveReaction={() => {
                  if (comment.user_reaction) {
                    toggleReaction(comment.user_reaction, comment.user_reaction);
                  }
                }}
                disabled={isSubmitting}
              />
            )}

            {/* Reply button */}
            {canReply && isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartReplying}
                className="h-7 px-2 text-xs"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Responder
              </Button>
            )}

            {/* More actions menu */}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isOwner && (
                    <>
                      <DropdownMenuItem onClick={handleStartEditing}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {!isOwner && (
                    <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                      <Flag className="h-4 w-4 mr-2" />
                      Denunciar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Reply form */}
        {isReplying && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-xs">
                  {user ? getInitials(user.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Escreva sua resposta..."
                rows={2}
                disabled={isCreatingComment}
                autoFocus
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={cancelReplying}
                disabled={isCreatingComment}
              >
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleReplySubmit}
                disabled={isCreatingComment || !replyContent.trim()}
              >
                {isCreatingComment ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Responder
              </Button>
            </div>
          </div>
        )}

        {/* Replies - show loading skeleton, preview, or expanded view */}
        {(previewReply || repliesLoading) && (
          <div
            className={cn("mt-3 space-y-1", depth < maxDepth - 1 && "pl-4 border-l-2 border-muted")}
          >
            {/* Loading skeleton when fetching replies */}
            {repliesLoading && !previewReply && (
              <div className="flex gap-3 py-2">
                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            )}

            {/* Preview reply - always visible */}
            {previewReply && (
              <CommentItem
                key={previewReply.id}
                comment={previewReply}
                lessonId={lessonId}
                courseSlug={courseSlug}
                lessonSlug={lessonSlug}
                parentId={comment.id}
                depth={depth + 1}
                maxDepth={maxDepth}
                onCreateComment={onCreateComment}
                isCreatingComment={isCreatingComment}
              />
            )}

            {/* Show more replies button */}
            {canLoadMoreReplies && !showAllReplies && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShowMoreReplies}
                className="h-7 px-2 text-xs text-primary"
              >
                <ChevronDown className="h-3 w-3 mr-1" />
                Ver mais {remainingRepliesCount}{" "}
                {remainingRepliesCount === 1 ? "resposta" : "respostas"}
              </Button>
            )}

            {/* All replies when expanded */}
            {showAllReplies &&
              replies
                .slice(1)
                .map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    lessonId={lessonId}
                    courseSlug={courseSlug}
                    lessonSlug={lessonSlug}
                    parentId={comment.id}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    onCreateComment={onCreateComment}
                    isCreatingComment={isCreatingComment}
                  />
                ))}

            {/* Load more from API */}
            {showAllReplies && hasMoreReplies && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMoreReplies}
                disabled={repliesLoading}
                className="h-7 px-2 text-xs"
              >
                {repliesLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  "Carregar mais respostas"
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir comentario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. O comentario sera removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report dialog */}
      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        onSubmit={handleReport}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default CommentItem;
