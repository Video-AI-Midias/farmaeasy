"""Background worker for hourly → daily metric rollups.

Runs periodically to aggregate hourly metrics into daily summaries.
This enables efficient long-term queries and reduces storage requirements.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog

from .models import get_day_bucket, get_month_bucket


if TYPE_CHECKING:
    from cassandra.cluster import Session


logger = structlog.get_logger(__name__)


class MetricsAggregator:
    """Background worker for metric aggregation.

    Rolls up hourly metrics into daily summaries.
    Should run once per hour (e.g., via scheduler or cron).
    """

    def __init__(
        self,
        session: Session,
        keyspace: str,
        rollup_delay_hours: int = 2,
    ) -> None:
        """Initialize aggregator.

        Args:
            session: Cassandra session
            keyspace: Keyspace name
            rollup_delay_hours: Hours to wait before rolling up
                                (to ensure all hourly data is written)
        """
        self.session = session
        self.keyspace = keyspace
        self.rollup_delay_hours = rollup_delay_hours
        self._running = False
        self._task: asyncio.Task | None = None
        self._prepare_statements()

    def _prepare_statements(self) -> None:
        """Prepare CQL statements."""
        try:
            # Get hourly data for a day (keyspace is from settings, not user input)
            self._get_hourly = self.session.prepare(f"""
                SELECT * FROM {self.keyspace}.metrics_hourly
                WHERE day_bucket = ?
            """)  # noqa: S608

            # Upsert daily aggregation (keyspace is from settings, not user input)
            self._upsert_daily = self.session.prepare(f"""
                INSERT INTO {self.keyspace}.metrics_daily
                (month_bucket, day, metric_name, dimension_key, dimensions,
                 count, sum_value, min_value, max_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """)  # noqa: S608

            # Check if daily exists (keyspace is from settings, not user input)
            self._check_daily = self.session.prepare(f"""
                SELECT count FROM {self.keyspace}.metrics_daily
                WHERE month_bucket = ? AND day = ? AND metric_name = ? AND dimension_key = ?
            """)  # noqa: S608

            logger.debug("metrics_aggregator_statements_prepared")

        except Exception:
            logger.exception("metrics_aggregator_prepare_error")

    async def start(self, interval_seconds: int = 3600) -> None:
        """Start the background aggregation worker.

        Args:
            interval_seconds: Interval between aggregation runs (default: 1 hour)
        """
        if self._running:
            logger.warning("metrics_aggregator_already_running")
            return

        self._running = True
        self._task = asyncio.create_task(
            self._worker_loop(interval_seconds),
            name="metrics_aggregator",
        )
        logger.info(
            "metrics_aggregator_started",
            interval_seconds=interval_seconds,
            rollup_delay_hours=self.rollup_delay_hours,
        )

    async def stop(self) -> None:
        """Stop the background worker."""
        if not self._running:
            return

        self._running = False
        if self._task:
            self._task.cancel()
            # Suppress CancelledError which is expected when cancelling a task
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

        logger.info("metrics_aggregator_stopped")

    async def _worker_loop(self, interval_seconds: int) -> None:
        """Main worker loop."""
        while self._running:
            try:
                await self.run_rollup()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("metrics_aggregator_error")

            # Wait for next interval
            await asyncio.sleep(interval_seconds)

    async def run_rollup(self) -> None:
        """Run a single rollup cycle.

        Aggregates hourly data for the previous day (or older)
        into daily summaries.
        """
        now = datetime.now(UTC)

        # Determine which day to rollup (with delay)
        rollup_cutoff = now - timedelta(hours=self.rollup_delay_hours)
        target_day = rollup_cutoff.replace(hour=0, minute=0, second=0, microsecond=0)

        # Skip if we've already rolled up today
        day_bucket = get_day_bucket(target_day)

        logger.info("metrics_rollup_starting", day_bucket=day_bucket)

        try:
            # Get all hourly data for the day
            rows = await self.session.aexecute(self._get_hourly, [day_bucket])

            # Aggregate by metric_name + dimension_key
            # Use None for min/max to preserve "no data" semantics
            aggregations: dict[tuple, dict] = defaultdict(
                lambda: {
                    "count": 0,
                    "sum_value": 0.0,
                    "min_value": None,
                    "max_value": None,
                    "dimensions": {},
                }
            )

            for row in rows:
                key = (row.metric_name, row.dimension_key)
                agg = aggregations[key]

                agg["count"] += row.count or 0
                agg["sum_value"] += row.sum_value or 0.0

                # Merge min: keep smallest value (ignoring None)
                if row.min_value is not None:
                    if agg["min_value"] is None:
                        agg["min_value"] = row.min_value
                    else:
                        agg["min_value"] = min(agg["min_value"], row.min_value)

                # Merge max: keep largest value (ignoring None)
                if row.max_value is not None:
                    if agg["max_value"] is None:
                        agg["max_value"] = row.max_value
                    else:
                        agg["max_value"] = max(agg["max_value"], row.max_value)

                agg["dimensions"] = dict(row.dimensions) if row.dimensions else {}

            # Write daily aggregations
            month_bucket = get_month_bucket(target_day)
            day = target_day.day

            for (metric_name, dimension_key), agg in aggregations.items():
                await self.session.aexecute(
                    self._upsert_daily,
                    [
                        month_bucket,
                        day,
                        metric_name,
                        dimension_key,
                        agg["dimensions"],
                        agg["count"],
                        agg["sum_value"],
                        agg["min_value"],  # None if no data
                        agg["max_value"],  # None if no data
                    ],
                )

            logger.info(
                "metrics_rollup_completed",
                day_bucket=day_bucket,
                metrics_count=len(aggregations),
            )

        except Exception:
            logger.exception("metrics_rollup_error", day_bucket=day_bucket)

    async def backfill(self, days: int = 7) -> None:
        """Backfill daily aggregations for past days.

        Useful for initial setup or recovery.

        Args:
            days: Number of days to backfill
        """
        now = datetime.now(UTC)

        for i in range(1, days + 1):
            target_day = now - timedelta(days=i)
            target_day = target_day.replace(hour=0, minute=0, second=0, microsecond=0)

            # Temporarily set rollup delay to 0 for backfill
            original_delay = self.rollup_delay_hours
            self.rollup_delay_hours = 0

            try:
                await self.run_rollup()
            finally:
                self.rollup_delay_hours = original_delay

            logger.info(
                "metrics_backfill_day_completed",
                day=target_day.isoformat(),
            )

        logger.info("metrics_backfill_completed", days=days)
