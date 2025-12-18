"""Tests for health endpoints."""

from fastapi.testclient import TestClient


def test_liveness(client: TestClient) -> None:
    """Test the liveness endpoint."""
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness(client: TestClient) -> None:
    """Test the readiness endpoint."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert "environment" in data
    assert "debug" in data


def test_health(client: TestClient) -> None:
    """Test the general health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app_name"] == "farmaeasy"
    assert "version" in data
    assert "environment" in data


def test_root(client: TestClient) -> None:
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "FarmaEasy" in data["message"]
    assert "version" in data
