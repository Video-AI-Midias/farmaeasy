"""Fire-and-forget metrics emitter with background processing.

Key features:
- Non-blocking event emission (<1ms via asyncio.Queue.put_nowait())
- Graceful degradation (drop + log on queue full)
- Batch processing (100 events or 1s timeout)
- Redis counters for real-time updates
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from .models import EventName, EventType, MetricEvent, get_hour_bucket


if TYPE_CHECKING:
    from uuid import UUID

    from redis.asyncio import Redis

    from .collector import MetricsCollector


logger = structlog.get_logger(__name__)


# Global emitter instance for decorator access
_metrics_emitter: MetricsEmitter | None = None


def get_metrics_emitter() -> MetricsEmitter | None:
    """Get global metrics emitter instance."""
    return _metrics_emitter


def set_metrics_emitter(emitter: MetricsEmitter | None) -> None:
    """Set global metrics emitter instance."""
    global _metrics_emitter  # noqa: PLW0603 - singleton pattern for decorator access
    _metrics_emitter = emitter


class MetricsEmitter:
    """Non-blocking metrics emitter with background worker.

    Events are emitted via fire-and-forget pattern using asyncio.Queue.
    A background worker processes events in batches and writes to Cassandra.
    """

    def __init__(
        self,
        redis: Redis | None = None,
        queue_size: int = 10000,
        batch_size: int = 100,
        flush_interval: float = 1.0,
    ) -> None:
        """Initialize metrics emitter.

        Args:
            redis: Optional Redis client for real-time counters
            queue_size: Maximum queue size (events dropped when full)
            batch_size: Events per batch write
            flush_interval: Max seconds between batch flushes
        """
        self.redis = redis
        self.queue_size = queue_size
        self.batch_size = batch_size
        self.flush_interval = flush_interval

        # Internal state
        self._queue: asyncio.Queue[MetricEvent] = asyncio.Queue(maxsize=queue_size)
        self._running = False
        self._worker_task: asyncio.Task | None = None
        self._collector: MetricsCollector | None = None
        self._start_time: float = 0.0
        self._last_flush_at: datetime | None = None

        # Counters for monitoring
        self._events_emitted = 0
        self._events_dropped = 0
        self._events_processed = 0
        self._batches_flushed = 0

    def set_collector(self, collector: MetricsCollector) -> None:
        """Set the collector for batch writes."""
        self._collector = collector

    # ==========================================================================
    # Fire-and-forget emission (< 1ms)
    # ==========================================================================

    def emit(self, event: MetricEvent) -> bool:
        """Emit a metric event (fire-and-forget).

        Non-blocking operation that takes < 1ms.
        Returns False if queue is full (event dropped).

        Args:
            event: MetricEvent to emit

        Returns:
            True if queued, False if dropped
        """
        try:
            self._queue.put_nowait(event)
            self._events_emitted += 1
            return True
        except asyncio.QueueFull:
            self._events_dropped += 1
            logger.warning(
                "metrics_queue_full",
                event_name=event.event_name,
                queue_size=self.queue_size,
                dropped_total=self._events_dropped,
            )
            return False

    def emit_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        request_id: str | None = None,
        user_id: UUID | None = None,
    ) -> bool:
        """Emit an API request metric event.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path (normalized)
            status_code: HTTP response status code
            duration_ms: Request duration in milliseconds
            request_id: Optional request correlation ID
            user_id: Optional authenticated user ID

        Returns:
            True if queued, False if dropped
        """
        event = MetricEvent.create(
            event_type=EventType.REQUEST,
            event_name=EventName.API_REQUEST,
            method=method,
            path=path,
            status_code=status_code,
            duration_ms=duration_ms,
            request_id=request_id,
            user_id=user_id,
            metadata={
                "status_group": f"{status_code // 100}xx",
            },
        )
        return self.emit(event)

    def emit_business(
        self,
        event_name: str,
        user_id: UUID | None = None,
        course_id: UUID | None = None,
        lesson_id: UUID | None = None,
        metadata: dict[str, str] | None = None,
    ) -> bool:
        """Emit a business event.

        Args:
            event_name: Business event name (from EventName constants)
            user_id: Optional user ID
            course_id: Optional course ID
            lesson_id: Optional lesson ID
            metadata: Optional additional metadata

        Returns:
            True if queued, False if dropped
        """
        event = MetricEvent.create(
            event_type=EventType.BUSINESS,
            event_name=event_name,
            user_id=user_id,
            course_id=course_id,
            lesson_id=lesson_id,
            metadata=metadata or {},
        )
        return self.emit(event)

    def emit_error(
        self,
        error_type: str,
        error_message: str,
        path: str | None = None,
        user_id: UUID | None = None,
        request_id: str | None = None,
    ) -> bool:
        """Emit an error event.

        Args:
            error_type: Type/class of error
            error_message: Error message (sanitized)
            path: Request path where error occurred
            user_id: Optional user ID
            request_id: Optional request correlation ID

        Returns:
            True if queued, False if dropped
        """
        event = MetricEvent.create(
            event_type=EventType.ERROR,
            event_name=f"error_{error_type.lower()}",
            path=path,
            user_id=user_id,
            request_id=request_id,
            metadata={
                "error_type": error_type,
                "error_message": error_message[:200],  # Truncate for safety
            },
        )
        return self.emit(event)

    # ==========================================================================
    # Background Worker
    # ==========================================================================

    async def start(self) -> None:
        """Start the background worker."""
        if self._running:
            logger.warning("metrics_emitter_already_running")
            return

        self._running = True
        self._start_time = time.monotonic()
        self._worker_task = asyncio.create_task(
            self._worker_loop(),
            name="metrics_worker",
        )
        logger.info(
            "metrics_emitter_started",
            queue_size=self.queue_size,
            batch_size=self.batch_size,
            flush_interval=self.flush_interval,
        )

    async def stop(self) -> None:
        """Stop the background worker gracefully."""
        if not self._running:
            return

        self._running = False

        if self._worker_task:
            # Wait for worker to finish current batch
            try:
                await asyncio.wait_for(self._worker_task, timeout=5.0)
            except TimeoutError:
                logger.warning("metrics_worker_stop_timeout")
                self._worker_task.cancel()
            except asyncio.CancelledError:
                pass

        # Flush any remaining events
        await self._flush_remaining()

        logger.info(
            "metrics_emitter_stopped",
            events_emitted=self._events_emitted,
            events_processed=self._events_processed,
            events_dropped=self._events_dropped,
            batches_flushed=self._batches_flushed,
        )

    async def _worker_loop(self) -> None:
        """Main worker loop - processes events in batches.

        Batching strategy:
        1. Collect events until batch_size is reached OR
        2. Flush after flush_interval timeout if there are pending events
        This ensures efficient I/O while maintaining reasonable latency.
        """
        batch: list[MetricEvent] = []

        while self._running:
            try:
                # Try to get an event with timeout
                timeout_reached = False
                try:
                    event = await asyncio.wait_for(
                        self._queue.get(),
                        timeout=self.flush_interval,
                    )
                    batch.append(event)
                except TimeoutError:
                    timeout_reached = True

                # Flush if:
                # 1. Batch is full (reached batch_size), OR
                # 2. Timeout reached AND there are pending events
                if len(batch) >= self.batch_size or (timeout_reached and batch):
                    await self._flush_batch(batch)
                    batch = []

            except asyncio.CancelledError:
                # Flush remaining on cancellation
                if batch:
                    await self._flush_batch(batch)
                raise

            except Exception:
                logger.exception("metrics_worker_error")
                # Continue processing despite errors
                await asyncio.sleep(0.1)

    async def _flush_batch(self, batch: list[MetricEvent]) -> None:
        """Flush a batch of events to storage.

        Args:
            batch: List of events to process
        """
        if not batch:
            return

        start_time = time.perf_counter()

        try:
            # Write to Cassandra via collector
            if self._collector:
                await self._collector.process_batch(batch)

            # Update Redis counters for real-time
            if self.redis:
                await self._update_redis_counters(batch)

            elapsed_ms = (time.perf_counter() - start_time) * 1000
            self._events_processed += len(batch)
            self._batches_flushed += 1
            self._last_flush_at = datetime.now(UTC)

            logger.debug(
                "metrics_batch_flushed",
                batch_size=len(batch),
                elapsed_ms=round(elapsed_ms, 2),
                total_processed=self._events_processed,
            )

        except Exception:
            logger.exception(
                "metrics_batch_flush_error",
                batch_size=len(batch),
            )

    async def _flush_remaining(self) -> None:
        """Flush any remaining events in queue during shutdown."""
        remaining: list[MetricEvent] = []

        while not self._queue.empty():
            try:
                event = self._queue.get_nowait()
                remaining.append(event)
            except asyncio.QueueEmpty:
                break

        if remaining:
            logger.info("metrics_flushing_remaining", count=len(remaining))
            await self._flush_batch(remaining)

    async def _update_redis_counters(self, batch: list[MetricEvent]) -> None:
        """Update Redis counters for real-time metrics.

        Uses Redis pipeline for efficient batch updates.

        Args:
            batch: List of events to count
        """
        if not self.redis:
            return

        hour_bucket = get_hour_bucket()
        counters: dict[str, int] = {}

        for event in batch:
            # Count by event type
            key = f"metrics:{hour_bucket}:{event.event_type}"
            counters[key] = counters.get(key, 0) + 1

            # Count by event name
            key = f"metrics:{hour_bucket}:{event.event_name}"
            counters[key] = counters.get(key, 0) + 1

            # Request-specific counters
            if event.event_type == EventType.REQUEST:
                if event.status_code:
                    status_group = f"{event.status_code // 100}xx"
                    key = f"metrics:{hour_bucket}:status:{status_group}"
                    counters[key] = counters.get(key, 0) + 1

                if event.method:
                    key = f"metrics:{hour_bucket}:method:{event.method}"
                    counters[key] = counters.get(key, 0) + 1

        # Batch update with pipeline
        if counters:
            try:
                pipe = self.redis.pipeline()
                for key, count in counters.items():
                    pipe.incrby(key, count)
                    pipe.expire(key, 7200)  # 2 hours TTL
                await pipe.execute()
            except Exception:
                logger.exception("metrics_redis_counter_error")

    # ==========================================================================
    # Status/Monitoring
    # ==========================================================================

    @property
    def is_running(self) -> bool:
        """Check if worker is running."""
        return self._running

    @property
    def queue_length(self) -> int:
        """Get current queue length."""
        return self._queue.qsize()

    @property
    def queue_utilization(self) -> float:
        """Get queue utilization percentage."""
        return (self._queue.qsize() / self.queue_size) * 100

    @property
    def uptime_seconds(self) -> float:
        """Get worker uptime in seconds."""
        if not self._running or self._start_time == 0:
            return 0.0
        return time.monotonic() - self._start_time

    def get_stats(self) -> dict:
        """Get emitter statistics for monitoring.

        Returns:
            Dict with current stats
        """
        return {
            "running": self._running,
            "queue_size": self.queue_size,
            "queue_length": self._queue.qsize(),
            "queue_utilization": self.queue_utilization,
            "events_emitted": self._events_emitted,
            "events_processed": self._events_processed,
            "events_dropped": self._events_dropped,
            "batches_flushed": self._batches_flushed,
            "last_flush_at": self._last_flush_at,
            "uptime_seconds": self.uptime_seconds,
        }
