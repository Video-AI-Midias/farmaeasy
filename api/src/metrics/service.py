"""Metrics query service for dashboard and reporting.

Provides optimized queries against pre-aggregated metrics tables.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog

from .models import EventName, get_day_bucket, get_hour_bucket, get_month_bucket
from .schemas import (
    BusinessMetrics,
    CourseMetrics,
    CpuInfo,
    DashboardMetrics,
    DiskInfo,
    MemoryInfo,
    MetricsHealthResponse,
    RealtimeCounters,
    RequestMetrics,
    SystemResourcesInfo,
    TimeSeriesPoint,
    TimeSeriesResponse,
    UserMetrics,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session
    from redis.asyncio import Redis

    from .emitter import MetricsEmitter


logger = structlog.get_logger(__name__)


def _merge_min(a: float | None, b: float | None) -> float | None:
    """Merge two min values, handling None."""
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b)


def _merge_max(a: float | None, b: float | None) -> float | None:
    """Merge two max values, handling None."""
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


class MetricsQueryService:
    """Service for querying pre-aggregated metrics.

    Optimized for fast dashboard queries using hourly/daily aggregations.
    """

    def __init__(
        self,
        session: Session,
        keyspace: str,
        redis: Redis | None = None,
        emitter: MetricsEmitter | None = None,
    ) -> None:
        """Initialize query service.

        Args:
            session: Cassandra session
            keyspace: Keyspace name
            redis: Optional Redis client for real-time counters
            emitter: Optional MetricsEmitter for health status
        """
        self.session = session
        self.keyspace = keyspace
        self.redis = redis
        self.emitter = emitter
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for queries."""
        try:
            # Get hourly metrics for a day (keyspace is from settings, not user input)
            self._get_hourly_by_day = self.session.prepare(f"""
                SELECT * FROM {self.keyspace}.metrics_hourly
                WHERE day_bucket = ?
            """)  # noqa: S608

            # Get hourly metrics for a day and metric name (keyspace is from settings)
            self._get_hourly_by_metric = self.session.prepare(f"""
                SELECT * FROM {self.keyspace}.metrics_hourly
                WHERE day_bucket = ? AND metric_name = ?
                ALLOW FILTERING
            """)  # noqa: S608

            # Get daily metrics for a month (keyspace is from settings, not user input)
            self._get_daily_by_month = self.session.prepare(f"""
                SELECT * FROM {self.keyspace}.metrics_daily
                WHERE month_bucket = ?
            """)  # noqa: S608

            # Get counter value (keyspace is from settings, not user input)
            self._get_counter = self.session.prepare(f"""
                SELECT count FROM {self.keyspace}.metrics_counters
                WHERE counter_key = ?
            """)  # noqa: S608

            logger.debug("metrics_service_statements_prepared")

        except Exception:
            logger.exception("metrics_service_prepare_error")

    # ==========================================================================
    # Dashboard Metrics
    # ==========================================================================

    async def get_dashboard_metrics(
        self,
        period: str = "today",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> DashboardMetrics:
        """Get complete dashboard metrics.

        Args:
            period: Time period (today, yesterday, week, month, custom)
            start_date: Start date for custom period
            end_date: End date for custom period

        Returns:
            DashboardMetrics with all key metrics
        """
        now = datetime.now(UTC)

        # Determine date range
        if period == "today":
            period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            period_end = now
        elif period == "yesterday":
            yesterday = now - timedelta(days=1)
            period_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
            period_end = yesterday.replace(hour=23, minute=59, second=59)
        elif period == "week":
            period_start = now - timedelta(days=7)
            period_end = now
        elif period == "month":
            period_start = now - timedelta(days=30)
            period_end = now
        elif period == "custom" and start_date and end_date:
            period_start = start_date
            period_end = end_date
        else:
            period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            period_end = now

        # Get aggregated metrics
        day_bucket = get_day_bucket(period_start)
        request_stats = await self._get_request_stats(day_bucket)
        business_stats = await self._get_business_stats(day_bucket)

        # Calculate trends (compare to previous period)
        prev_day = get_day_bucket(period_start - timedelta(days=1))
        prev_request_stats = await self._get_request_stats(prev_day)
        prev_business_stats = await self._get_business_stats(prev_day)

        requests_trend = self._calc_trend(
            request_stats.get("total", 0),
            prev_request_stats.get("total", 0),
        )
        users_trend = self._calc_trend(
            business_stats.get("active_users", 0),
            prev_business_stats.get("active_users", 0),
        )
        enrollments_trend = self._calc_trend(
            business_stats.get("enrollments", 0),
            prev_business_stats.get("enrollments", 0),
        )

        return DashboardMetrics(
            period=period,
            period_start=period_start,
            period_end=period_end,
            requests_total=request_stats.get("total", 0),
            requests_success=request_stats.get("success", 0),
            requests_error=request_stats.get("error", 0),
            avg_response_time_ms=request_stats.get("avg_duration", 0.0),
            max_response_time_ms=request_stats.get("max_duration"),
            active_users=business_stats.get("active_users", 0),
            new_users=business_stats.get("new_users", 0),
            enrollments=business_stats.get("enrollments", 0),
            completions=business_stats.get("completions", 0),
            comments=business_stats.get("comments", 0),
            requests_trend=requests_trend,
            users_trend=users_trend,
            enrollments_trend=enrollments_trend,
            generated_at=now,
        )

    async def _get_request_stats(self, day_bucket: str) -> dict:
        """Get request statistics for a day.

        Args:
            day_bucket: Day bucket key

        Returns:
            Dict with request statistics
        """
        stats: dict = {
            "total": 0,
            "success": 0,
            "error": 0,
            "avg_duration": 0.0,
            "min_duration": None,  # None means no data
            "max_duration": None,  # None means no data
        }

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            total_count = 0
            total_duration = 0.0
            min_duration: float | None = None
            max_duration: float | None = None

            for row in result:
                if row.metric_name == EventName.API_REQUEST:
                    total_count += row.count or 0
                    total_duration += row.sum_value or 0.0
                    min_duration = _merge_min(min_duration, row.min_value)
                    max_duration = _merge_max(max_duration, row.max_value)

                elif row.metric_name == "request_by_status":
                    dims = dict(row.dimensions) if row.dimensions else {}
                    status = dims.get("status", "")
                    if status == "2xx":
                        stats["success"] += row.count or 0
                    elif status in ("4xx", "5xx"):
                        stats["error"] += row.count or 0

            stats["total"] = total_count
            if total_count > 0:
                stats["avg_duration"] = total_duration / total_count
            stats["min_duration"] = min_duration
            stats["max_duration"] = max_duration

        except Exception:
            logger.exception("metrics_request_stats_error", day_bucket=day_bucket)

        return stats

    async def _get_business_stats(self, day_bucket: str) -> dict:
        """Get business statistics for a day.

        Args:
            day_bucket: Day bucket key

        Returns:
            Dict with business statistics
        """
        stats = {
            "active_users": 0,
            "new_users": 0,
            "enrollments": 0,
            "completions": 0,
            "comments": 0,
        }

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            for row in result:
                if row.metric_name == EventName.USER_LOGIN:
                    stats["active_users"] += row.count or 0
                elif row.metric_name == EventName.USER_REGISTERED:
                    stats["new_users"] += row.count or 0
                elif row.metric_name == EventName.ENROLLMENT_CREATED:
                    stats["enrollments"] += row.count or 0
                elif row.metric_name == EventName.LESSON_COMPLETED:
                    stats["completions"] += row.count or 0
                elif row.metric_name == EventName.COMMENT_CREATED:
                    stats["comments"] += row.count or 0

        except Exception:
            logger.exception("metrics_business_stats_error", day_bucket=day_bucket)

        return stats

    @staticmethod
    def _calc_trend(current: float, previous: float) -> float:
        """Calculate percentage trend.

        Args:
            current: Current value
            previous: Previous value

        Returns:
            Percentage change (positive = increase)
        """
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100

    # ==========================================================================
    # Request Metrics
    # ==========================================================================

    async def get_request_metrics(
        self,
        start_date: datetime,
        end_date: datetime,  # noqa: ARG002 - reserved for future range queries
    ) -> RequestMetrics:
        """Get detailed request metrics.

        Args:
            start_date: Period start
            end_date: Period end

        Returns:
            RequestMetrics with detailed statistics
        """
        day_bucket = get_day_bucket(start_date)
        stats = await self._get_request_stats(day_bucket)

        # Get status breakdown
        status_counts: dict[str, int] = {}
        method_counts: dict[str, int] = {}
        endpoint_stats: dict[str, dict] = {}

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            for row in result:
                dims = dict(row.dimensions) if row.dimensions else {}

                if row.metric_name == "request_by_status":
                    status = dims.get("status", "unknown")
                    status_counts[status] = status_counts.get(status, 0) + (
                        row.count or 0
                    )

                elif row.metric_name == "request_by_method":
                    method = dims.get("method", "UNKNOWN")
                    method_counts[method] = method_counts.get(method, 0) + (
                        row.count or 0
                    )

                elif row.metric_name == "request_by_path":
                    path = dims.get("path", "unknown")
                    if path not in endpoint_stats:
                        endpoint_stats[path] = {"count": 0, "sum": 0.0, "max": 0.0}
                    endpoint_stats[path]["count"] += row.count or 0
                    endpoint_stats[path]["sum"] += row.sum_value or 0.0
                    endpoint_stats[path]["max"] = max(
                        endpoint_stats[path]["max"], row.max_value or 0.0
                    )

        except Exception:
            logger.exception("metrics_request_detailed_error")

        # Calculate top endpoints
        slowest = sorted(
            endpoint_stats.items(),
            key=lambda x: x[1]["sum"] / max(x[1]["count"], 1),
            reverse=True,
        )[:10]

        busiest = sorted(
            endpoint_stats.items(),
            key=lambda x: x[1]["count"],
            reverse=True,
        )[:10]

        return RequestMetrics(
            total_requests=stats["total"],
            requests_by_status=status_counts,
            requests_by_method=method_counts,
            avg_response_time_ms=stats["avg_duration"],
            min_response_time_ms=stats["min_duration"],
            max_response_time_ms=stats["max_duration"],
            # Percentiles require histogram bucket support - not implemented yet
            p50_response_time_ms=None,
            p95_response_time_ms=None,
            p99_response_time_ms=None,
            slowest_endpoints=[
                {
                    "path": path,
                    "count": s["count"],
                    "avg_ms": s["sum"] / max(s["count"], 1),
                }
                for path, s in slowest
            ],
            busiest_endpoints=[
                {
                    "path": path,
                    "count": s["count"],
                    "avg_ms": s["sum"] / max(s["count"], 1),
                }
                for path, s in busiest
            ],
        )

    # ==========================================================================
    # Business Metrics
    # ==========================================================================

    async def get_business_metrics(
        self,
        start_date: datetime,
        end_date: datetime,  # noqa: ARG002 - reserved for future range queries
    ) -> BusinessMetrics:
        """Get business event metrics.

        Args:
            start_date: Period start
            end_date: Period end

        Returns:
            BusinessMetrics with engagement statistics
        """
        day_bucket = get_day_bucket(start_date)
        stats = await self._get_business_stats(day_bucket)

        # Get additional counts
        course_completions = 0
        reactions = 0

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            for row in result:
                if row.metric_name == EventName.COURSE_COMPLETED:
                    course_completions += row.count or 0
                elif row.metric_name == EventName.REACTION_ADDED:
                    reactions += row.count or 0

        except Exception:
            logger.exception("metrics_business_detailed_error")

        return BusinessMetrics(
            enrollments=stats["enrollments"],
            completions=stats["completions"],
            course_completions=course_completions,
            comments=stats["comments"],
            reactions=reactions,
            new_users=stats["new_users"],
            active_users=stats["active_users"],
        )

    # ==========================================================================
    # User Metrics
    # ==========================================================================

    async def get_user_metrics(
        self,
        start_date: datetime,
        end_date: datetime,  # noqa: ARG002 - reserved for future range queries
    ) -> UserMetrics:
        """Get user activity metrics.

        Args:
            start_date: Period start
            end_date: Period end

        Returns:
            UserMetrics with user activity data
        """
        day_bucket = get_day_bucket(start_date)

        new_registrations = 0
        logins = 0
        by_hour: dict[str, int] = {}

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            for row in result:
                if row.metric_name == EventName.USER_LOGIN:
                    logins += row.count or 0
                    by_hour[str(row.hour)] = row.count or 0
                elif row.metric_name == EventName.USER_REGISTERED:
                    new_registrations += row.count or 0

        except Exception:
            logger.exception("metrics_user_error")

        return UserMetrics(
            # Note: total_active and unique_logins require distinct user_id tracking
            # which is not implemented yet. Set to None to indicate unavailable data.
            total_active=None,
            new_registrations=new_registrations,
            logins=logins,
            unique_logins=None,
            by_hour=by_hour,
        )

    # ==========================================================================
    # Course Metrics
    # ==========================================================================

    async def get_course_metrics(
        self,
        start_date: datetime,
        end_date: datetime,  # noqa: ARG002 - reserved for future range queries
    ) -> CourseMetrics:
        """Get course-related metrics.

        Args:
            start_date: Period start
            end_date: Period end

        Returns:
            CourseMetrics with course engagement data
        """
        day_bucket = get_day_bucket(start_date)

        total_views = 0
        enrollments = 0
        completions = 0

        try:
            result = await self.session.aexecute(self._get_hourly_by_day, [day_bucket])

            for row in result:
                if row.metric_name == EventName.LESSON_STARTED:
                    total_views += row.count or 0
                elif row.metric_name == EventName.ENROLLMENT_CREATED:
                    enrollments += row.count or 0
                elif row.metric_name == EventName.LESSON_COMPLETED:
                    completions += row.count or 0

        except Exception:
            logger.exception("metrics_course_error")

        completion_rate = (completions / max(total_views, 1)) * 100

        return CourseMetrics(
            total_views=total_views,
            enrollments=enrollments,
            completions=completions,
            completion_rate=round(completion_rate, 2),
            top_courses=[],  # Would need course-specific aggregation
            top_lessons=[],  # Would need lesson-specific aggregation
        )

    # ==========================================================================
    # Time Series
    # ==========================================================================

    async def get_timeseries(
        self,
        metric_name: str,
        start_date: datetime,
        end_date: datetime,
        granularity: str = "hourly",
    ) -> TimeSeriesResponse:
        """Get time series data for charts.

        Args:
            metric_name: Metric to query
            start_date: Start timestamp
            end_date: End timestamp
            granularity: 'hourly' or 'daily'

        Returns:
            TimeSeriesResponse with data points
        """
        data: list[TimeSeriesPoint] = []
        total_count = 0
        total_value = 0.0

        try:
            if granularity == "hourly":
                day_bucket = get_day_bucket(start_date)
                result = await self.session.aexecute(
                    self._get_hourly_by_metric, [day_bucket, metric_name]
                )

                for row in result:
                    timestamp = datetime(
                        int(day_bucket[:4]),
                        int(day_bucket[5:7]),
                        int(day_bucket[8:10]),
                        row.hour,
                        tzinfo=UTC,
                    )
                    count = row.count or 0
                    avg_val = (row.sum_value or 0.0) / max(count, 1)

                    data.append(
                        TimeSeriesPoint(
                            timestamp=timestamp,
                            value=avg_val,
                            metric=metric_name,
                            dimensions=dict(row.dimensions) if row.dimensions else {},
                        )
                    )
                    total_count += count
                    total_value += row.sum_value or 0.0

            elif granularity == "daily":
                month_bucket = get_month_bucket(start_date)
                result = await self.session.aexecute(
                    self._get_daily_by_month, [month_bucket]
                )

                for row in result:
                    if row.metric_name == metric_name:
                        timestamp = datetime(
                            int(month_bucket[:4]),
                            int(month_bucket[5:7]),
                            row.day,
                            tzinfo=UTC,
                        )
                        count = row.count or 0
                        avg_val = (row.sum_value or 0.0) / max(count, 1)

                        data.append(
                            TimeSeriesPoint(
                                timestamp=timestamp,
                                value=avg_val,
                                metric=metric_name,
                                dimensions=dict(row.dimensions)
                                if row.dimensions
                                else {},
                            )
                        )
                        total_count += count
                        total_value += row.sum_value or 0.0

        except Exception:
            logger.exception("metrics_timeseries_error", metric_name=metric_name)

        # Sort by timestamp
        data.sort(key=lambda x: x.timestamp)

        avg_value = total_value / max(total_count, 1)

        return TimeSeriesResponse(
            metric_name=metric_name,
            granularity=granularity,
            start_time=start_date,
            end_time=end_date,
            data=data,
            total_count=total_count,
            avg_value=round(avg_value, 2),
        )

    # ==========================================================================
    # Real-time Counters
    # ==========================================================================

    async def get_realtime_counters(self) -> RealtimeCounters:
        """Get real-time counters from Redis.

        Returns:
            RealtimeCounters with current values
        """
        now = datetime.now(UTC)
        hour_bucket = get_hour_bucket(now)
        counters: dict[str, int] = {}

        if self.redis:
            try:
                # Get all counters for current hour
                pattern = f"metrics:{hour_bucket}:*"
                keys = [key async for key in self.redis.scan_iter(pattern)]

                if keys:
                    values = await self.redis.mget(keys)
                    for key, value in zip(keys, values, strict=True):
                        if value is not None:
                            # Extract counter name from key
                            key_str = key.decode() if isinstance(key, bytes) else key
                            counter_name = key_str.replace(
                                f"metrics:{hour_bucket}:", ""
                            )
                            counters[counter_name] = int(value)

            except Exception:
                logger.exception("metrics_realtime_counters_error")

        return RealtimeCounters(
            counters=counters,
            timestamp=now,
            bucket=hour_bucket,
        )

    # ==========================================================================
    # Health Status
    # ==========================================================================

    def _collect_system_resources(self) -> SystemResourcesInfo:
        """Collect system resources metrics using psutil.

        Returns:
            SystemResourcesInfo with CPU, memory, and disk metrics
        """
        import os

        import psutil

        now = datetime.now(UTC)

        # CPU info
        cpu_percent = psutil.cpu_percent(interval=None)
        cores_physical = psutil.cpu_count(logical=False) or 1
        cores_logical = psutil.cpu_count(logical=True) or 1

        # Load average (Unix only)
        load_avg_1m = None
        load_avg_5m = None
        load_avg_15m = None
        if hasattr(os, "getloadavg"):
            try:
                load = os.getloadavg()
                load_avg_1m = round(load[0], 2)
                load_avg_5m = round(load[1], 2)
                load_avg_15m = round(load[2], 2)
            except OSError:
                pass

        cpu_info = CpuInfo(
            usage_percent=round(cpu_percent, 1),
            cores_physical=cores_physical,
            cores_logical=cores_logical,
            load_avg_1m=load_avg_1m,
            load_avg_5m=load_avg_5m,
            load_avg_15m=load_avg_15m,
        )

        # Memory info
        mem = psutil.virtual_memory()
        memory_info = MemoryInfo(
            total_bytes=mem.total,
            available_bytes=mem.available,
            used_bytes=mem.used,
            usage_percent=round(mem.percent, 1),
        )

        # Disk info (only physical disks, skip special filesystems and bind mounts)
        disks: list[DiskInfo] = []
        excluded_fstypes = {"squashfs", "tmpfs", "devtmpfs", "overlay", "proc", "sysfs"}
        # Exclude bind mounts (files mounted as config in containers)
        excluded_prefixes = ("/etc/", "/app/", "/run/", "/sys/", "/proc/", "/dev/")
        seen_devices: set[str] = set()

        for partition in psutil.disk_partitions(all=False):
            if partition.fstype in excluded_fstypes:
                continue

            # Skip bind mounts of files (mount points under excluded prefixes)
            if any(partition.mountpoint.startswith(p) for p in excluded_prefixes):
                continue

            # Skip duplicate devices (same physical disk mounted multiple times)
            if partition.device in seen_devices:
                continue
            seen_devices.add(partition.device)

            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append(
                    DiskInfo(
                        mount_point=partition.mountpoint,
                        total_bytes=usage.total,
                        used_bytes=usage.used,
                        free_bytes=usage.free,
                        usage_percent=round(usage.percent, 1),
                    )
                )
            except (PermissionError, OSError):
                # Skip inaccessible partitions
                continue

        # Process count
        process_count = len(psutil.pids())

        return SystemResourcesInfo(
            cpu=cpu_info,
            memory=memory_info,
            disks=disks,
            process_count=process_count,
            collected_at=now,
        )

    async def get_health(self) -> MetricsHealthResponse:
        """Get metrics system health status.

        Returns:
            MetricsHealthResponse with system status
        """
        # Check emitter status
        emitter_running = False
        queue_size = 0
        queue_capacity = 10000
        queue_utilization = 0.0
        events_processed = 0
        events_dropped = 0
        last_flush_at = None
        uptime_seconds = 0.0

        if self.emitter:
            emitter_running = self.emitter.is_running
            queue_size = self.emitter.queue_length
            queue_capacity = self.emitter.queue_size
            queue_utilization = self.emitter.queue_utilization
            stats = self.emitter.get_stats()
            events_processed = stats.get("events_processed", 0)
            events_dropped = stats.get("events_dropped", 0)
            last_flush_at = stats.get("last_flush_at")
            uptime_seconds = stats.get("uptime_seconds", 0.0)

        # Check Cassandra connection
        cassandra_connected = False
        try:
            await self.session.aexecute("SELECT now() FROM system.local")
            cassandra_connected = True
        except Exception:
            logger.debug("metrics_health_cassandra_check_failed")

        # Check Redis connection
        redis_connected = False
        if self.redis:
            try:
                await self.redis.ping()
                redis_connected = True
            except Exception:
                logger.debug("metrics_health_redis_check_failed")

        # Collect system resources
        system_resources = None
        try:
            system_resources = self._collect_system_resources()
        except Exception:
            logger.exception("metrics_health_system_resources_error")

        healthy = emitter_running and cassandra_connected

        return MetricsHealthResponse(
            healthy=healthy,
            emitter_running=emitter_running,
            queue_size=queue_size,
            queue_capacity=queue_capacity,
            queue_utilization=queue_utilization,
            cassandra_connected=cassandra_connected,
            redis_connected=redis_connected,
            events_processed_total=events_processed,
            events_dropped_total=events_dropped,
            last_flush_at=last_flush_at,
            uptime_seconds=uptime_seconds,
            system_resources=system_resources,
        )
