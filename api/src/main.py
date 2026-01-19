"""FarmaEasy API - Main Application."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.acquisitions.router import admin_router as acquisitions_admin_router
from src.acquisitions.router import router as acquisitions_router
from src.attachments.router import router as attachments_router
from src.auth.router import router as auth_router
from src.auth.service import AuthService
from src.auth.verification import VerificationService
from src.auth.verification_router import router as verification_router
from src.comments.router import router as comments_router
from src.comments.service import CommentService
from src.config import get_settings
from src.core.context import get_request_id
from src.core.database import init_async_cassandra, shutdown_async_cassandra
from src.core.logging import configure_structlog, get_logger
from src.core.middleware import RequestContextMiddleware
from src.core.redis import init_redis, shutdown_redis
from src.courses.router import router_courses, router_lessons, router_modules
from src.courses.service import CourseService, LessonService, ModuleService
from src.email.router import admin_router as email_admin_router
from src.email.router import router as email_router
from src.email.service import EmailService
from src.health import router as health_router
from src.notifications.admin_router import router as admin_notifications_router
from src.notifications.router import router as notifications_router
from src.notifications.service import NotificationService
from src.notifications.websocket_router import router as notifications_ws_router
from src.progress.router import enrollments_router
from src.progress.router import router as progress_router
from src.progress.service import ProgressService
from src.registration_links.router import public_router as registration_public_router
from src.registration_links.router import router as registration_links_router
from src.registration_links.service import RegistrationLinkService
from src.storage.router import router as storage_router
from src.video.router import router as video_router


# Configure logging early (before creating logger)
settings = get_settings()
configure_structlog(settings, log_dir=Path(settings.log_dir))

logger = get_logger(__name__)


# Application state for dependency injection
class AppState:
    """Application state container."""

    cassandra_session: Any = None
    auth_service: AuthService | None = None
    course_service: CourseService | None = None
    module_service: ModuleService | None = None
    lesson_service: LessonService | None = None
    comment_service: CommentService | None = None
    progress_service: ProgressService | None = None
    notification_service: NotificationService | None = None
    email_service: EmailService | None = None
    verification_service: VerificationService | None = None
    registration_link_service: RegistrationLinkService | None = None
    attachments_service: Any = None  # AttachmentsService (lazy import)


app_state = AppState()


def get_auth_service() -> AuthService:
    """Get AuthService instance from app state."""
    if app_state.auth_service is None:
        msg = "AuthService not initialized"
        raise RuntimeError(msg)
    return app_state.auth_service


def get_course_service() -> CourseService:
    """Get CourseService instance from app state."""
    if app_state.course_service is None:
        msg = "CourseService not initialized"
        raise RuntimeError(msg)
    return app_state.course_service


def get_module_service() -> ModuleService:
    """Get ModuleService instance from app state."""
    if app_state.module_service is None:
        msg = "ModuleService not initialized"
        raise RuntimeError(msg)
    return app_state.module_service


def get_lesson_service() -> LessonService:
    """Get LessonService instance from app state."""
    if app_state.lesson_service is None:
        msg = "LessonService not initialized"
        raise RuntimeError(msg)
    return app_state.lesson_service


def get_comment_service() -> CommentService:
    """Get CommentService instance from app state."""
    if app_state.comment_service is None:
        msg = "CommentService not initialized"
        raise RuntimeError(msg)
    return app_state.comment_service


def get_notification_service() -> NotificationService:
    """Get NotificationService instance from app state."""
    if app_state.notification_service is None:
        msg = "NotificationService not initialized"
        raise RuntimeError(msg)
    return app_state.notification_service


def get_verification_service() -> VerificationService:
    """Get VerificationService instance from app state."""
    if app_state.verification_service is None:
        msg = "VerificationService not initialized"
        raise RuntimeError(msg)
    return app_state.verification_service


def get_registration_link_service() -> RegistrationLinkService:
    """Get RegistrationLinkService instance from app state."""
    if app_state.registration_link_service is None:
        msg = "RegistrationLinkService not initialized"
        raise RuntimeError(msg)
    return app_state.registration_link_service


def get_attachments_service():
    """Get AttachmentsService instance from app state."""
    if app_state.attachments_service is None:
        msg = "AttachmentsService not initialized"
        raise RuntimeError(msg)
    return app_state.attachments_service


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(
        "starting_application",
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )

    # Initialize Redis (non-critical - app works without it)
    redis_client = None
    try:
        redis_client = await init_redis()
        logger.info("redis_initialized")
    except Exception as e:
        logger.warning(
            "redis_init_skipped",
            error=str(e),
            message="Running without Redis - real-time notifications disabled",
        )

    # Initialize Cassandra (async)
    try:
        app_state.cassandra_session = await init_async_cassandra()
        logger.info("cassandra_initialized")

        # Initialize AuthService
        app_state.auth_service = AuthService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
        )
        logger.info("auth_service_initialized")

        # Initialize Course Services
        app_state.course_service = CourseService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
        )
        app_state.module_service = ModuleService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
        )
        app_state.lesson_service = LessonService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
        )
        logger.info("course_services_initialized")

        # Initialize Comment Service with Redis
        app_state.comment_service = CommentService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
            redis=redis_client,
        )
        # Also set on app.state for dependency injection via request.app.state
        app.state.comment_service = app_state.comment_service
        logger.info("comment_service_initialized")

        # Initialize Notification Service with Redis for real-time
        app_state.notification_service = NotificationService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
            redis=redis_client,
        )
        app.state.notification_service = app_state.notification_service
        logger.info(
            "notification_service_initialized", redis_enabled=redis_client is not None
        )

        # Initialize Progress Service
        app_state.progress_service = ProgressService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
        )
        app.state.progress_service = app_state.progress_service
        logger.info("progress_service_initialized")

        # Initialize Registration Link Service
        # Import acquisition service if needed
        from src.acquisitions.service import AcquisitionService

        acquisition_service = AcquisitionService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
            redis=redis_client,
        )

        app_state.registration_link_service = RegistrationLinkService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
            redis=redis_client,
            auth_service=app_state.auth_service,
            acquisition_service=acquisition_service,
        )
        app.state.registration_link_service = app_state.registration_link_service
        logger.info("registration_link_service_initialized")

        # Initialize Attachments Service
        from src.attachments.service import AttachmentsService
        from src.storage.service import FirebaseStorageService

        storage_service = FirebaseStorageService(settings)
        app_state.attachments_service = AttachmentsService(
            session=app_state.cassandra_session,
            keyspace=settings.cassandra_keyspace,
            storage_service=storage_service,
        )
        app.state.attachments_service = app_state.attachments_service
        logger.info("attachments_service_initialized")
    except Exception as e:
        logger.warning(
            "database_init_skipped",
            error=str(e),
            message="Running without database connection",
        )

    # Initialize Email Service (independent of database)
    if settings.email_enabled:
        try:
            app_state.email_service = EmailService(
                credentials_path=settings.email_credentials_path,
                sender_address=settings.email_sender_address,
                sender_name=settings.email_sender_name,
            )
            app.state.email_service = app_state.email_service
            logger.info(
                "email_service_initialized",
                sender=settings.email_sender_address,
            )

            # Initialize Verification Service (requires email and auth services)
            if app_state.auth_service:
                app_state.verification_service = VerificationService(
                    session=app_state.cassandra_session,
                    keyspace=settings.cassandra_keyspace,
                    email_service=app_state.email_service,
                    auth_service=app_state.auth_service,
                )
                await app_state.verification_service.initialize()
                app.state.verification_service = app_state.verification_service
                logger.info("verification_service_initialized")
        except Exception as e:
            logger.warning(
                "email_service_init_skipped",
                error=str(e),
                message="Running without email service",
            )

    yield

    # Shutdown
    logger.info("shutting_down_application")
    await shutdown_redis()
    await shutdown_async_cassandra()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    # SECURITY: Always set debug=False to prevent Starlette's ServerErrorMiddleware
    # from exposing stack traces in responses. Our custom exception handlers will
    # log full details internally while returning safe error messages to users.
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Sistema de Gestao de Farmacia - API",
        debug=False,  # Never expose stack traces in responses
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        openapi_url="/openapi.json" if settings.is_development else None,
    )

    # Request context middleware (must be added first - outermost)
    app.add_middleware(
        RequestContextMiddleware,
        log_requests=settings.log_requests,
        exclude_paths=settings.log_exclude_paths,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
        max_age=settings.cors_max_age,
    )

    # Helper to get request_id from request state or context
    def _get_request_id_safe(request: Request) -> str | None:
        """Get request_id from request state or context."""
        if hasattr(request.state, "request_id"):
            return request.state.request_id
        return get_request_id()

    # Global exception handlers (security: never expose stack traces)
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> ORJSONResponse:
        """Handle HTTP exceptions with safe error messages."""
        request_id = _get_request_id_safe(request)

        # Log the error with full details (for debugging)
        logger.warning(
            "http_exception",
            status_code=exc.status_code,
            detail=str(exc.detail),
            path=request.url.path,
            method=request.method,
        )

        # Return safe error message to user
        return ORJSONResponse(
            status_code=exc.status_code,
            content={
                "error": True,
                "message": str(exc.detail)
                if exc.status_code < status.HTTP_500_INTERNAL_SERVER_ERROR
                else "Internal server error",
                "status_code": exc.status_code,
                "request_id": request_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> ORJSONResponse:
        """Handle validation errors with safe error messages."""
        request_id = _get_request_id_safe(request)

        # Log validation errors
        logger.warning(
            "validation_error",
            errors=exc.errors(),
            path=request.url.path,
            method=request.method,
        )

        # Return user-friendly validation errors (these are safe to expose)
        return ORJSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": True,
                "message": "Validation error",
                "status_code": 422,
                "request_id": request_id,
                "details": [
                    {
                        "field": ".".join(str(loc) for loc in err.get("loc", [])),
                        "message": err.get("msg", "Invalid value"),
                    }
                    for err in exc.errors()
                ],
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(
        request: Request, exc: Exception
    ) -> ORJSONResponse:
        """Catch-all handler for unhandled exceptions.

        SECURITY: Never expose stack traces or internal error details to users.
        All details are logged internally for debugging.
        """
        request_id = _get_request_id_safe(request)

        # Log the full exception with stack trace (for internal debugging)
        logger.exception(
            "unhandled_exception",
            error_type=type(exc).__name__,
            error_message=str(exc),
            path=request.url.path,
            method=request.method,
        )

        # Return generic error message to user (no internal details)
        return ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": True,
                "message": "An unexpected error occurred. Please try again later.",
                "status_code": 500,
                "request_id": request_id,
            },
        )

    # Include routers
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(verification_router)
    app.include_router(router_courses)
    app.include_router(router_modules)
    app.include_router(router_lessons)
    app.include_router(comments_router)
    app.include_router(notifications_router)
    app.include_router(admin_notifications_router)
    app.include_router(notifications_ws_router)  # WebSocket for real-time notifications
    app.include_router(progress_router)
    app.include_router(enrollments_router)
    app.include_router(video_router)
    app.include_router(storage_router)
    app.include_router(attachments_router)
    app.include_router(acquisitions_router)
    app.include_router(acquisitions_admin_router)
    app.include_router(email_router)
    app.include_router(email_admin_router)
    app.include_router(registration_links_router)
    app.include_router(registration_public_router)

    @app.get("/", include_in_schema=False)
    async def root(request: Request) -> dict[str, str]:
        """Root endpoint."""
        return {
            "message": "FarmaEasy API",
            "version": settings.app_version,
            "docs": f"{request.url}docs",
        }

    return app


# Configure router dependencies before creating app
from src.acquisitions.dependencies import (  # noqa: E402
    set_auth_service_getter as set_acquisitions_auth_service_getter,
)
from src.auth.router import set_auth_service_getter  # noqa: E402
from src.auth.verification_router import (  # noqa: E402
    set_verification_service_getter,
)
from src.courses.dependencies import (  # noqa: E402
    set_course_service_getter,
    set_lesson_service_getter,
    set_module_service_getter,
)
from src.notifications.admin_router import (  # noqa: E402
    set_auth_service_getter as set_admin_auth_service_getter,
)
from src.notifications.dependencies import (  # noqa: E402
    set_notification_service_getter,
)
from src.registration_links.dependencies import (  # noqa: E402
    set_service_getter as set_registration_link_service_getter,
)


set_auth_service_getter(get_auth_service)
set_admin_auth_service_getter(get_auth_service)
set_verification_service_getter(get_verification_service)
set_course_service_getter(get_course_service)
set_module_service_getter(get_module_service)
set_lesson_service_getter(get_lesson_service)
set_notification_service_getter(get_notification_service)
set_acquisitions_auth_service_getter(get_auth_service)
set_registration_link_service_getter(get_registration_link_service)

# Configure attachments service dependency
from src.attachments.dependencies import set_attachments_service_getter  # noqa: E402


set_attachments_service_getter(get_attachments_service)


app = create_app()
