"""Health check endpoints."""

from fastapi import APIRouter

from src.config import get_settings


router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def liveness() -> dict[str, str]:
    """Liveness probe - checks if the application is running."""
    return {"status": "alive"}


@router.get("/ready")
async def readiness() -> dict[str, str | bool]:
    """Readiness probe - checks if the application is ready to serve requests."""
    settings = get_settings()
    return {
        "status": "ready",
        "environment": settings.environment,
        "debug": settings.debug,
    }


@router.get("")
async def health() -> dict[str, str]:
    """General health check endpoint."""
    settings = get_settings()
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }
