"""Metrics module for pre-aggregated real-time analytics.

This module provides:
- Fire-and-forget event emission (<1ms overhead)
- Background batch processing to Cassandra
- Pre-aggregated metrics for fast dashboard queries
- Redis counters for real-time updates

Note: metrics_router is imported separately in main.py to avoid circular imports.
"""

from .aggregator import MetricsAggregator
from .collector import MetricsCollector
from .decorators import emit_business_event, emit_error_event, track_event
from .dependencies import (
    get_metrics_emitter_dep,
    get_metrics_service_dep,
    set_metrics_emitter_getter,
    set_metrics_service_getter,
)
from .emitter import MetricsEmitter, get_metrics_emitter, set_metrics_emitter
from .middleware import MetricsMiddleware
from .models import METRICS_TABLES_CQL, EventName, EventType, MetricEvent
from .schemas import (
    BusinessMetrics,
    CourseMetrics,
    DashboardMetrics,
    MetricEventCreate,
    MetricsHealthResponse,
    RealtimeCounters,
    RequestMetrics,
    TimeSeriesPoint,
    TimeSeriesResponse,
    UserMetrics,
)
from .service import MetricsQueryService


__all__ = [
    "METRICS_TABLES_CQL",
    "BusinessMetrics",
    "CourseMetrics",
    "DashboardMetrics",
    "EventName",
    "EventType",
    "MetricEvent",
    "MetricEventCreate",
    "MetricsAggregator",
    "MetricsCollector",
    "MetricsEmitter",
    "MetricsHealthResponse",
    "MetricsMiddleware",
    "MetricsQueryService",
    "RealtimeCounters",
    "RequestMetrics",
    "TimeSeriesPoint",
    "TimeSeriesResponse",
    "UserMetrics",
    "emit_business_event",
    "emit_error_event",
    "get_metrics_emitter",
    "get_metrics_emitter_dep",
    "get_metrics_service_dep",
    "set_metrics_emitter",
    "set_metrics_emitter_getter",
    "set_metrics_service_getter",
    "track_event",
]
