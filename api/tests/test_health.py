"""Tests for health endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


def test_liveness(client: TestClient) -> None:
    """Test the liveness endpoint - should always return alive."""
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


@pytest.fixture
def mock_cassandra_healthy():
    """Mock Cassandra as healthy."""
    with patch(
        "src.health.router.AsyncCassandraConnection.health_check",
        new_callable=AsyncMock,
        return_value={"healthy": True, "status": "connected"},
    ):
        yield


@pytest.fixture
def mock_cassandra_unhealthy():
    """Mock Cassandra as unhealthy."""
    with patch(
        "src.health.router.AsyncCassandraConnection.health_check",
        new_callable=AsyncMock,
        return_value={"healthy": False, "error": "Not connected"},
    ):
        yield


@pytest.fixture
def mock_redis_healthy():
    """Mock Redis as healthy."""
    with patch(
        "src.health.router.get_redis",
        return_value=AsyncMock(ping=AsyncMock(return_value=True)),
    ):
        yield


@pytest.fixture
def mock_redis_unhealthy():
    """Mock Redis as unavailable."""
    with patch("src.health.router.get_redis", return_value=None):
        yield


class TestReadinessEndpoint:
    """Tests for readiness probe endpoint."""

    def test_ready_when_cassandra_healthy(
        self, client: TestClient, mock_cassandra_healthy
    ) -> None:
        """Readiness should return 200 when Cassandra is healthy."""
        response = client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert "environment" in data

    def test_not_ready_when_cassandra_unhealthy(
        self, client: TestClient, mock_cassandra_unhealthy
    ) -> None:
        """Readiness should return 503 when Cassandra is unavailable."""
        response = client.get("/health/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["reason"] == "cassandra_unavailable"


class TestHealthEndpoint:
    """Tests for detailed health endpoint."""

    def test_healthy_when_all_dependencies_ok(
        self, client: TestClient, mock_cassandra_healthy, mock_redis_healthy
    ) -> None:
        """Health should return 200 when all dependencies are healthy."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app_name"] == "farmaeasy"
        assert "version" in data
        assert "environment" in data
        assert "dependencies" in data
        assert data["dependencies"]["cassandra"]["healthy"] is True
        assert data["dependencies"]["redis"]["healthy"] is True

    def test_degraded_when_cassandra_unhealthy(
        self, client: TestClient, mock_cassandra_unhealthy, mock_redis_healthy
    ) -> None:
        """Health should return 503 when Cassandra is unavailable."""
        response = client.get("/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["dependencies"]["cassandra"]["healthy"] is False

    def test_healthy_when_redis_unavailable(
        self, client: TestClient, mock_cassandra_healthy, mock_redis_unhealthy
    ) -> None:
        """Health should still be healthy when only Redis is unavailable.

        Redis is optional - app works without it (real-time features disabled).
        """
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["dependencies"]["redis"]["healthy"] is False


def test_root(client: TestClient) -> None:
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "FarmaEasy" in data["message"]
    assert "version" in data
