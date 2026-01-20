"""Metrics collector for batch writes to Cassandra.

Handles:
- Raw event insertion with prepared statements
- Pre-aggregation to hourly tables
- Cassandra counter updates
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from .models import (
    EventType,
    MetricEvent,
    generate_dimension_key,
    get_day_bucket,
    get_hour_bucket,
)


if TYPE_CHECKING:
    from cassandra.cluster import Session


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


class MetricsCollector:
    """Collector for batch writes to Cassandra.

    Uses prepared statements for efficient inserts.
    Pre-aggregates data during batch processing.
    """

    def __init__(self, session: Session, keyspace: str) -> None:
        """Initialize collector with Cassandra session.

        Args:
            session: Active Cassandra session
            keyspace: Keyspace name
        """
        self.session = session
        self.keyspace = keyspace
        self._prepared = False
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements for efficient queries."""
        try:
            # Insert raw event (keyspace is from settings, not user input)
            self._insert_event = self.session.prepare(f"""
                INSERT INTO {self.keyspace}.metrics_events
                (hour_bucket, event_id, event_type, event_name, user_id, request_id,
                 path, method, status_code, duration_ms, course_id, lesson_id,
                 metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)  # noqa: S608

            # Upsert hourly aggregation (keyspace is from settings, not user input)
            self._upsert_hourly = self.session.prepare(f"""
                INSERT INTO {self.keyspace}.metrics_hourly
                (day_bucket, hour, metric_name, dimension_key, dimensions,
                 count, sum_value, min_value, max_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)  # noqa: S608

            # Get existing hourly aggregation (keyspace is from settings, not user input)
            self._get_hourly = self.session.prepare(f"""
                SELECT count, sum_value, min_value, max_value
                FROM {self.keyspace}.metrics_hourly
                WHERE day_bucket = ? AND hour = ? AND metric_name = ? AND dimension_key = ?
            """)  # noqa: S608

            # Update Cassandra counter (keyspace is from settings, not user input)
            self._update_counter = self.session.prepare(f"""
                UPDATE {self.keyspace}.metrics_counters
                SET count = count + ?
                WHERE counter_key = ?
            """)  # noqa: S608

            self._prepared = True
            logger.debug("metrics_collector_statements_prepared")

        except Exception:
            logger.exception("metrics_collector_prepare_error")
            self._prepared = False

    async def process_batch(self, events: list[MetricEvent]) -> None:
        """Process a batch of events.

        1. Insert raw events
        2. Update hourly aggregations
        3. Update Cassandra counters

        Args:
            events: List of MetricEvent to process
        """
        if not self._prepared:
            self._prepare_statements()
            if not self._prepared:
                logger.warning("metrics_collector_not_ready")
                return

        if not events:
            return

        # 1. Insert raw events
        await self._insert_events(events)

        # 2. Update hourly aggregations
        await self._update_hourly_aggregations(events)

        # 3. Update counters
        await self._update_counters(events)

    async def _insert_events(self, events: list[MetricEvent]) -> None:
        """Insert raw events to metrics_events table.

        Args:
            events: List of events to insert
        """
        for event in events:
            try:
                await self.session.aexecute(
                    self._insert_event,
                    [
                        event.hour_bucket,
                        event.event_id,
                        event.event_type,
                        event.event_name,
                        event.user_id,
                        event.request_id,
                        event.path,
                        event.method,
                        event.status_code,
                        event.duration_ms,
                        event.course_id,
                        event.lesson_id,
                        event.metadata,
                        event.created_at,
                    ],
                )
            except Exception:
                logger.exception(
                    "metrics_event_insert_error",
                    event_name=event.event_name,
                )

    async def _update_hourly_aggregations(self, events: list[MetricEvent]) -> None:
        """Update hourly aggregation tables.

        Aggregates events by metric name and dimensions.

        Args:
            events: List of events to aggregate
        """
        # Group events by aggregation key
        # Note: We store dimensions separately since dicts are unhashable
        aggregations: dict[tuple, list[MetricEvent]] = defaultdict(list)
        dimension_map: dict[tuple, dict[str, str]] = {}

        for event in events:
            now = event.created_at or datetime.now(UTC)
            day_bucket = get_day_bucket(now)
            hour = now.hour

            # Aggregate by event name (global)
            key = (day_bucket, hour, event.event_name, "default")
            aggregations[key].append(event)
            dimension_map[key] = {}

            # For requests, also aggregate by status group
            if event.event_type == EventType.REQUEST and event.status_code:
                status_group = f"{event.status_code // 100}xx"
                dims = {"status": status_group}
                dim_key = generate_dimension_key(dims)
                key = (day_bucket, hour, "request_by_status", dim_key)
                aggregations[key].append(event)
                dimension_map[key] = dims

                # Aggregate by method
                if event.method:
                    dims = {"method": event.method}
                    dim_key = generate_dimension_key(dims)
                    key = (day_bucket, hour, "request_by_method", dim_key)
                    aggregations[key].append(event)
                    dimension_map[key] = dims

                # Aggregate by path (top endpoints)
                if event.path:
                    dims = {"path": event.path}
                    dim_key = generate_dimension_key(dims)
                    key = (day_bucket, hour, "request_by_path", dim_key)
                    aggregations[key].append(event)
                    dimension_map[key] = dims

        # Process each aggregation
        for key, agg_events in aggregations.items():
            day_bucket, hour, metric_name, dim_key = key
            dims = dimension_map.get(key, {})
            await self._upsert_aggregation(
                day_bucket, hour, metric_name, dim_key, dims, agg_events
            )

    async def _upsert_aggregation(
        self,
        day_bucket: str,
        hour: int,
        metric_name: str,
        dimension_key: str,
        dimensions: dict[str, str],
        events: list[MetricEvent],
    ) -> None:
        """Upsert a single hourly aggregation.

        Performs read-modify-write to update aggregation.

        Note:
            This operation is NOT atomic. For single-instance deployments,
            race conditions are avoided by the single-threaded emitter worker.
            For multi-instance deployments, consider:
            1. Using Cassandra Lightweight Transactions (LWT) - reduces throughput
            2. Serializing writes via message queue (e.g., Kafka)
            3. Accepting eventual consistency (small data loss acceptable for metrics)

        Args:
            day_bucket: Day bucket key
            hour: Hour (0-23)
            metric_name: Metric name
            dimension_key: Dimension hash key
            dimensions: Dimension values
            events: Events to aggregate
        """
        try:
            # Calculate new values from events
            new_count = len(events)
            new_sum = 0.0
            new_min: float | None = None
            new_max: float | None = None

            for event in events:
                if event.duration_ms is not None:
                    val = float(event.duration_ms)
                    new_sum += val
                    # Track min/max only when we have actual values
                    if new_min is None or val < new_min:
                        new_min = val
                    if new_max is None or val > new_max:
                        new_max = val

            # Read existing values
            result = await self.session.aexecute(
                self._get_hourly,
                [day_bucket, hour, metric_name, dimension_key],
            )
            existing = result[0] if result else None

            if existing:
                # Merge with existing
                total_count = (existing.count or 0) + new_count
                total_sum = (existing.sum_value or 0.0) + new_sum
                total_min = _merge_min(existing.min_value, new_min)
                total_max = _merge_max(existing.max_value, new_max)
            else:
                total_count = new_count
                total_sum = new_sum
                total_min = new_min
                total_max = new_max

            # Write merged values
            await self.session.aexecute(
                self._upsert_hourly,
                [
                    day_bucket,
                    hour,
                    metric_name,
                    dimension_key,
                    dimensions,
                    total_count,
                    total_sum,
                    total_min,
                    total_max,
                ],
            )

        except Exception:
            logger.exception(
                "metrics_aggregation_error",
                metric_name=metric_name,
                day_bucket=day_bucket,
                hour=hour,
            )

    async def _update_counters(self, events: list[MetricEvent]) -> None:
        """Update Cassandra counters for real-time access.

        Args:
            events: List of events to count
        """
        hour_bucket = get_hour_bucket()
        counters: dict[str, int] = defaultdict(int)

        for event in events:
            # Count by event type
            counters[f"{hour_bucket}:{event.event_type}:total"] += 1

            # Count by event name
            counters[f"{hour_bucket}:{event.event_name}"] += 1

            # Request-specific counters
            if event.event_type == EventType.REQUEST and event.status_code:
                status_group = f"{event.status_code // 100}xx"
                counters[f"{hour_bucket}:status:{status_group}"] += 1

        # Update counters
        for counter_key, count in counters.items():
            try:
                await self.session.aexecute(
                    self._update_counter,
                    [count, counter_key],
                )
            except Exception:
                logger.exception(
                    "metrics_counter_update_error",
                    counter_key=counter_key,
                )

    # ==========================================================================
    # Query Methods (for service layer)
    # ==========================================================================

    async def get_hourly_metrics(
        self,
        day_bucket: str,
        metric_name: str | None = None,
    ) -> list[dict]:
        """Get hourly metrics for a day.

        Args:
            day_bucket: Day bucket key (e.g., '2025-01-20')
            metric_name: Optional filter by metric name

        Returns:
            List of hourly metric records
        """
        try:
            # keyspace is from settings, not user input
            if metric_name:
                cql = f"""
                    SELECT * FROM {self.keyspace}.metrics_hourly
                    WHERE day_bucket = ? AND metric_name = ?
                    ALLOW FILTERING
                """  # noqa: S608
                result = await self.session.aexecute(cql, [day_bucket, metric_name])
            else:
                cql = f"""
                    SELECT * FROM {self.keyspace}.metrics_hourly
                    WHERE day_bucket = ?
                """  # noqa: S608
                result = await self.session.aexecute(cql, [day_bucket])

            return [
                {
                    "day_bucket": row.day_bucket,
                    "hour": row.hour,
                    "metric_name": row.metric_name,
                    "dimensions": dict(row.dimensions) if row.dimensions else {},
                    "count": row.count or 0,
                    "sum_value": row.sum_value or 0.0,
                    "min_value": row.min_value or 0.0,
                    "max_value": row.max_value or 0.0,
                }
                for row in result
            ]

        except Exception:
            logger.exception("metrics_get_hourly_error", day_bucket=day_bucket)
            return []

    async def get_raw_events(
        self,
        hour_bucket: str,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[MetricEvent]:
        """Get raw events for debugging.

        Args:
            hour_bucket: Hour bucket key
            event_type: Optional filter by event type
            limit: Maximum events to return

        Returns:
            List of MetricEvent
        """
        try:
            # keyspace is from settings, not user input
            if event_type:
                cql = f"""
                    SELECT * FROM {self.keyspace}.metrics_events
                    WHERE hour_bucket = ? AND event_type = ?
                    LIMIT ?
                    ALLOW FILTERING
                """  # noqa: S608
                result = await self.session.aexecute(
                    cql, [hour_bucket, event_type, limit]
                )
            else:
                cql = f"""
                    SELECT * FROM {self.keyspace}.metrics_events
                    WHERE hour_bucket = ?
                    LIMIT ?
                """  # noqa: S608
                result = await self.session.aexecute(cql, [hour_bucket, limit])

            return [MetricEvent.from_row(row) for row in result]

        except Exception:
            logger.exception("metrics_get_events_error", hour_bucket=hour_bucket)
            return []
