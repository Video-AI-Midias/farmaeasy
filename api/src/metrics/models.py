"""Metrics data models and CQL table definitions.

Tables:
- metrics_events: Raw events for debugging (7-day TTL)
- metrics_hourly: Hourly aggregations (90-day TTL)
- metrics_daily: Daily aggregations (2-year retention)
- metrics_counters: Real-time Cassandra counters
"""

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from cassandra.util import uuid_from_time


# ==============================================================================
# CQL Table Definitions
# ==============================================================================

METRICS_TABLES_CQL = [
    # Raw events table (for debugging and detailed analysis)
    """
    CREATE TABLE IF NOT EXISTS {keyspace}.metrics_events (
        hour_bucket TEXT,
        event_id TIMEUUID,
        event_type TEXT,
        event_name TEXT,
        user_id UUID,
        request_id TEXT,
        path TEXT,
        method TEXT,
        status_code INT,
        duration_ms DECIMAL,
        course_id UUID,
        lesson_id UUID,
        metadata MAP<TEXT, TEXT>,
        created_at TIMESTAMP,
        PRIMARY KEY ((hour_bucket), event_id)
    ) WITH CLUSTERING ORDER BY (event_id DESC)
      AND default_time_to_live = 604800
      AND compaction = {{'class': 'TimeWindowCompactionStrategy', 'compaction_window_unit': 'HOURS', 'compaction_window_size': 1}}
    """,
    # Hourly aggregations (for dashboards)
    """
    CREATE TABLE IF NOT EXISTS {keyspace}.metrics_hourly (
        day_bucket TEXT,
        hour TINYINT,
        metric_name TEXT,
        dimension_key TEXT,
        dimensions FROZEN<MAP<TEXT, TEXT>>,
        count BIGINT,
        sum_value DOUBLE,
        min_value DOUBLE,
        max_value DOUBLE,
        PRIMARY KEY ((day_bucket), hour, metric_name, dimension_key)
    ) WITH CLUSTERING ORDER BY (hour DESC, metric_name ASC, dimension_key ASC)
      AND default_time_to_live = 7776000
    """,
    # Daily aggregations (for reports)
    """
    CREATE TABLE IF NOT EXISTS {keyspace}.metrics_daily (
        month_bucket TEXT,
        day TINYINT,
        metric_name TEXT,
        dimension_key TEXT,
        dimensions FROZEN<MAP<TEXT, TEXT>>,
        count BIGINT,
        sum_value DOUBLE,
        min_value DOUBLE,
        max_value DOUBLE,
        PRIMARY KEY ((month_bucket), day, metric_name, dimension_key)
    ) WITH CLUSTERING ORDER BY (day DESC, metric_name ASC, dimension_key ASC)
    """,
    # Cassandra counters for real-time updates
    """
    CREATE TABLE IF NOT EXISTS {keyspace}.metrics_counters (
        counter_key TEXT PRIMARY KEY,
        count COUNTER
    )
    """,
    # Index on event_type for filtered queries
    """
    CREATE INDEX IF NOT EXISTS idx_metrics_events_type
    ON {keyspace}.metrics_events (event_type)
    """,
]


# ==============================================================================
# Helper Functions
# ==============================================================================


def get_hour_bucket(dt: datetime | None = None) -> str:
    """Generate hour bucket key (e.g., '2025-01-20-14')."""
    if dt is None:
        dt = datetime.now(UTC)
    return dt.strftime("%Y-%m-%d-%H")


def get_day_bucket(dt: datetime | None = None) -> str:
    """Generate day bucket key (e.g., '2025-01-20')."""
    if dt is None:
        dt = datetime.now(UTC)
    return dt.strftime("%Y-%m-%d")


def get_month_bucket(dt: datetime | None = None) -> str:
    """Generate month bucket key (e.g., '2025-01')."""
    if dt is None:
        dt = datetime.now(UTC)
    return dt.strftime("%Y-%m")


def generate_dimension_key(dimensions: dict[str, str]) -> str:
    """Generate deterministic hash key from dimensions."""
    if not dimensions:
        return "default"
    # Sort keys for deterministic ordering
    sorted_items = sorted(dimensions.items())
    key_str = "|".join(f"{k}={v}" for k, v in sorted_items)
    return hashlib.sha256(key_str.encode()).hexdigest()[:16]


def generate_counter_key(bucket: str, metric: str, dimensions: dict[str, str]) -> str:
    """Generate counter key for real-time counters."""
    dim_key = generate_dimension_key(dimensions)
    return f"{bucket}:{metric}:{dim_key}"


# ==============================================================================
# Entity Classes
# ==============================================================================


@dataclass
class MetricEvent:
    """Raw metric event entity."""

    hour_bucket: str
    event_id: UUID
    event_type: str
    event_name: str
    created_at: datetime
    user_id: UUID | None = None
    request_id: str | None = None
    path: str | None = None
    method: str | None = None
    status_code: int | None = None
    duration_ms: Decimal | None = None
    course_id: UUID | None = None
    lesson_id: UUID | None = None
    metadata: dict[str, str] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        event_type: str,
        event_name: str,
        user_id: UUID | None = None,
        request_id: str | None = None,
        path: str | None = None,
        method: str | None = None,
        status_code: int | None = None,
        duration_ms: float | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
        metadata: dict[str, str] | None = None,
    ) -> "MetricEvent":
        """Factory method to create a new metric event."""
        now = datetime.now(UTC)
        return cls(
            hour_bucket=get_hour_bucket(now),
            event_id=uuid_from_time(now),
            event_type=event_type,
            event_name=event_name,
            created_at=now,
            user_id=user_id,
            request_id=request_id,
            path=path,
            method=method,
            status_code=status_code,
            duration_ms=Decimal(str(duration_ms)) if duration_ms is not None else None,
            course_id=course_id,
            lesson_id=lesson_id,
            metadata=metadata or {},
        )

    @classmethod
    def from_row(cls, row: Any) -> "MetricEvent":
        """Create from Cassandra row."""
        return cls(
            hour_bucket=row.hour_bucket,
            event_id=row.event_id,
            event_type=row.event_type,
            event_name=row.event_name,
            created_at=row.created_at,
            user_id=row.user_id,
            request_id=row.request_id,
            path=row.path,
            method=row.method,
            status_code=row.status_code,
            duration_ms=row.duration_ms,
            course_id=row.course_id,
            lesson_id=row.lesson_id,
            metadata=dict(row.metadata) if row.metadata else {},
        )


@dataclass
class MetricHourly:
    """Hourly aggregation entity."""

    day_bucket: str
    hour: int
    metric_name: str
    dimension_key: str
    dimensions: dict[str, str]
    count: int
    sum_value: float
    min_value: float
    max_value: float

    @classmethod
    def from_row(cls, row: Any) -> "MetricHourly":
        """Create from Cassandra row."""
        return cls(
            day_bucket=row.day_bucket,
            hour=row.hour,
            metric_name=row.metric_name,
            dimension_key=row.dimension_key,
            dimensions=dict(row.dimensions) if row.dimensions else {},
            count=row.count or 0,
            sum_value=row.sum_value or 0.0,
            min_value=row.min_value or 0.0,
            max_value=row.max_value or 0.0,
        )


@dataclass
class MetricDaily:
    """Daily aggregation entity."""

    month_bucket: str
    day: int
    metric_name: str
    dimension_key: str
    dimensions: dict[str, str]
    count: int
    sum_value: float
    min_value: float
    max_value: float

    @classmethod
    def from_row(cls, row: Any) -> "MetricDaily":
        """Create from Cassandra row."""
        return cls(
            month_bucket=row.month_bucket,
            day=row.day,
            metric_name=row.metric_name,
            dimension_key=row.dimension_key,
            dimensions=dict(row.dimensions) if row.dimensions else {},
            count=row.count or 0,
            sum_value=row.sum_value or 0.0,
            min_value=row.min_value or 0.0,
            max_value=row.max_value or 0.0,
        )


# ==============================================================================
# Event Types (Constants)
# ==============================================================================


class EventType:
    """Event type constants."""

    REQUEST = "request"
    BUSINESS = "business"
    ERROR = "error"


class EventName:
    """Event name constants for business events."""

    # Request events
    API_REQUEST = "api_request"

    # Auth events
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_REGISTERED = "user_registered"

    # Course events
    COURSE_CREATED = "course_created"
    COURSE_UPDATED = "course_updated"
    COURSE_PUBLISHED = "course_published"

    # Enrollment events
    ENROLLMENT_CREATED = "enrollment_created"
    ENROLLMENT_CANCELLED = "enrollment_cancelled"

    # Progress events
    LESSON_STARTED = "lesson_started"
    LESSON_COMPLETED = "lesson_completed"
    MODULE_COMPLETED = "module_completed"
    COURSE_COMPLETED = "course_completed"

    # Comment events
    COMMENT_CREATED = "comment_created"
    COMMENT_DELETED = "comment_deleted"
    REACTION_ADDED = "reaction_added"

    # Video events
    VIDEO_STARTED = "video_started"
    VIDEO_COMPLETED = "video_completed"
    VIDEO_PROGRESS = "video_progress"
