"""Tests for the metrics module.

Tests cover:
- MetricsEmitter fire-and-forget emission
- MetricEvent model creation
- Path normalization in middleware
- Decorator functionality
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from src.metrics.decorators import _extract_value, emit_business_event, track_event
from src.metrics.emitter import MetricsEmitter, get_metrics_emitter, set_metrics_emitter
from src.metrics.middleware import MetricsMiddleware
from src.metrics.models import (
    EventName,
    EventType,
    MetricEvent,
    generate_dimension_key,
    get_day_bucket,
    get_hour_bucket,
    get_month_bucket,
)
from src.metrics.schemas import DashboardMetrics, MetricEventCreate, TimeSeriesPoint


# ==============================================================================
# Model Tests
# ==============================================================================


class TestMetricEvent:
    """Tests for MetricEvent model."""

    def test_create_request_event(self):
        """Test creating a request metric event."""
        event = MetricEvent.create(
            event_type=EventType.REQUEST,
            event_name=EventName.API_REQUEST,
            method="GET",
            path="/v1/courses",
            status_code=200,
            duration_ms=45.5,
            request_id="req-123",
        )

        assert event.event_type == EventType.REQUEST
        assert event.event_name == EventName.API_REQUEST
        assert event.method == "GET"
        assert event.path == "/v1/courses"
        assert event.status_code == 200
        assert event.duration_ms == Decimal("45.5")
        assert event.request_id == "req-123"
        assert event.created_at is not None
        assert event.hour_bucket is not None

    def test_create_business_event(self):
        """Test creating a business metric event."""
        user_id = uuid4()
        course_id = uuid4()

        event = MetricEvent.create(
            event_type=EventType.BUSINESS,
            event_name=EventName.ENROLLMENT_CREATED,
            user_id=user_id,
            course_id=course_id,
            metadata={"plan": "premium"},
        )

        assert event.event_type == EventType.BUSINESS
        assert event.event_name == EventName.ENROLLMENT_CREATED
        assert event.user_id == user_id
        assert event.course_id == course_id
        assert event.metadata == {"plan": "premium"}

    def test_hour_bucket_format(self):
        """Test hour bucket format."""
        bucket = get_hour_bucket()
        # Format should be YYYY-MM-DD-HH
        assert len(bucket) == 13
        assert bucket[4] == "-"
        assert bucket[7] == "-"
        assert bucket[10] == "-"

    def test_day_bucket_format(self):
        """Test day bucket format."""
        bucket = get_day_bucket()
        # Format should be YYYY-MM-DD
        assert len(bucket) == 10
        assert bucket[4] == "-"
        assert bucket[7] == "-"

    def test_month_bucket_format(self):
        """Test month bucket format."""
        bucket = get_month_bucket()
        # Format should be YYYY-MM
        assert len(bucket) == 7
        assert bucket[4] == "-"

    def test_generate_dimension_key_empty(self):
        """Test dimension key generation with empty dict."""
        key = generate_dimension_key({})
        assert key == "default"

    def test_generate_dimension_key_single(self):
        """Test dimension key generation with single dimension."""
        key1 = generate_dimension_key({"status": "200"})
        key2 = generate_dimension_key({"status": "200"})
        assert key1 == key2
        assert len(key1) == 16

    def test_generate_dimension_key_deterministic(self):
        """Test dimension key is deterministic regardless of dict order."""
        key1 = generate_dimension_key({"a": "1", "b": "2"})
        key2 = generate_dimension_key({"b": "2", "a": "1"})
        assert key1 == key2


# ==============================================================================
# Emitter Tests
# ==============================================================================


class TestMetricsEmitter:
    """Tests for MetricsEmitter."""

    @pytest.fixture
    def emitter(self):
        """Create an emitter for testing."""
        return MetricsEmitter(
            redis=None,
            queue_size=100,
            batch_size=10,
            flush_interval=0.1,
        )

    def test_emit_event(self, emitter):
        """Test emitting an event adds it to the queue."""
        event = MetricEvent.create(
            event_type=EventType.REQUEST,
            event_name=EventName.API_REQUEST,
        )

        result = emitter.emit(event)

        assert result is True
        assert emitter.queue_length == 1

    def test_emit_queue_full(self, emitter):
        """Test emitting when queue is full returns False."""
        # Fill the queue
        for _ in range(100):
            event = MetricEvent.create(
                event_type=EventType.REQUEST,
                event_name=EventName.API_REQUEST,
            )
            emitter.emit(event)

        # Next emit should fail
        event = MetricEvent.create(
            event_type=EventType.REQUEST,
            event_name=EventName.API_REQUEST,
        )
        result = emitter.emit(event)

        assert result is False
        assert emitter._events_dropped == 1

    def test_emit_request(self, emitter):
        """Test emit_request helper."""
        result = emitter.emit_request(
            method="POST",
            path="/v1/users",
            status_code=201,
            duration_ms=100.5,
            request_id="req-456",
        )

        assert result is True
        assert emitter.queue_length == 1

    def test_emit_business(self, emitter):
        """Test emit_business helper."""
        user_id = uuid4()
        course_id = uuid4()

        result = emitter.emit_business(
            event_name=EventName.LESSON_COMPLETED,
            user_id=user_id,
            course_id=course_id,
        )

        assert result is True
        assert emitter.queue_length == 1

    def test_emit_error(self, emitter):
        """Test emit_error helper."""
        result = emitter.emit_error(
            error_type="ValidationError",
            error_message="Invalid input",
            path="/v1/courses",
        )

        assert result is True
        assert emitter.queue_length == 1

    def test_get_stats(self, emitter):
        """Test getting emitter stats."""
        stats = emitter.get_stats()

        assert "running" in stats
        assert "queue_size" in stats
        assert "queue_length" in stats
        assert "events_emitted" in stats
        assert "events_dropped" in stats

    @pytest.mark.asyncio
    async def test_start_stop(self, emitter):
        """Test starting and stopping the emitter."""
        await emitter.start()
        assert emitter.is_running is True

        await emitter.stop()
        assert emitter.is_running is False


class TestGlobalEmitter:
    """Tests for global emitter functions."""

    def test_set_get_emitter(self):
        """Test setting and getting global emitter."""
        emitter = MetricsEmitter(redis=None)

        set_metrics_emitter(emitter)
        assert get_metrics_emitter() is emitter

        # Cleanup
        set_metrics_emitter(None)
        assert get_metrics_emitter() is None


# ==============================================================================
# Middleware Tests
# ==============================================================================


class TestMetricsMiddleware:
    """Tests for MetricsMiddleware."""

    def test_normalize_path_uuid(self):
        """Test path normalization replaces UUIDs."""
        middleware = MetricsMiddleware.__new__(MetricsMiddleware)
        middleware.normalize_paths = True

        path = "/v1/courses/550e8400-e29b-41d4-a716-446655440000/lessons"
        normalized = middleware._normalize_path(path)

        assert ":id" in normalized
        assert "550e8400" not in normalized

    def test_normalize_path_numeric_id(self):
        """Test path normalization replaces numeric IDs."""
        middleware = MetricsMiddleware.__new__(MetricsMiddleware)
        middleware.normalize_paths = True

        path = "/v1/users/12345/posts/67890"
        normalized = middleware._normalize_path(path)

        assert "12345" not in normalized
        assert "67890" not in normalized

    def test_should_exclude_exact_match(self):
        """Test path exclusion with exact match."""
        middleware = MetricsMiddleware.__new__(MetricsMiddleware)
        middleware.exclude_paths = {"/health", "/metrics"}

        assert middleware._should_exclude("/health") is True
        assert middleware._should_exclude("/metrics") is True
        assert middleware._should_exclude("/v1/courses") is False

    def test_should_exclude_prefix_match(self):
        """Test path exclusion with prefix match."""
        middleware = MetricsMiddleware.__new__(MetricsMiddleware)
        middleware.exclude_paths = {"/health"}

        assert middleware._should_exclude("/health/live") is True
        assert middleware._should_exclude("/health/ready") is True


# ==============================================================================
# Decorator Tests
# ==============================================================================


class TestTrackEventDecorator:
    """Tests for @track_event decorator."""

    @pytest.mark.asyncio
    async def test_track_event_async(self):
        """Test decorator on async function."""
        mock_emitter = MagicMock()
        mock_emitter.emit_business = MagicMock(return_value=True)
        set_metrics_emitter(mock_emitter)

        @track_event("test_event")
        async def my_async_func(user_id: UUID) -> str:
            return "result"

        user_id = uuid4()
        result = await my_async_func(user_id)

        assert result == "result"
        mock_emitter.emit_business.assert_called_once()

        # Cleanup
        set_metrics_emitter(None)

    def test_track_event_sync(self):
        """Test decorator on sync function."""
        mock_emitter = MagicMock()
        mock_emitter.emit_business = MagicMock(return_value=True)
        set_metrics_emitter(mock_emitter)

        @track_event("test_event")
        def my_sync_func(user_id: UUID) -> str:
            return "result"

        user_id = uuid4()
        result = my_sync_func(user_id)

        assert result == "result"
        mock_emitter.emit_business.assert_called_once()

        # Cleanup
        set_metrics_emitter(None)

    def test_extract_value_simple(self):
        """Test extracting simple value from args."""
        user_id = uuid4()
        args = {"user_id": user_id}

        extracted = _extract_value(args, None, "user_id")

        assert extracted == user_id

    def test_extract_value_nested(self):
        """Test extracting nested value from args."""

        class User:
            def __init__(self, id: UUID):
                self.id = id

        user_id = uuid4()
        user = User(id=user_id)
        args = {"user": user}

        extracted = _extract_value(args, None, "user.id")

        assert extracted == user_id

    def test_extract_value_missing(self):
        """Test extracting missing value returns None."""
        args = {"other": "value"}

        extracted = _extract_value(args, None, "user_id")

        assert extracted is None


class TestEmitBusinessEvent:
    """Tests for emit_business_event helper."""

    def test_emit_business_event_no_emitter(self):
        """Test emit returns False when no emitter set."""
        set_metrics_emitter(None)

        result = emit_business_event(
            event_name="test_event",
            user_id=uuid4(),
        )

        assert result is False

    def test_emit_business_event_with_emitter(self):
        """Test emit returns True when emitter is set."""
        mock_emitter = MagicMock()
        mock_emitter.emit_business = MagicMock(return_value=True)
        set_metrics_emitter(mock_emitter)

        result = emit_business_event(
            event_name="test_event",
            user_id=uuid4(),
        )

        assert result is True
        mock_emitter.emit_business.assert_called_once()

        # Cleanup
        set_metrics_emitter(None)


# ==============================================================================
# Schema Tests
# ==============================================================================


class TestSchemas:
    """Tests for Pydantic schemas."""

    def test_metric_event_create(self):
        """Test MetricEventCreate schema validation."""
        data = MetricEventCreate(
            event_type="business",
            event_name="enrollment_created",
            user_id=uuid4(),
            metadata={"plan": "free"},
        )

        assert data.event_type == "business"
        assert data.event_name == "enrollment_created"
        assert data.metadata == {"plan": "free"}

    def test_time_series_point(self):
        """Test TimeSeriesPoint schema."""
        point = TimeSeriesPoint(
            timestamp=datetime.now(UTC),
            value=42.5,
            metric="api_request",
            dimensions={"status": "2xx"},
        )

        assert point.value == 42.5
        assert point.metric == "api_request"

    def test_dashboard_metrics(self):
        """Test DashboardMetrics schema."""
        now = datetime.now(UTC)
        metrics = DashboardMetrics(
            period="today",
            period_start=now,
            period_end=now,
            requests_total=100,
            requests_success=95,
            requests_error=5,
            avg_response_time_ms=45.5,
            p95_response_time_ms=120.0,
            active_users=50,
            new_users=10,
            enrollments=25,
            completions=100,
            comments=30,
            requests_trend=5.5,
            users_trend=10.0,
            enrollments_trend=-2.0,
            generated_at=now,
        )

        assert metrics.requests_total == 100
        assert metrics.requests_success == 95
        assert metrics.active_users == 50
