/**
 * Student lesson viewing page with video player.
 *
 * Features:
 * - Bunny.net video player for video lessons
 * - Text/PDF content display
 * - Navigation between lessons
 * - Progress tracking with completion on video end
 * - Resume from last position
 * - Autoplay between lessons
 * - Completion overlay positioned OVER the video player
 * - Sidebar with course structure and progress indicators
 * - Comments section
 */

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CommentsSection } from "@/components/comments";
import { AppLayout } from "@/components/layout";
import {
  CompletionOverlay,
  LessonProgressIndicator,
  MarkCompleteButton,
} from "@/components/progress";
import { LessonReviewOverlay } from "@/components/reviews";
import { CourseAccessDenied } from "@/components/student";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TruncatedText } from "@/components/ui/truncated-text";
import BunnyPlayer from "@/components/video/BunnyPlayer";
import { useComments } from "@/hooks/useComments";
import {
  useAutoplay,
  useCompletionOverlay,
  useProgress,
  useVideoProgress,
} from "@/hooks/useProgress";
import { useSignedVideoUrl } from "@/hooks/useSignedVideoUrl";
import { acquisitionsApi } from "@/lib/acquisitions-api";
import { cn } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import type { CheckAccessResponse } from "@/types/acquisitions";
import {
  ContentType,
  type CourseDetail,
  type LessonInModule,
  type ModuleInCourse,
} from "@/types/courses";
import { LessonProgressStatus } from "@/types/progress";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileIcon,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Menu,
  Play,
  PlayCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

// ==============================================================================
// Helper Functions
// ==============================================================================

/**
 * Converts plain text with URLs into JSX with clickable links.
 * Detects URLs in text and wraps them in anchor tags.
 */
function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return null;

  // Regex to detect URLs (http, https, www)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex);

  if (!matches) {
    return text;
  }

  let urlCounter = 0;
  let textCounter = 0;

  return parts.map((part) => {
    // Check if this part is a URL
    if (matches.includes(part)) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      const key = `link-${urlCounter++}-${part.slice(0, 20)}`;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80"
        >
          {part}
        </a>
      );
    }
    const key = `text-${textCounter++}-${part.slice(0, 20)}`;
    return <span key={key}>{part}</span>;
  });
}

// Content type icons mapping
const contentTypeIcons: Record<ContentType, typeof PlayCircle> = {
  [ContentType.VIDEO]: PlayCircle,
  [ContentType.TEXT]: FileText,
  [ContentType.QUIZ]: HelpCircle,
  [ContentType.PDF]: FileIcon,
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  if (remainingSeconds === 0) return `${minutes}min`;
  return `${minutes}min ${remainingSeconds}s`;
}

// Find lesson info within course structure
function findLessonInCourse(
  course: CourseDetail,
  lessonSlugOrId: string,
): {
  lesson: LessonInModule;
  module: ModuleInCourse;
  lessonIndex: number;
  moduleIndex: number;
  prev: { lesson: LessonInModule; module: ModuleInCourse } | null;
  next: { lesson: LessonInModule; module: ModuleInCourse } | null;
} | null {
  // Flatten all valid lessons with their context
  const allLessons: {
    lesson: LessonInModule;
    module: ModuleInCourse;
    moduleIndex: number;
    lessonIndex: number;
  }[] = [];

  course.modules.forEach((mod, modIdx) => {
    mod.lessons
      .filter((les) => les.is_valid)
      .forEach((les, lesIdx) => {
        allLessons.push({
          lesson: les,
          module: mod,
          moduleIndex: modIdx,
          lessonIndex: lesIdx,
        });
      });
  });

  const currentIndex = allLessons.findIndex(
    (item) => item.lesson.slug === lessonSlugOrId || item.lesson.id === lessonSlugOrId,
  );

  if (currentIndex === -1) return null;

  const current = allLessons[currentIndex];
  if (!current) return null;

  const prevItem = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextItem = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  return {
    lesson: current.lesson,
    module: current.module,
    lessonIndex: current.lessonIndex,
    moduleIndex: current.moduleIndex,
    prev: prevItem ? { lesson: prevItem.lesson, module: prevItem.module } : null,
    next: nextItem ? { lesson: nextItem.lesson, module: nextItem.module } : null,
  };
}

// Sidebar component for course structure
function CourseSidebar({
  course,
  currentLessonId,
  cursoSlug,
  isOpen,
  onClose,
  getLessonStatus,
  getLessonProgressPercent,
  recentlyCompletedLessonId,
}: {
  course: CourseDetail;
  currentLessonId: string;
  cursoSlug: string;
  isOpen: boolean;
  onClose: () => void;
  getLessonStatus: (lessonId: string) => LessonProgressStatus;
  getLessonProgressPercent: (lessonId: string) => number;
  /** ID of lesson that was just completed (for highlight animation) */
  recentlyCompletedLessonId: string | null;
}) {
  const navigate = useNavigate();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Expand module containing current lesson
  useEffect(() => {
    const moduleWithLesson = course.modules.find((m) =>
      m.lessons.some((l) => l.id === currentLessonId),
    );
    if (moduleWithLesson) {
      setExpandedModules((prev) => new Set([...prev, moduleWithLesson.id]));
    }
  }, [course.modules, currentLessonId]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Calculate module progress from actual lesson status (not backend value)
  // Only count valid lessons
  const getModuleProgress = (moduleId: string) => {
    const module = course.modules.find((m) => m.id === moduleId);
    if (!module) return 0;

    const validLessons = module.lessons.filter((l) => l.is_valid);
    if (validLessons.length === 0) return 0;

    const completedLessons = validLessons.filter(
      (l) => getLessonStatus(l.id) === LessonProgressStatus.COMPLETED,
    ).length;

    return (completedLessons / validLessons.length) * 100;
  };

  // Calculate overall course progress from actual data (not backend value)
  // Only count valid lessons
  const validLessonsInCourse = course.modules.flatMap((m) => m.lessons.filter((l) => l.is_valid));
  const totalLessons = validLessonsInCourse.length;
  const completedLessons = validLessonsInCourse.filter(
    (l) => getLessonStatus(l.id) === LessonProgressStatus.COMPLETED,
  ).length;
  const overallProgress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-label="Fechar menu"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-80 bg-background border-r transform transition-transform lg:relative lg:transform-none lg:z-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b lg:hidden">
          <span className="font-medium">Conteudo do Curso</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 border-b">
          <Link
            to={`/aprender/${cursoSlug}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao curso
          </Link>
          <TruncatedText lines={2} className="font-semibold mt-2">
            {course.title}
          </TruncatedText>
          {/* Course progress bar (calculated from actual lesson completion) */}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span>{Math.round(overallProgress)}%</span>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-2">
            {course.modules.map((module, modIndex) => {
              const isExpanded = expandedModules.has(module.id);
              const moduleProgress = getModuleProgress(module.id);

              return (
                <Collapsible
                  key={module.id}
                  open={isExpanded}
                  onOpenChange={() => toggleModule(module.id)}
                >
                  <CollapsibleTrigger className="flex w-full items-center gap-2 p-2 rounded-md hover:bg-muted text-left">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                      {modIndex + 1}
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">{module.title}</span>
                    {moduleProgress > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(moduleProgress)}%
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                    />
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="ml-4 pl-4 border-l">
                      {module.lessons
                        .filter((lesson) => lesson.is_valid)
                        .map((lesson) => {
                          const isActive = lesson.id === currentLessonId;
                          const status = getLessonStatus(lesson.id);
                          const progressPercent = getLessonProgressPercent(lesson.id);
                          const isJustCompleted = lesson.id === recentlyCompletedLessonId;

                          return (
                            <button
                              type="button"
                              key={lesson.id}
                              onClick={() => {
                                navigate(`/aprender/${cursoSlug}/aula/${lesson.slug || lesson.id}`);
                                onClose();
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 p-2 rounded-md text-sm text-left transition-colors",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
                                isJustCompleted && "animate-highlight-pulse",
                              )}
                            >
                              {/* Progress indicator */}
                              <LessonProgressIndicator
                                status={status}
                                progressPercent={progressPercent}
                                size="sm"
                                animate={isJustCompleted}
                              />
                              <span className="flex-1 truncate">{lesson.title}</span>
                              {lesson.duration_seconds && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatDuration(lesson.duration_seconds)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}

// Video lesson content with progress tracking
function VideoContent({
  lesson,
  courseId,
  moduleId,
  onComplete,
  startTime,
  showOverlay,
  hasNextLesson,
  autoplayCountdown,
  isAutoplayActive,
  isUpdating,
  onRewatch,
  onNextLesson,
  onCancelAutoplay,
  onCloseOverlay,
}: {
  lesson: LessonInModule;
  courseId: string;
  moduleId: string;
  onComplete?: () => void;
  startTime?: number;
  // Overlay props - rendered inside video container
  showOverlay: boolean;
  hasNextLesson: boolean;
  autoplayCountdown: number;
  isAutoplayActive: boolean;
  isUpdating: boolean;
  onRewatch: () => void;
  onNextLesson: () => void;
  onCancelAutoplay: () => void;
  onCloseOverlay: () => void;
}) {
  // Track if completion was already triggered to prevent double calls
  const hasCompletedRef = useRef(false);

  // Fetch signed URL from backend
  const { embedUrl, isLoading, error, refetch } = useSignedVideoUrl(lesson.content_url, {
    preferHls: false,
    autoplay: false,
  });

  // Completion handler - called when video reaches threshold OR ends
  // Uses ref to prevent double completion (threshold + ended events)
  const handleCompletion = useCallback(() => {
    if (hasCompletedRef.current) {
      console.log("[VideoContent] Already completed, skipping...");
      return;
    }
    hasCompletedRef.current = true;
    console.log("[VideoContent] Triggering completion...");
    onComplete?.();
  }, [onComplete]);

  // Video progress tracking - WITH onComplete at 90% threshold
  // This ensures lesson is marked complete even if onEnded doesn't fire
  const { updateProgress } = useVideoProgress(lesson.id, courseId, moduleId, {
    onComplete: handleCompletion,
    completionThreshold: 90,
  });

  // Track if we've set the start time
  const hasSetStartTime = useRef(false);

  // Memoize callbacks to prevent BunnyPlayer re-renders
  const handleVideoProgress = useCallback(
    (_progress: number, currentTime: number, duration: number) => {
      console.log("[VideoContent] handleVideoProgress called:", {
        progress: _progress,
        currentTime,
        duration,
      });
      updateProgress(currentTime, duration);
    },
    [updateProgress],
  );

  // Trigger completion when video ENDS (backup to threshold completion)
  const handleVideoEnded = useCallback(() => {
    console.log("[VideoContent] Video ENDED - triggering completion");
    handleCompletion();
  }, [handleCompletion]);

  // Reset flags when lesson changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetting on lesson change is intentional
  useEffect(() => {
    hasSetStartTime.current = false;
    hasCompletedRef.current = false;
  }, [lesson.id]);

  if (!lesson.content_url) {
    return (
      <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
        <div className="text-center text-muted-foreground">
          <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Video nao disponivel</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
        <div className="text-center text-muted-foreground">
          <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin" />
          <p>Carregando video...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
        <div className="text-center text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-2 text-destructive" />
          <p className="text-destructive font-medium">Erro ao carregar video</p>
          <p className="text-sm mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!embedUrl) {
    return (
      <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
        <div className="text-center text-muted-foreground">
          <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Video nao disponivel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <BunnyPlayer
        src={embedUrl}
        title={lesson.title}
        onProgress={handleVideoProgress}
        onEnded={handleVideoEnded}
        {...(startTime && startTime > 0 && { startTime })}
        showSpeed
        captions
        rememberPosition={false} // We handle this ourselves
        chromecast
      />
      {/* Completion overlay - positioned over the video */}
      {showOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm z-40 rounded-lg">
          {/* Close button */}
          <button
            type="button"
            onClick={onCloseOverlay}
            className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Completion icon */}
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary">
            <CheckCircle2 className="h-7 w-7 text-primary-foreground" />
          </div>

          {/* Completion message */}
          <h3 className="mb-1 text-lg font-semibold text-white">Aula Concluída!</h3>
          <p className="mb-6 text-sm text-white/70">
            {hasNextLesson ? "Continue para a próxima aula" : "Você concluiu todas as aulas"}
          </p>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onRewatch}
              disabled={isUpdating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white border border-white/30 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reassistir
            </button>
            {hasNextLesson && (
              <button
                type="button"
                onClick={onNextLesson}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Próxima Aula
              </button>
            )}
          </div>

          {/* Autoplay countdown - shows for both "next lesson" and "auto-hide" cases */}
          {isAutoplayActive && autoplayCountdown > 0 && (
            <div className="mt-4 flex flex-col items-center">
              <p className="text-sm text-white/70">
                {hasNextLesson ? "Próxima aula em " : "Fechando em "}
                <span className="font-mono text-base text-white">{autoplayCountdown}</span> segundos
              </p>
              <button
                type="button"
                onClick={onCancelAutoplay}
                className="mt-1 text-xs text-white/50 underline hover:text-white/70 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Text lesson content
function TextContent({
  lesson,
  onMarkComplete,
  onMarkIncomplete,
  status,
  isUpdating,
}: {
  lesson: LessonInModule;
  onMarkComplete: () => void;
  onMarkIncomplete: () => void;
  status: LessonProgressStatus;
  isUpdating: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {lesson.description ? (
          <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
            {lesson.description}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Conteudo de texto nao disponivel</p>
          </div>
        )}
        <div className="mt-6 pt-6 border-t">
          <MarkCompleteButton
            status={status}
            isLoading={isUpdating}
            onMarkComplete={onMarkComplete}
            onMarkIncomplete={onMarkIncomplete}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// PDF lesson content
function PDFContent({
  lesson,
  onMarkComplete,
  onMarkIncomplete,
  status,
  isUpdating,
}: {
  lesson: LessonInModule;
  onMarkComplete: () => void;
  onMarkIncomplete: () => void;
  status: LessonProgressStatus;
  isUpdating: boolean;
}) {
  if (!lesson.content_url) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>PDF nao disponivel</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="aspect-[3/4] w-full">
        <iframe
          src={lesson.content_url}
          title={lesson.title}
          className="w-full h-full rounded-lg border"
        />
      </div>
      <MarkCompleteButton
        status={status}
        isLoading={isUpdating}
        onMarkComplete={onMarkComplete}
        onMarkIncomplete={onMarkIncomplete}
      />
    </div>
  );
}

// Quiz lesson content placeholder
function QuizContent({
  onMarkComplete,
  onMarkIncomplete,
  status,
  isUpdating,
}: {
  onMarkComplete: () => void;
  onMarkIncomplete: () => void;
  status: LessonProgressStatus;
  isUpdating: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <HelpCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Quiz em desenvolvimento</p>
        <p className="text-sm mt-1">Este recurso estara disponivel em breve</p>
        <div className="mt-6">
          <MarkCompleteButton
            status={status}
            isLoading={isUpdating}
            onMarkComplete={onMarkComplete}
            onMarkIncomplete={onMarkIncomplete}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function StudentLessonViewContent() {
  const { cursoSlug, aulaSlug } = useParams<{ cursoSlug: string; aulaSlug: string }>();
  const navigate = useNavigate();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showReviewOverlay, setShowReviewOverlay] = useState(false);
  const [recentlyCompletedLessonId, setRecentlyCompletedLessonId] = useState<string | null>(null);
  const [accessInfo, setAccessInfo] = useState<CheckAccessResponse | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  const { currentCourse, isLoadingCourse, error, fetchCourse, clearError } = useCoursesStore();

  // Progress tracking
  const {
    isUpdating,
    getLessonStatus,
    getLessonProgressPercent,
    getResumePosition,
    markLessonComplete,
    markLessonIncomplete,
  } = useProgress(currentCourse?.id ?? null);

  // Autoplay
  const autoplay = useAutoplay({
    onNavigate: (lessonId, _moduleId) => {
      // Special case: auto-hide overlay when there's no next lesson
      if (lessonId === "__auto_hide__") {
        setShowOverlay(false);
        completionOverlay.hide();
        return;
      }

      // Find the lesson and navigate
      const lesson = currentCourse?.modules
        .flatMap((m) => m.lessons)
        .find((l) => l.id === lessonId);
      if (lesson && cursoSlug) {
        navigate(`/aprender/${cursoSlug}/aula/${lesson.slug || lesson.id}`);
      }
    },
  });

  // Completion overlay
  const completionOverlay = useCompletionOverlay();

  // Check access when course is loaded
  const checkAccess = useCallback(async (courseId: string) => {
    setIsCheckingAccess(true);
    try {
      const response = await acquisitionsApi.checkAccess(courseId);
      setAccessInfo(response);
    } catch {
      // If access check fails, assume no access
      setAccessInfo({
        has_access: false,
        access_reason: null,
        can_enroll: false,
        acquisition_type: null,
        expires_at: null,
        acquisition_id: null,
        is_preview_mode: false,
      });
    } finally {
      setIsCheckingAccess(false);
    }
  }, []);

  useEffect(() => {
    if (cursoSlug) {
      fetchCourse(cursoSlug).finally(() => setIsInitialLoad(false));
    } else {
      setIsInitialLoad(false);
    }
  }, [cursoSlug, fetchCourse]);

  // Check access after course is loaded
  useEffect(() => {
    if (currentCourse?.id && !isLoadingCourse) {
      checkAccess(currentCourse.id);
    }
  }, [currentCourse?.id, isLoadingCourse, checkAccess]);

  // Find current lesson
  const lessonInfo = useMemo(() => {
    if (!currentCourse || !aulaSlug) return null;
    return findLessonInCourse(currentCourse, aulaSlug);
  }, [currentCourse, aulaSlug]);

  // Get resume position for current lesson
  const resumePosition = useMemo(() => {
    if (!lessonInfo) return 0;
    return getResumePosition(lessonInfo.lesson.id);
  }, [lessonInfo, getResumePosition]);

  // Comments hook for review submission
  const { createComment } = useComments(
    lessonInfo?.lesson.id ?? "",
    cursoSlug ?? "",
    aulaSlug ?? "",
  );

  // Helper to show completion overlay directly (without review)
  const showCompletionOverlayDirectly = useCallback(() => {
    if (!lessonInfo) return;

    const hasNext = !!lessonInfo.next;

    // Show success toast
    toast.success("Aula concluída!", {
      description: hasNext
        ? "Continue para a próxima aula"
        : "Você completou todas as aulas deste módulo",
      duration: 4000,
    });

    // Show completion overlay
    setShowOverlay(true);
    completionOverlay.show(
      lessonInfo.lesson.id,
      hasNext,
      lessonInfo.next?.lesson.id ?? null,
      lessonInfo.next?.module.id ?? null,
    );

    // Always start autoplay countdown (5 seconds) - shows countdown in overlay
    // If there's a next lesson: countdown → navigate
    // If no next lesson: countdown → auto-hide overlay
    if (autoplay.isEnabled) {
      autoplay.start(
        lessonInfo.next?.lesson.id ?? "__auto_hide__",
        lessonInfo.next?.module.id ?? "__auto_hide__",
      );
    }
  }, [lessonInfo, completionOverlay, autoplay]);

  // Show completion UI feedback (toast, animation, overlay, autoplay)
  // This is called AFTER the lesson is marked complete (either by video end or manual mark)
  const showCompletionFeedback = useCallback(() => {
    if (!lessonInfo) return;

    // Set recently completed for animation
    setRecentlyCompletedLessonId(lessonInfo.lesson.id);

    // Show review overlay first (for video content)
    if (lessonInfo.lesson.content_type === ContentType.VIDEO) {
      setShowReviewOverlay(true);
    } else {
      // For non-video content, show completion overlay directly
      showCompletionOverlayDirectly();
    }

    // Clear recently completed after animation finishes
    setTimeout(() => {
      setRecentlyCompletedLessonId(null);
    }, 2000);
  }, [lessonInfo, showCompletionOverlayDirectly]);

  // Handle review submit - creates comment with numeric rating and shows completion overlay
  const handleReviewSubmit = useCallback(
    async (rating: number, comment: string) => {
      if (!lessonInfo) return;

      // Format comment with star rating prefix for visual display
      const ratingStars = "★".repeat(rating) + "☆".repeat(5 - rating);
      const reviewContent = comment.trim() ? `${ratingStars}\n\n${comment}` : ratingStars;

      // Create comment with numeric rating stored in database
      await createComment(reviewContent, {
        rating,
        isReview: true,
      });

      // Close review overlay
      setShowReviewOverlay(false);

      // Show completion overlay
      showCompletionOverlayDirectly();
    },
    [lessonInfo, createComment, showCompletionOverlayDirectly],
  );

  // Handle review skip/close - just shows completion overlay
  const handleReviewClose = useCallback(() => {
    setShowReviewOverlay(false);
    showCompletionOverlayDirectly();
  }, [showCompletionOverlayDirectly]);

  // Handle lesson completion (called when VIDEO ends)
  // Marks complete via API then shows UI feedback
  const handleLessonComplete = useCallback(async () => {
    if (!lessonInfo || !currentCourse) return;

    // IMPORTANT: Mark lesson as complete in the backend
    // This ensures the progress is saved and UI updates
    try {
      await markLessonComplete(lessonInfo.lesson.id, lessonInfo.module.id);
    } catch (error) {
      console.error("[handleLessonComplete] Failed to mark lesson complete:", error);
      // Continue with UI feedback even if API fails
    }

    // Show UI feedback
    showCompletionFeedback();
  }, [lessonInfo, currentCourse, markLessonComplete, showCompletionFeedback]);

  // Handle rewatch
  const handleRewatch = useCallback(async () => {
    if (!lessonInfo || !currentCourse) return;

    // Cancel autoplay
    autoplay.cancel();

    // Mark as incomplete to reset progress
    await markLessonIncomplete(lessonInfo.lesson.id, lessonInfo.module.id);

    // Hide overlay
    setShowOverlay(false);
    completionOverlay.hide();
  }, [lessonInfo, currentCourse, autoplay, markLessonIncomplete, completionOverlay]);

  // Handle next lesson navigation
  const handleNextLesson = useCallback(() => {
    if (!lessonInfo?.next || !cursoSlug) return;

    // Cancel autoplay
    autoplay.cancel();

    // Hide overlay
    setShowOverlay(false);
    completionOverlay.hide();

    // Navigate
    const nextLesson = lessonInfo.next.lesson;
    navigate(`/aprender/${cursoSlug}/aula/${nextLesson.slug || nextLesson.id}`);
  }, [lessonInfo, cursoSlug, autoplay, completionOverlay, navigate]);

  // Handle close overlay
  const handleCloseOverlay = useCallback(() => {
    autoplay.cancel();
    setShowOverlay(false);
    completionOverlay.hide();
  }, [autoplay, completionOverlay]);

  // Handle manual mark complete (for non-video content: TEXT, PDF, QUIZ)
  const handleMarkComplete = useCallback(async () => {
    if (!lessonInfo) return;

    try {
      await markLessonComplete(lessonInfo.lesson.id, lessonInfo.module.id);
      // Show completion UI feedback after successful mark
      showCompletionFeedback();
    } catch (error) {
      // Error is already handled in the store, just log for debugging
      console.error("Failed to mark lesson complete:", error);
    }
  }, [lessonInfo, markLessonComplete, showCompletionFeedback]);

  // Handle manual mark incomplete
  const handleMarkIncomplete = useCallback(async () => {
    if (!lessonInfo) return;
    await markLessonIncomplete(lessonInfo.lesson.id, lessonInfo.module.id);
  }, [lessonInfo, markLessonIncomplete]);

  const navigateToLesson = (lesson: LessonInModule) => {
    // Cancel any autoplay
    autoplay.cancel();
    setShowOverlay(false);
    setShowReviewOverlay(false);
    completionOverlay.hide();

    navigate(`/aprender/${cursoSlug}/aula/${lesson.slug || lesson.id}`);
  };

  // Reset state when lesson changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset only on lesson change, stable Zustand functions
  useEffect(() => {
    setShowOverlay(false);
    setShowReviewOverlay(false);
    setRecentlyCompletedLessonId(null);
    completionOverlay.hide();
    autoplay.cancel();
  }, [aulaSlug]);

  // Show loading during initial fetch, course loading, or access check
  if (isInitialLoad || isLoadingCourse || isCheckingAccess) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!currentCourse) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Curso nao encontrado</AlertTitle>
            <AlertDescription>O curso solicitado nao existe ou foi removido.</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to="/painel">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Painel
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Check if user has access - show denied screen if not
  if (accessInfo && !accessInfo.has_access) {
    return (
      <AppLayout>
        <CourseAccessDenied
          course={currentCourse}
          canEnroll={accessInfo.can_enroll}
          onEnrollSuccess={() => checkAccess(currentCourse.id)}
        />
      </AppLayout>
    );
  }

  if (!lessonInfo) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Aula nao encontrada</AlertTitle>
            <AlertDescription>A aula solicitada nao existe ou foi removida.</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to={`/aprender/${cursoSlug}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao curso
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { lesson, module, prev, next } = lessonInfo;
  const Icon = contentTypeIcons[lesson.content_type];
  const lessonStatus = getLessonStatus(lesson.id);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <CourseSidebar
        course={currentCourse}
        currentLessonId={lesson.id}
        cursoSlug={cursoSlug ?? ""}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        getLessonStatus={getLessonStatus}
        getLessonProgressPercent={getLessonProgressPercent}
        recentlyCompletedLessonId={recentlyCompletedLessonId}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center gap-2 p-4 bg-background border-b lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-medium truncate">{lesson.title}</span>
        </div>

        <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                {error}
                <Button variant="ghost" size="sm" onClick={clearError}>
                  Fechar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Lesson header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span>{module.title}</span>
            </div>
            <h1 className="text-2xl font-bold">{lesson.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Icon className="h-4 w-4" />
                {lesson.content_type === ContentType.VIDEO && "Video"}
                {lesson.content_type === ContentType.TEXT && "Texto"}
                {lesson.content_type === ContentType.PDF && "PDF"}
                {lesson.content_type === ContentType.QUIZ && "Quiz"}
              </div>
              {lesson.duration_seconds && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(lesson.duration_seconds)}
                </div>
              )}
              {/* Progress indicator */}
              <LessonProgressIndicator
                status={lessonStatus}
                progressPercent={getLessonProgressPercent(lesson.id)}
                size="sm"
                showPercent
                animate={recentlyCompletedLessonId === lesson.id}
              />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Video content - overlay is rendered INSIDE the video container */}
            {lesson.content_type === ContentType.VIDEO && (
              <VideoContent
                lesson={lesson}
                courseId={currentCourse.id}
                moduleId={module.id}
                onComplete={handleLessonComplete}
                startTime={resumePosition}
                showOverlay={showOverlay}
                hasNextLesson={!!next}
                autoplayCountdown={autoplay.countdown}
                isAutoplayActive={autoplay.isActive}
                isUpdating={isUpdating}
                onRewatch={handleRewatch}
                onNextLesson={handleNextLesson}
                onCancelAutoplay={autoplay.cancel}
                onCloseOverlay={handleCloseOverlay}
              />
            )}

            {lesson.content_type === ContentType.TEXT && (
              <TextContent
                lesson={lesson}
                onMarkComplete={handleMarkComplete}
                onMarkIncomplete={handleMarkIncomplete}
                status={lessonStatus}
                isUpdating={isUpdating}
              />
            )}

            {lesson.content_type === ContentType.PDF && (
              <PDFContent
                lesson={lesson}
                onMarkComplete={handleMarkComplete}
                onMarkIncomplete={handleMarkIncomplete}
                status={lessonStatus}
                isUpdating={isUpdating}
              />
            )}

            {lesson.content_type === ContentType.QUIZ && (
              <QuizContent
                onMarkComplete={handleMarkComplete}
                onMarkIncomplete={handleMarkIncomplete}
                status={lessonStatus}
                isUpdating={isUpdating}
              />
            )}

            {/* Completion Overlay - shown for NON-VIDEO content types only */}
            {lesson.content_type !== ContentType.VIDEO && (
              <CompletionOverlay
                visible={showOverlay}
                hasNextLesson={!!next}
                countdown={autoplay.countdown}
                isAutoplayActive={autoplay.isActive}
                isLoading={isUpdating}
                onRewatch={handleRewatch}
                onNextLesson={handleNextLesson}
                onCancelAutoplay={autoplay.cancel}
                onClose={handleCloseOverlay}
              />
            )}

            {/* Description - hide for TEXT since description IS the main content */}
            {lesson.description && lesson.content_type !== ContentType.TEXT && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sobre esta aula</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {renderTextWithLinks(lesson.description)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <div>
              {prev ? (
                <Button variant="outline" onClick={() => navigateToLesson(prev.lesson)}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link to={`/aprender/${cursoSlug}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Voltar ao curso</span>
                  </Link>
                </Button>
              )}
            </div>

            <div>
              {next ? (
                <Button onClick={() => navigateToLesson(next.lesson)}>
                  <span className="hidden sm:inline">Proxima</span>
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button asChild>
                  <Link to={`/aprender/${cursoSlug}`}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Concluir curso</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Comments */}
          <CommentsSection
            lessonId={lesson.id}
            courseSlug={cursoSlug ?? ""}
            lessonSlug={aulaSlug ?? ""}
          />
        </div>
      </main>

      {/* Lesson Review Overlay - appears after video lesson ends */}
      <LessonReviewOverlay
        isOpen={showReviewOverlay}
        onClose={handleReviewClose}
        onSubmit={handleReviewSubmit}
        lessonTitle={lesson.title}
        countdownSeconds={10}
      />
    </div>
  );
}

/**
 * @deprecated Use StudentLessonViewContent with App-level ProtectedRoute instead.
 * Kept for backward compatibility.
 */
export function StudentLessonView() {
  return (
    <ProtectedRoute>
      <StudentLessonViewContent />
    </ProtectedRoute>
  );
}

export default StudentLessonView;
