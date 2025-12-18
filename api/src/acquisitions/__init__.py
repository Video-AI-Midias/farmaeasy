"""Course acquisitions module.

Handles course access control and acquisition tracking:
- AcquisitionType: FREE, PURCHASE, ADMIN_GRANT, PROMO, GIFT
- AcquisitionStatus: PENDING, ACTIVE, EXPIRED, REVOKED
- Tracks how users acquired access to courses
- Prepared for future payment integration
"""

from .models import AcquisitionStatus, AcquisitionType, CourseAcquisition
from .router import admin_router, router
from .schemas import (
    AcquisitionListResponse,
    AcquisitionResponse,
    CheckAccessResponse,
    GrantAccessRequest,
)
from .service import AcquisitionService


__all__ = [
    "AcquisitionListResponse",
    "AcquisitionResponse",
    "AcquisitionService",
    "AcquisitionStatus",
    "AcquisitionType",
    "CheckAccessResponse",
    "CourseAcquisition",
    "GrantAccessRequest",
    "admin_router",
    "router",
]
