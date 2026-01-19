# ==============================================================================
# FarmaEasy API - Dockerfile
# Multi-stage build with UV package manager
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# Installs dependencies and builds the application
# ------------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS builder

# Copy uv binary from official image (pinned version for reproducibility)
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

WORKDIR /app

# UV configuration for optimized builds
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# Copy dependency files first (for cache optimization)
COPY api/pyproject.toml api/uv.lock ./

# Copy submodules to /modules (matches pyproject.toml path: ../modules relative to /app)
COPY modules/ /modules/

# Install dependencies without the project itself
# This layer is cached unless pyproject.toml or uv.lock changes
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

# Copy source code
COPY api/ /app/

# Install the project (separate layer for better caching)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

# ------------------------------------------------------------------------------
# Stage 2: Runtime
# Minimal image for production
# ------------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

# Create non-root user for security
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Environment configuration
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    # Application defaults
    API_HOST=0.0.0.0 \
    API_PORT=8000

# Copy virtual environment and source from builder
COPY --from=builder --chown=appuser:appgroup /app/.venv /app/.venv
COPY --from=builder --chown=appuser:appgroup /app/src /app/src

# Create logs directory with correct permissions
RUN mkdir -p /app/logs && chown appuser:appgroup /app/logs

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${API_PORT}/health/live || exit 1

# Expose port
EXPOSE ${API_PORT}

# Default command
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

# ------------------------------------------------------------------------------
# Stage 3: Development
# Includes dev dependencies and tools
# ------------------------------------------------------------------------------
FROM builder AS development

# Install dev dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

# Create non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

# Environment for development
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=development \
    DEBUG=true \
    API_HOST=0.0.0.0 \
    API_PORT=8000

# Expose port
EXPOSE ${API_PORT}

# Default command for development with hot-reload
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "src"]
