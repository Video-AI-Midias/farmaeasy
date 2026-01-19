/**
 * Preview of courses the user will get access to after completing registration.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { CoursePreview } from "@/types/registration-link";
import { GraduationCap } from "lucide-react";

interface CourseAccessPreviewProps {
  courses: CoursePreview[];
}

export function CourseAccessPreview({ courses }: CourseAccessPreviewProps) {
  if (courses.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <GraduationCap className="h-4 w-4" />
        <span>
          Você terá acesso a {courses.length === 1 ? "1 curso" : `${courses.length} cursos`}
        </span>
      </div>

      <div className="grid gap-2">
        {courses.map((course) => (
          <Card key={course.id} className="overflow-hidden">
            <CardContent className="flex items-center gap-3 p-3">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-12 w-16 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-16 items-center justify-center rounded bg-primary/10">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{course.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
