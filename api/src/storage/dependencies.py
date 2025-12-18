"""Dependencies for storage module."""

from typing import Annotated

from fastapi import Depends

from src.config.settings import Settings, get_settings
from src.storage.service import FirebaseStorageService


# Storage service singleton
_storage_service: FirebaseStorageService | None = None


def get_storage_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FirebaseStorageService:
    """Get storage service instance (singleton).

    Args:
        settings: Application settings.

    Returns:
        FirebaseStorageService instance.
    """
    global _storage_service  # noqa: PLW0603

    if _storage_service is None:
        _storage_service = FirebaseStorageService(settings)

    return _storage_service


# Type alias for dependency injection
StorageServiceDep = Annotated[FirebaseStorageService, Depends(get_storage_service)]
