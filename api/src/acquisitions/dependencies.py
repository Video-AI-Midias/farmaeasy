"""Dependency injection for acquisitions module."""

from typing import Annotated

from fastapi import Depends

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
