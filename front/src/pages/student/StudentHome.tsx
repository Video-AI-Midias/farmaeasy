/**
 * Student home page.
 *
 * Features:
 * - Continue learning section (resume last course)
 * - Enrolled courses with progress
 * - Available courses catalog
 * - Recent notifications
 */

import { AppLayout } from "@/components/layout";
import { NotificationItem } from "@/components/notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useAuth } from "@/hooks/useAuth";
import { coursesApi } from "@/lib/courses-api";
import { cn } from "@/lib/utils";
import { useNotificationsStore } from "@/stores/notifications";
import { useProgressStore } from "@/stores/progress";
import type { Course } from "@/types/courses";
import type { Enrollment } from "@/types/progress";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Play,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// ==============================================================================
// Helper Functions
// ==============================================================================

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusBadge(enrollment: Enrollment) {
  if (enrollment.progress_percent === 100) {
    return (
      <Badge variant="default" className="bg-green-500">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Concluido
      </Badge>
    );
  }
  if (enrollment.progress_percent > 0) {
    return (
      <Badge variant="secondary">
        <TrendingUp className="h-3 w-3 mr-1" />
        Em progresso
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <BookOpen className="h-3 w-3 mr-1" />
      Novo
    </Badge>
  );
}

// ==============================================================================
// Sub-components
// ==============================================================================

interface CourseEnrollmentCardProps {
  enrollment: Enrollment;
  course: Course | null;
}

function CourseEnrollmentCard({ enrollment, course }: CourseEnrollmentCardProps) {
  const navigate = useNavigate();

  const handleContinue = useCallback(() => {
    if (course) {
      if (enrollment.last_lesson_id) {
        // Navigate to last lesson
        navigate(`/aprender/${course.slug}/aula/${enrollment.last_lesson_id}`);
      } else {
        // Navigate to course overview
        navigate(`/aprender/${course.slug}`);
      }
    }
  }, [course, enrollment.last_lesson_id, navigate]);

  if (!course) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <TruncatedText lines={1} className="font-medium leading-tight">
                  {course.title}
                </TruncatedText>
                <p className="text-sm text-muted-foreground">
                  {enrollment.lessons_completed} de {enrollment.lessons_total} aulas
                </p>
              </div>
              {getStatusBadge(enrollment)}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress value={enrollment.progress_percent} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {enrollment.progress_percent}% concluido
              </p>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleContinue} className="gap-1">
            {enrollment.progress_percent > 0 ? (
              <>
                <Play className="h-3 w-3" />
                Continuar
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Iniciar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface AvailableCourseCardProps {
  course: Course;
  isEnrolled: boolean;
}

function AvailableCourseCard({ course, isEnrolled }: AvailableCourseCardProps) {
  return (
    <Card
      className={cn(
        "group hover:shadow-md transition-shadow",
        isEnrolled && "opacity-60 pointer-events-none",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <GraduationCap className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <TruncatedText lines={1} className="font-medium leading-tight">
              {course.title}
            </TruncatedText>
            {course.description && (
              <TruncatedText lines={2} className="mt-1 text-sm text-muted-foreground">
                {course.description}
              </TruncatedText>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="h-3 w-3" />
              <span>{course.module_count} modulos</span>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="mt-4 flex justify-end">
          {isEnrolled ? (
            <Badge variant="outline">Ja inscrito</Badge>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/aprender/${course.slug}`} className="gap-1">
                Ver curso
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ==============================================================================
// Main Component
// ==============================================================================

function StudentHomeContent() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Progress store
  const { enrollments, isLoading: isLoadingEnrollments, fetchMyEnrollments } = useProgressStore();

  // Notifications store
  const {
    notifications,
    isLoading: isLoadingNotifications,
    fetchNotifications,
    markAsRead,
  } = useNotificationsStore();

  // Local state for available courses
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [coursesMap, setCoursesMap] = useState<Record<string, Course>>({});
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  // Fetch enrollments and notifications on mount
  useEffect(() => {
    fetchMyEnrollments();
    fetchNotifications(true);
  }, [fetchMyEnrollments, fetchNotifications]);

  // Fetch courses after enrollments are loaded
  // This ensures we can fetch enrolled courses that might not be published
  useEffect(() => {
    // Wait for enrollments to load first
    if (isLoadingEnrollments) {
      return;
    }

    const loadCourses = async () => {
      try {
        // Fetch published courses
        const response = await coursesApi.listPublished(20);
        const map: Record<string, Course> = {};
        for (const course of response.items) {
          map[course.id] = course;
        }
        setAvailableCourses(response.items);

        // Find enrolled courses not in published list (e.g., draft courses)
        const missingCourseIds = enrollments.map((e) => e.course_id).filter((id) => !map[id]);

        // Fetch missing courses by ID
        if (missingCourseIds.length > 0) {
          const missingCourses = await Promise.all(
            missingCourseIds.map((id) => coursesApi.get(id).catch(() => null)),
          );
          for (const course of missingCourses) {
            if (course) {
              map[course.id] = course;
            }
          }
        }

        setCoursesMap(map);
      } catch {
        // Silent fail
      } finally {
        setIsLoadingCourses(false);
      }
    };

    loadCourses();
  }, [isLoadingEnrollments, enrollments]);

  // Get enrolled course IDs for filtering available courses
  const enrolledCourseIds = new Set(enrollments.map((e) => e.course_id));

  // Find the most recent enrollment to continue
  const continueEnrollment = enrollments.find(
    (e) => e.progress_percent > 0 && e.progress_percent < 100,
  );

  // Handle notification click
  const handleNotificationClick = useCallback(
    async (notificationId: string) => {
      const notification = notifications.find((n) => n.id === notificationId);
      if (notification && !notification.is_read) {
        await markAsRead([notificationId]);
      }
      if (notification?.reference_url) {
        navigate(notification.reference_url);
      }
    },
    [notifications, markAsRead, navigate],
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Welcome header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.name} />
              <AvatarFallback className="text-lg">{getInitials(user?.name ?? "U")}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">Ola, {user?.name?.split(" ")[0]}!</h1>
              <p className="text-muted-foreground">Continue seu aprendizado</p>
            </div>
          </div>
        </div>

        {/* Continue learning - Hero section */}
        {continueEnrollment &&
          (() => {
            const continueCourse = coursesMap[continueEnrollment.course_id];
            if (!continueCourse) return null;
            return (
              <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center gap-6">
                    {/* Course thumbnail */}
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-background shadow-lg">
                      {continueCourse.thumbnail_url ? (
                        <img
                          src={continueCourse.thumbnail_url}
                          alt={continueCourse.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <BookOpen className="h-10 w-10 text-primary" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-primary">Continue de onde parou</p>
                        <h2 className="text-xl font-bold">{continueCourse.title}</h2>
                      </div>
                      <div className="flex items-center gap-4">
                        <Progress
                          value={continueEnrollment.progress_percent}
                          className="flex-1 h-3"
                        />
                        <span className="text-sm font-medium">
                          {continueEnrollment.progress_percent}%
                        </span>
                      </div>
                    </div>

                    {/* Action */}
                    <Button
                      size="lg"
                      onClick={() => {
                        if (continueEnrollment.last_lesson_id) {
                          navigate(
                            `/aprender/${continueCourse.slug}/aula/${continueEnrollment.last_lesson_id}`,
                          );
                        } else {
                          navigate(`/aprender/${continueCourse.slug}`);
                        }
                      }}
                      className="gap-2"
                    >
                      <Play className="h-5 w-5" />
                      Continuar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

        {/* Main grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Courses */}
          <div className="lg:col-span-2 space-y-8">
            {/* My courses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Meus Cursos
                </CardTitle>
                <CardDescription>Cursos em que voce esta inscrito</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingEnrollments || isLoadingCourses ? (
                  <div className="space-y-4">
                    {["enrollment-skeleton-1", "enrollment-skeleton-2"].map((key) => (
                      <div key={key} className="flex items-center gap-4">
                        <Skeleton className="h-16 w-16 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-2 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : enrollments.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Voce ainda nao esta inscrito em nenhum curso.
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Explore os cursos disponiveis abaixo!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {enrollments.map((enrollment) => (
                      <CourseEnrollmentCard
                        key={enrollment.course_id}
                        enrollment={enrollment}
                        course={coursesMap[enrollment.course_id] ?? null}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available courses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Cursos Disponiveis
                </CardTitle>
                <CardDescription>Explore novos cursos para aprender</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCourses ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      "course-skeleton-1",
                      "course-skeleton-2",
                      "course-skeleton-3",
                      "course-skeleton-4",
                    ].map((key) => (
                      <div key={key} className="flex items-start gap-4">
                        <Skeleton className="h-20 w-20 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : availableCourses.length === 0 ? (
                  <div className="text-center py-8">
                    <GraduationCap className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground">Nenhum curso disponivel no momento.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {availableCourses
                      .filter((c) => !enrolledCourseIds.has(c.id))
                      .slice(0, 4)
                      .map((course) => (
                        <AvailableCourseCard
                          key={course.id}
                          course={course}
                          isEnrolled={enrolledCourseIds.has(course.id)}
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column - Notifications */}
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notificacoes Recentes
                </CardTitle>
                <CardDescription>Suas ultimas atualizacoes</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingNotifications ? (
                  <div className="p-4 space-y-3">
                    {[
                      "student-notification-skeleton-1",
                      "student-notification-skeleton-2",
                      "student-notification-skeleton-3",
                    ].map((key) => (
                      <div key={key} className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Bell className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhuma notificacao</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="divide-y">
                      {notifications.slice(0, 10).map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onClick={() => handleNotificationClick(notification.id)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export function StudentHomePage() {
  return <StudentHomeContent />;
}

export default StudentHomePage;
