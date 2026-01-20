"""Admin API endpoints for metrics dashboard.

All endpoints require admin authentication.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from src.auth.dependencies import require_admin

from .dependencies import get_metrics_service_dep
from .schemas import (
    BusinessMetrics,
    CourseMetrics,
    DashboardMetrics,
    MetricsHealthResponse,
    RealtimeCounters,
    RequestMetrics,
    TimeSeriesResponse,
    UserMetrics,
)
from .service import MetricsQueryService


# Type alias for period query parameter
PeriodType = Literal["today", "yesterday", "week", "month", "custom"]


def get_date_range(
    period: PeriodType,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> tuple[datetime, datetime]:
    """Convert period to date range.

    Args:
        period: Named period or "custom"
        start_date: Required for custom period
        end_date: Required for custom period

    Returns:
        Tuple of (start_date, end_date)

    Raises:
        HTTPException: If custom period is missing dates
    """
    now = datetime.now(UTC)

    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0), now
    if period == "yesterday":
        yesterday = now - timedelta(days=1)
        return (
            yesterday.replace(hour=0, minute=0, second=0, microsecond=0),
            yesterday.replace(hour=23, minute=59, second=59),
        )
    if period == "week":
        return now - timedelta(days=7), now
    if period == "month":
        return now - timedelta(days=30), now
    # custom period
    if not start_date or not end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date and end_date are required for custom period",
        )
    return start_date, end_date


router = APIRouter(
    prefix="/v1/admin/metrics",
    tags=["admin-metrics"],
    dependencies=[Depends(require_admin)],
)


@router.get(
    "",
    response_model=DashboardMetrics,
    summary="Get dashboard metrics",
    description="Returns complete dashboard metrics for the specified period.",
)
async def get_dashboard_metrics(
    period: PeriodType = Query(
        default="today",
        description="Time period for metrics (use 'custom' with start_date/end_date)",
    ),
    start_date: datetime | None = Query(
        default=None,
        description="Start date for custom period (ISO 8601 format)",
    ),
    end_date: datetime | None = Query(
        default=None,
        description="End date for custom period (ISO 8601 format)",
    ),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> DashboardMetrics:
    """Get complete dashboard metrics.

    Returns aggregated metrics including:
    - Request statistics (total, success, errors, response times)
    - Business metrics (active users, enrollments, completions)
    - Trend comparisons with previous period
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_dashboard_metrics(
        period=period, start_date=start, end_date=end
    )


@router.get(
    "/realtime",
    response_model=RealtimeCounters,
    summary="Get real-time counters",
    description="Returns current hour counters from Redis for live monitoring.",
)
async def get_realtime_counters(
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> RealtimeCounters:
    """Get real-time counters from Redis.

    Returns counters for the current hour bucket including:
    - Request counts by type and status
    - Business event counts
    - Updated in near real-time (< 1s delay)
    """
    return await service.get_realtime_counters()


@router.get(
    "/requests",
    response_model=RequestMetrics,
    summary="Get request metrics",
    description="Returns detailed request/response metrics.",
)
async def get_request_metrics(
    period: PeriodType = Query(
        default="today",
        description="Time period for metrics",
    ),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> RequestMetrics:
    """Get detailed request metrics.

    Returns:
    - Total requests and breakdown by status/method
    - Response time statistics (avg, min, max)
    - Top 10 slowest and busiest endpoints
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_request_metrics(start_date=start, end_date=end)


@router.get(
    "/business",
    response_model=BusinessMetrics,
    summary="Get business metrics",
    description="Returns business event metrics (enrollments, completions, etc.).",
)
async def get_business_metrics(
    period: PeriodType = Query(
        default="today",
        description="Time period for metrics",
    ),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> BusinessMetrics:
    """Get business event metrics.

    Returns counts for:
    - Enrollments and completions
    - Comments and reactions
    - New and active users
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_business_metrics(start_date=start, end_date=end)


@router.get(
    "/users",
    response_model=UserMetrics,
    summary="Get user metrics",
    description="Returns user activity metrics.",
)
async def get_user_metrics(
    period: PeriodType = Query(
        default="today",
        description="Time period for metrics",
    ),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> UserMetrics:
    """Get user activity metrics.

    Returns:
    - Login counts (total, not unique)
    - New registrations
    - Login distribution by hour
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_user_metrics(start_date=start, end_date=end)


@router.get(
    "/courses",
    response_model=CourseMetrics,
    summary="Get course metrics",
    description="Returns course engagement metrics.",
)
async def get_course_metrics(
    period: PeriodType = Query(
        default="today",
        description="Time period for metrics",
    ),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> CourseMetrics:
    """Get course engagement metrics.

    Returns:
    - Total views and enrollments
    - Completion counts and rates
    - Top courses and lessons
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_course_metrics(start_date=start, end_date=end)


@router.get(
    "/timeseries",
    response_model=TimeSeriesResponse,
    summary="Get time series data",
    description="Returns time series data for charts and graphs.",
)
async def get_timeseries(
    metric: str = Query(
        ...,
        description="Metric name to query (e.g., 'api_request', 'enrollment_created')",
    ),
    period: PeriodType = Query(
        default="today",
        description="Time period for data",
    ),
    granularity: Literal["hourly", "daily"] = Query(
        default="hourly",
        description="Data granularity",
    ),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> TimeSeriesResponse:
    """Get time series data for charts.

    Returns data points with:
    - Timestamp
    - Metric value
    - Dimensions (if applicable)

    Useful for rendering line/bar charts in dashboards.
    """
    start, end = get_date_range(period, start_date, end_date)
    return await service.get_timeseries(
        metric_name=metric,
        start_date=start,
        end_date=end,
        granularity=granularity,
    )


@router.get(
    "/health",
    response_model=MetricsHealthResponse,
    summary="Get metrics system health",
    description="Returns health status of the metrics collection system.",
)
async def get_metrics_health(
    service: MetricsQueryService = Depends(get_metrics_service_dep),
) -> MetricsHealthResponse:
    """Get metrics system health status.

    Returns:
    - Emitter worker status
    - Queue utilization
    - Cassandra/Redis connection status
    - Event processing statistics
    """
    return await service.get_health()
