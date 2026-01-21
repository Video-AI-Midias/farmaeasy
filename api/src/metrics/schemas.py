"""Pydantic schemas for metrics API."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ==============================================================================
# Request Schemas
# ==============================================================================


class MetricEventCreate(BaseModel):
    """Schema for creating a metric event via API."""

    event_type: str = Field(..., description="Event type (request, business, error)")
    event_name: str = Field(..., description="Specific event name")
    user_id: UUID | None = Field(default=None, description="User ID if authenticated")
    course_id: UUID | None = Field(default=None, description="Related course ID")
    lesson_id: UUID | None = Field(default=None, description="Related lesson ID")
    duration_ms: float | None = Field(
        default=None, description="Duration in milliseconds"
    )
    metadata: dict[str, str] = Field(
        default_factory=dict, description="Additional metadata"
    )


class MetricsQueryParams(BaseModel):
    """Query parameters for metrics endpoints."""

    period: Literal["today", "yesterday", "week", "month", "custom"] = Field(
        default="today",
        description="Time period for metrics",
    )
    start_date: datetime | None = Field(
        default=None,
        description="Start date for custom period",
    )
    end_date: datetime | None = Field(
        default=None,
        description="End date for custom period",
    )
    metric_name: str | None = Field(
        default=None,
        description="Filter by specific metric name",
    )
    granularity: Literal["hourly", "daily"] = Field(
        default="hourly",
        description="Time series granularity",
    )


# ==============================================================================
# Response Schemas
# ==============================================================================


class RequestMetrics(BaseModel):
    """Request-related metrics."""

    model_config = ConfigDict(from_attributes=True)

    total_requests: int = Field(description="Total number of requests")
    requests_by_status: dict[str, int] = Field(
        description="Requests grouped by status code"
    )
    requests_by_method: dict[str, int] = Field(
        description="Requests grouped by HTTP method"
    )
    avg_response_time_ms: float = Field(
        description="Average response time in milliseconds"
    )
    min_response_time_ms: float | None = Field(
        default=None,
        description="Minimum response time (None if no data)",
    )
    max_response_time_ms: float | None = Field(
        default=None,
        description="Maximum response time (None if no data)",
    )
    # Note: True percentiles require histogram buckets to be implemented.
    # These fields are None until histogram support is added.
    p50_response_time_ms: float | None = Field(
        default=None,
        description="50th percentile response time (requires histogram, None if unavailable)",
    )
    p95_response_time_ms: float | None = Field(
        default=None,
        description="95th percentile response time (requires histogram, None if unavailable)",
    )
    p99_response_time_ms: float | None = Field(
        default=None,
        description="99th percentile response time (requires histogram, None if unavailable)",
    )
    slowest_endpoints: list[dict] = Field(description="Top 10 slowest endpoints")
    busiest_endpoints: list[dict] = Field(description="Top 10 busiest endpoints")


class BusinessMetrics(BaseModel):
    """Business event metrics."""

    model_config = ConfigDict(from_attributes=True)

    enrollments: int = Field(description="Total enrollments in period")
    completions: int = Field(description="Lesson completions in period")
    course_completions: int = Field(description="Full course completions in period")
    comments: int = Field(description="Comments created in period")
    reactions: int = Field(description="Reactions added in period")
    new_users: int = Field(description="New user registrations")
    active_users: int = Field(description="Unique active users")


class UserMetrics(BaseModel):
    """User activity metrics."""

    model_config = ConfigDict(from_attributes=True)

    total_active: int | None = Field(
        default=None,
        description="Total active users in period (requires distinct tracking, None if unavailable)",
    )
    new_registrations: int = Field(description="New registrations")
    logins: int = Field(description="Total logins (not unique)")
    unique_logins: int | None = Field(
        default=None,
        description="Unique users who logged in (requires distinct tracking, None if unavailable)",
    )
    by_hour: dict[str, int] = Field(description="Login count by hour")


class CourseMetrics(BaseModel):
    """Course-related metrics."""

    model_config = ConfigDict(from_attributes=True)

    total_views: int = Field(description="Total course/lesson views")
    enrollments: int = Field(description="New enrollments")
    completions: int = Field(description="Lesson completions")
    completion_rate: float = Field(description="Overall completion rate percentage")
    top_courses: list[dict] = Field(description="Most popular courses")
    top_lessons: list[dict] = Field(description="Most viewed lessons")


class DashboardMetrics(BaseModel):
    """Complete dashboard metrics response."""

    model_config = ConfigDict(from_attributes=True)

    period: str = Field(description="Time period (today, week, month)")
    period_start: datetime = Field(description="Period start timestamp")
    period_end: datetime = Field(description="Period end timestamp")

    # Summary counters
    requests_total: int = Field(description="Total API requests")
    requests_success: int = Field(description="Successful requests (2xx)")
    requests_error: int = Field(description="Error requests (4xx/5xx)")
    avg_response_time_ms: float = Field(description="Average response time")
    max_response_time_ms: float | None = Field(
        default=None,
        description="Maximum response time (None if no data)",
    )

    # Business summary
    active_users: int = Field(
        description="Login count (not unique - requires distinct tracking)"
    )
    new_users: int = Field(description="New registrations")
    enrollments: int = Field(description="Course enrollments")
    completions: int = Field(description="Lesson completions")
    comments: int = Field(description="Comments created")

    # Trends (compared to previous period)
    requests_trend: float = Field(description="Request count change %")
    users_trend: float = Field(description="Active users change %")
    enrollments_trend: float = Field(description="Enrollments change %")

    generated_at: datetime = Field(description="When metrics were generated")


class TimeSeriesPoint(BaseModel):
    """Single data point in time series."""

    model_config = ConfigDict(from_attributes=True)

    timestamp: datetime = Field(description="Point timestamp")
    value: float = Field(description="Metric value")
    metric: str = Field(description="Metric name")
    dimensions: dict[str, str] = Field(
        default_factory=dict, description="Dimension values"
    )


class TimeSeriesResponse(BaseModel):
    """Time series data for charts."""

    model_config = ConfigDict(from_attributes=True)

    metric_name: str = Field(description="Name of the metric")
    granularity: str = Field(description="Data granularity (hourly, daily)")
    start_time: datetime = Field(description="Series start time")
    end_time: datetime = Field(description="Series end time")
    data: list[TimeSeriesPoint] = Field(description="Time series data points")
    total_count: int = Field(description="Total count across all points")
    avg_value: float = Field(description="Average value across all points")


class RealtimeCounters(BaseModel):
    """Real-time counter values from Redis."""

    model_config = ConfigDict(from_attributes=True)

    counters: dict[str, int] = Field(description="Counter name to value mapping")
    timestamp: datetime = Field(description="When counters were read")
    bucket: str = Field(description="Current time bucket")


class MetricsSummary(BaseModel):
    """Brief metrics summary for status endpoints."""

    model_config = ConfigDict(from_attributes=True)

    requests_last_hour: int = Field(description="Requests in last hour")
    errors_last_hour: int = Field(description="Errors in last hour")
    avg_response_ms: float = Field(description="Average response time")
    active_users_today: int = Field(description="Active users today")
    queue_size: int = Field(description="Current metrics queue size")
    queue_capacity: int = Field(description="Max queue capacity")
    worker_status: str = Field(description="Background worker status")


# ==============================================================================
# System Resources Schemas
# ==============================================================================


class CpuInfo(BaseModel):
    """CPU usage information."""

    model_config = ConfigDict(from_attributes=True)

    usage_percent: float = Field(description="Overall CPU usage percentage")
    cores_physical: int = Field(description="Number of physical CPU cores")
    cores_logical: int = Field(description="Number of logical CPU cores")
    load_avg_1m: float | None = Field(
        default=None, description="Load average 1 minute (Unix only)"
    )
    load_avg_5m: float | None = Field(
        default=None, description="Load average 5 minutes (Unix only)"
    )
    load_avg_15m: float | None = Field(
        default=None, description="Load average 15 minutes (Unix only)"
    )


class MemoryInfo(BaseModel):
    """Memory usage information."""

    model_config = ConfigDict(from_attributes=True)

    total_bytes: int = Field(description="Total physical memory in bytes")
    available_bytes: int = Field(description="Available memory in bytes")
    used_bytes: int = Field(description="Used memory in bytes")
    usage_percent: float = Field(description="Memory usage percentage")


class DiskInfo(BaseModel):
    """Disk usage information for a mount point."""

    model_config = ConfigDict(from_attributes=True)

    mount_point: str = Field(description="Disk mount point path")
    total_bytes: int = Field(description="Total disk space in bytes")
    used_bytes: int = Field(description="Used disk space in bytes")
    free_bytes: int = Field(description="Free disk space in bytes")
    usage_percent: float = Field(description="Disk usage percentage")


class SystemResourcesInfo(BaseModel):
    """Complete system resources information."""

    model_config = ConfigDict(from_attributes=True)

    cpu: CpuInfo = Field(description="CPU usage information")
    memory: MemoryInfo = Field(description="Memory usage information")
    disks: list[DiskInfo] = Field(description="Disk usage for all mount points")
    process_count: int = Field(description="Total number of running processes")
    collected_at: datetime = Field(description="When metrics were collected")


# ==============================================================================
# Admin Response Schemas
# ==============================================================================


class MetricsHealthResponse(BaseModel):
    """Health status of metrics system."""

    model_config = ConfigDict(from_attributes=True)

    healthy: bool = Field(description="Overall health status")
    emitter_running: bool = Field(description="Emitter worker running")
    queue_size: int = Field(description="Current queue size")
    queue_capacity: int = Field(description="Queue max size")
    queue_utilization: float = Field(description="Queue utilization percentage")
    cassandra_connected: bool = Field(description="Cassandra connection status")
    redis_connected: bool = Field(description="Redis connection status")
    events_processed_total: int = Field(description="Total events processed")
    events_dropped_total: int = Field(description="Total events dropped")
    last_flush_at: datetime | None = Field(description="Last batch flush timestamp")
    uptime_seconds: float = Field(description="Worker uptime in seconds")
    system_resources: SystemResourcesInfo | None = Field(
        default=None, description="System resources (CPU, memory, disk)"
    )
