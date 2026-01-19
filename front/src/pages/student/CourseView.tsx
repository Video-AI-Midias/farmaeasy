import { CourseMaterials } from "@/components/attachments";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout";
import { LessonProgressIndicator } from "@/components/progress";
import { CourseAccessDenied } from "@/components/student";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useProgress } from "@/hooks/useProgress";
import { acquisitionsApi } from "@/lib/acquisitions-api";
import { cn, renderTextWithLinks } from "@/lib/utils";
import { useCoursesStore } from "@/stores/courses";
import { AccessReason, type CheckAccessResponse } from "@/types/acquisitions";
import { ContentType, type LessonInModule, type ModuleInCourse } from "@/types/courses";
import { LessonProgressStatus } from "@/types/progress";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Clock,
  Eye,
  FileIcon,
  FileText,
  Globe,
  HelpCircle,
  Layers,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

// Content type icons mapping
const contentTypeIcons: Record<ContentType, typeof PlayCircle> = {
  [ContentType.VIDEO]: PlayCircle,
  [ContentType.TEXT]: FileText,
  [ContentType.QUIZ]: HelpCircle,
  [ContentType.PDF]: FileIcon,
  [ContentType.EMBED]: Globe,
};

const contentTypeLabels: Record<ContentType, string> = {
  [ContentType.VIDEO]: "Video",
  [ContentType.TEXT]: "Texto",
  [ContentType.QUIZ]: "Quiz",
  [ContentType.PDF]: "PDF",
  [ContentType.EMBED]: "Apresentacao",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  if (remainingSeconds === 0) return `${minutes}min`;
  return `${minutes}min ${remainingSeconds}s`;
}

interface ModuleItemProps {
  module: ModuleInCourse;
  moduleNumber: number;
  courseSlug: string;
  getLessonStatus: (lessonId: string) => LessonProgressStatus;
  getLessonProgressPercent: (lessonId: string) => number;
}

function ModuleItem({
  module,
  moduleNumber,
  courseSlug,
  getLessonStatus,
  getLessonProgressPercent,
}: ModuleItemProps) {
  const [isOpen, setIsOpen] = useState(moduleNumber === 1);
  const navigate = useNavigate();

  // Calculate module progress from lessons (only valid lessons)
  const validLessons = module.lessons.filter((l) => l.is_valid);
  const completedLessons = validLessons.filter(
    (l) => getLessonStatus(l.id) === LessonProgressStatus.COMPLETED,
  ).length;
  const totalLessons = validLessons.length;
  const moduleProgress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  const handleLessonClick = (lesson: LessonInModule) => {
    navigate(`/aprender/${courseSlug}/aula/${lesson.slug || lesson.id}`);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  {moduleNumber}
                </div>
                <div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  {module.description && (
                    <CardDescription className="mt-1 whitespace-pre-wrap">
                      {renderTextWithLinks(module.description)}
                    </CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm text-muted-foreground">
                  <span>
                    {completedLessons}/{totalLessons} aulas
                  </span>
                  {moduleProgress === 100 && (
                    <LessonProgressIndicator
                      status={LessonProgressStatus.COMPLETED}
                      className="inline-block ml-2"
                    />
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </div>
            {totalLessons > 0 && <Progress value={moduleProgress} className="h-1 mt-3" />}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="divide-y">
              {module.lessons.filter((l) => l.is_valid).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhuma aula neste modulo ainda
                </p>
              ) : (
                module.lessons
                  .filter((l) => l.is_valid)
                  .map((lesson, index) => {
                    const Icon = contentTypeIcons[lesson.content_type];
                    const lessonStatus = getLessonStatus(lesson.id);
                    const progressPercent = getLessonProgressPercent(lesson.id);
                    const isCompleted = lessonStatus === LessonProgressStatus.COMPLETED;
                    const isInProgress = lessonStatus === LessonProgressStatus.IN_PROGRESS;

                    return (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => handleLessonClick(lesson)}
                        className={cn(
                          "flex w-full items-center gap-4 py-3 px-2 text-left transition-colors rounded-md",
                          "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
                          isCompleted && "text-muted-foreground",
                        )}
                      >
                        {/* Progress indicator */}
                        <LessonProgressIndicator
                          status={lessonStatus}
                          progress={progressPercent}
                          fallbackNumber={index + 1}
                          size="md"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className={cn("truncate", isCompleted && "line-through")}>
                              {lesson.title}
                            </span>
                            {isInProgress && (
                              <Badge variant="secondary" className="text-xs">
                                {Math.round(progressPercent)}%
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {lesson.duration_seconds && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDuration(lesson.duration_seconds)}
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {contentTypeLabels[lesson.content_type]}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function StudentCourseViewContent() {
  const { slug } = useParams<{ slug: string }>();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [accessInfo, setAccessInfo] = useState<CheckAccessResponse | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  const { currentCourse, isLoadingCourse, error, fetchCourse, clearError } = useCoursesStore();

  // Progress tracking - fetch when course is loaded
  const { courseProgress, getLessonStatus, getLessonProgressPercent } = useProgress(
    currentCourse?.id ?? null,
  );

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
    if (slug) {
      fetchCourse(slug).finally(() => setIsInitialLoad(false));
    } else {
      // No slug - mark as loaded to show error state
      setIsInitialLoad(false);
    }
  }, [slug, fetchCourse]);

  // Check access after course is loaded
  useEffect(() => {
    if (currentCourse?.id && !isLoadingCourse) {
      checkAccess(currentCourse.id);
    }
  }, [currentCourse?.id, isLoadingCourse, checkAccess]);

  // Calculate overall progress from actual data (only valid lessons)
  const allValidLessons =
    currentCourse?.modules.flatMap((m) => m.lessons.filter((l) => l.is_valid)) ?? [];
  const totalLessons = allValidLessons.length;
  const completedLessons = allValidLessons.filter(
    (l) => getLessonStatus(l.id) === LessonProgressStatus.COMPLETED,
  ).length;
  const overallProgress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  // Find resume lesson (last lesson in progress or first incomplete lesson)
  // Only consider valid lessons
  const allValidLessonsWithModule =
    currentCourse?.modules.flatMap((m) =>
      m.lessons.filter((l) => l.is_valid).map((l) => ({ lesson: l, module: m })),
    ) ?? [];
  const resumeLesson = courseProgress?.resume_lesson_id
    ? allValidLessonsWithModule.find((item) => item.lesson.id === courseProgress.resume_lesson_id)
    : allValidLessonsWithModule.find(
        (item) => getLessonStatus(item.lesson.id) !== LessonProgressStatus.COMPLETED,
      );

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

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Preview Mode Banner */}
        {accessInfo?.is_preview_mode && (
          <Alert className="border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/50">
            <Eye className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            <AlertTitle className="text-blue-900 dark:text-blue-100">
              Modo de Visualizacao
            </AlertTitle>
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              {accessInfo.access_reason === AccessReason.ADMIN_ROLE
                ? "Voce esta visualizando este curso como administrador. Seu progresso nao sera salvo."
                : "Voce esta visualizando seu proprio curso. Seu progresso nao sera salvo."}
            </AlertDescription>
          </Alert>
        )}

        {/* Course Header */}
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/painel">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>

          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            {currentCourse.thumbnail_url && (
              <img
                src={currentCourse.thumbnail_url}
                alt={currentCourse.title}
                className="w-full md:w-64 rounded-lg object-cover aspect-video"
              />
            )}

            <div className="flex-1 space-y-3">
              <h1 className="text-2xl font-bold md:text-3xl">{currentCourse.title}</h1>

              {currentCourse.description && (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {renderTextWithLinks(currentCourse.description)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  {currentCourse.modules.length} modulos
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" />
                  {totalLessons} aulas
                </div>
              </div>

              {/* Overall Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progresso do curso</span>
                  <span className="font-medium">{Math.round(overallProgress)}%</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>

              {/* Continue Button */}
              {(() => {
                // Use resume lesson if available, otherwise first lesson
                const targetLesson = resumeLesson?.lesson ?? currentCourse.modules[0]?.lessons[0];
                if (!targetLesson) return null;

                const buttonText =
                  overallProgress === 100
                    ? "Revisar Curso"
                    : overallProgress > 0
                      ? "Continuar Curso"
                      : "Comecar Curso";

                return (
                  <Button asChild className="mt-2">
                    <Link to={`/aprender/${slug}/aula/${targetLesson.slug || targetLesson.id}`}>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {buttonText}
                    </Link>
                  </Button>
                );
              })()}
            </div>
          </div>
        </div>

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

        {/* Modules List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Conteudo do Curso</h2>

          {currentCourse.modules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Conteudo em breve</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Os modulos deste curso estao sendo preparados
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {currentCourse.modules.map((module, index) => (
                <ModuleItem
                  key={module.id}
                  module={module}
                  moduleNumber={index + 1}
                  courseSlug={currentCourse.slug}
                  getLessonStatus={getLessonStatus}
                  getLessonProgressPercent={getLessonProgressPercent}
                />
              ))}
            </div>
          )}
        </div>

        {/* Materials Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Materiais de Apoio</h2>
          <CourseMaterials courseId={currentCourse.id} />
        </div>
      </div>
    </AppLayout>
  );
}

/**
 * @deprecated Use StudentCourseViewContent with App-level ProtectedRoute instead.
 * Kept for backward compatibility.
 */
export function StudentCourseView() {
  return (
    <ProtectedRoute>
      <StudentCourseViewContent />
    </ProtectedRoute>
  );
}

export default StudentCourseView;
