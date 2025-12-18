"""FastAPI dependencies for progress tracking.

Provides dependency injection for:
- Progress service
- Error handlers
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from .service import (
    ProgressError,
    ProgressService,
)


async def get_progress_service(request: Request) -> ProgressService:
    """Get progress service from app state.

    Args:
        request: FastAPI request

    Returns:
        ProgressService instance
    """
    app_state = request.app.state
    if not hasattr(app_state, "progress_service") or not app_state.progress_service:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servico de progresso nao disponivel",
        )
    return app_state.progress_service


# Type alias for dependency injection
ProgressServiceDep = Annotated[ProgressService, Depends(get_progress_service)]


def handle_progress_error(error: ProgressError) -> HTTPException:
    """Convert progress errors to HTTP exceptions.

    Args:
        error: Progress error

    Returns:
        HTTPException with appropriate status code
    """
    status_map = {
        "not_enrolled": status.HTTP_404_NOT_FOUND,
        "already_enrolled": status.HTTP_409_CONFLICT,
        "progress_not_found": status.HTTP_404_NOT_FOUND,
    }

    status_code = status_map.get(error.code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    return HTTPException(
        status_code=status_code,
        detail=error.message,
    )
