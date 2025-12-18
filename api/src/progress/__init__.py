"""Student progress tracking module.

Provides:
- Video progress tracking with resume support
- Lesson completion (automatic and manual)
- Module and course progress aggregation
- Course enrollment management
"""

from .models import (
    PROGRESS_TABLES_CQL,
    Enrollment,
    EnrollmentStatus,
    LessonProgress,
    LessonProgressStatus,
    ModuleProgress,
)


__all__ = [
    "PROGRESS_TABLES_CQL",
    "Enrollment",
    "EnrollmentStatus",
    "LessonProgress",
    "LessonProgressStatus",
    "ModuleProgress",
]
