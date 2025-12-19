"""Dependency injection for acquisitions module."""

from typing import Annotated

from fastapi import Depends

from src.auth.service import AuthService
from src.config.settings import Settings, get_settings
from src.core.database.cassandra import get_cassandra_session
from src.core.redis import get_redis

from .service import AcquisitionService


def get_acquisition_service(
    session: Annotated[object, Depends(get_cassandra_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AcquisitionService:
    """Get AcquisitionService instance."""
    redis = get_redis()
    return AcquisitionService(
        session=session,
        keyspace=settings.cassandra_keyspace,
        redis=redis,
    )


AcquisitionServiceDep = Annotated[AcquisitionService, Depends(get_acquisition_service)]


# ==============================================================================
# Auth Service Dependency (for listing course students with user data)
# ==============================================================================

# Module-level reference to be overridden by main.py
_auth_service_getter = None


def set_auth_service_getter(getter):
    """Set the auth service getter function.

    Called by main.py during app initialization.
    """
    global _auth_service_getter  # noqa: PLW0603 - Required for DI pattern
    _auth_service_getter = getter


def get_auth_service() -> AuthService:
    """Get AuthService instance.

    Uses the getter function set by main.py at startup.
    """
    if _auth_service_getter is None:
        raise RuntimeError(
            "AuthService not configured - call set_auth_service_getter first"
        )
    return _auth_service_getter()


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
