"""Structlog configuration with console and file output.

This module configures structlog for structured logging with:
- Console output (colored or plain)
- File output with rotation
- Request context injection via contextvars
- JSON and key-value formatting options
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import structlog
from structlog.types import EventDict, Processor


if TYPE_CHECKING:
    from src.config.settings import Settings

from src.core.context import get_context


def add_context_processor(
    logger: logging.Logger,
    method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """Add request context (request_id, user_id, etc.) to log events.

    This processor injects context variables from contextvars into every log entry.
    """
    context = get_context()
    event_dict.update(context)
    return event_dict


def add_app_info_processor(
    app_name: str,
    app_version: str,
    environment: str,
) -> Processor:
    """Create a processor that adds application info to log events.

    Args:
        app_name: Application name.
        app_version: Application version.
        environment: Environment name (development, production, etc.).

    Returns:
        A processor function.
    """

    def processor(
        logger: logging.Logger,
        method_name: str,
        event_dict: EventDict,
    ) -> EventDict:
        event_dict["app"] = app_name
        event_dict["version"] = app_version
        event_dict["environment"] = environment
        return event_dict

    return processor


# Minimum length for partial masking (show first 2 and last 2 chars)
_MIN_MASK_LENGTH = 4


def filter_sensitive_data(
    logger: logging.Logger,
    method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """Filter sensitive data from log events.

    Masks passwords, tokens, and other sensitive fields.
    """
    sensitive_keys = {
        "password",
        "passwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "authorization",
        "auth",
        "credentials",
        "credit_card",
        "card_number",
        "cvv",
        "ssn",
    }

    def mask_value(key: str, value: Any) -> Any:
        if isinstance(value, str) and any(
            sensitive in key.lower() for sensitive in sensitive_keys
        ):
            if len(value) > _MIN_MASK_LENGTH:
                return value[:2] + "*" * (len(value) - _MIN_MASK_LENGTH) + value[-2:]
            return "***"
        if isinstance(value, dict):
            return {k: mask_value(k, v) for k, v in value.items()}
        return value

    return {k: mask_value(k, v) for k, v in event_dict.items()}


def setup_file_handler(
    log_dir: Path,
    log_file: str,
    max_bytes: int,
    backup_count: int,
    log_level: str,
) -> RotatingFileHandler:
    """Setup rotating file handler for logging.

    Args:
        log_dir: Directory to store log files.
        log_file: Name of the log file.
        max_bytes: Maximum size of each log file in bytes.
        backup_count: Number of backup files to keep.
        log_level: Logging level.

    Returns:
        Configured RotatingFileHandler.
    """
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / log_file

    handler = RotatingFileHandler(
        filename=str(log_path),
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    handler.setLevel(getattr(logging, log_level.upper()))
    return handler


def setup_console_handler(log_level: str) -> logging.StreamHandler:
    """Setup console handler for logging.

    Args:
        log_level: Logging level.

    Returns:
        Configured StreamHandler.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, log_level.upper()))
    return handler


def configure_structlog(
    settings: "Settings",
    log_dir: Path | str | None = None,
) -> None:
    """Configure structlog with console and file output.

    Args:
        settings: Application settings.
        log_dir: Directory for log files. Defaults to ./logs.
    """
    log_format: Literal["json", "console"] = settings.log_format
    log_level = settings.log_level

    # Determine log directory
    if log_dir is None:
        log_dir = Path("logs")
    elif isinstance(log_dir, str):
        log_dir = Path(log_dir)

    # Common processors for all outputs
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        add_context_processor,
        filter_sensitive_data,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    # Add caller info if enabled
    if settings.log_include_caller_info:
        shared_processors.append(
            structlog.processors.CallsiteParameterAdder(
                parameters=[
                    structlog.processors.CallsiteParameter.FILENAME,
                    structlog.processors.CallsiteParameter.LINENO,
                    structlog.processors.CallsiteParameter.FUNC_NAME,
                ]
            )
        )

    # Configure final processor based on format
    if log_format == "json":
        # JSON format for production
        final_processor: Processor = structlog.processors.JSONRenderer()
    else:
        # Console format for development (colored output)
        final_processor = structlog.dev.ConsoleRenderer(
            colors=True,
            exception_formatter=structlog.dev.plain_traceback,
        )

    # Setup stdlib logging
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, log_level.upper()),
        handlers=[],
    )

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    # Add console handler
    console_handler = setup_console_handler(log_level)
    console_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=final_processor,
            foreign_pre_chain=shared_processors,
        )
    )
    root_logger.addHandler(console_handler)

    # Add file handler with JSON format always (for log analysis)
    file_handler = setup_file_handler(
        log_dir=log_dir,
        log_file=f"{settings.app_name}.log",
        max_bytes=settings.log_file_max_bytes,
        backup_count=settings.log_file_backup_count,
        log_level=log_level,
    )
    file_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=shared_processors,
        )
    )
    root_logger.addHandler(file_handler)

    # Add error file handler (errors and above)
    error_handler = setup_file_handler(
        log_dir=log_dir,
        log_file=f"{settings.app_name}.error.log",
        max_bytes=settings.log_file_max_bytes,
        backup_count=settings.log_file_backup_count,
        log_level="ERROR",
    )
    error_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=shared_processors,
        )
    )
    root_logger.addHandler(error_handler)

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            add_context_processor,
            filter_sensitive_data,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Silence noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("cassandra").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structlog logger instance.

    Args:
        name: Logger name. If None, uses the calling module's name.

    Returns:
        A configured structlog logger.
    """
    return structlog.get_logger(name)
