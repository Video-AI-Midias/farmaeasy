"""Application settings using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = Field(default="farmaeasy", description="Application name")
    app_version: str = Field(default="0.1.0", description="Application version")
    environment: Literal["development", "staging", "production", "testing"] = Field(
        default="development", description="Environment name"
    )
    debug: bool = Field(default=True, description="Debug mode")

    # API Server
    api_host: str = Field(default="0.0.0.0", description="API host")
    api_port: int = Field(default=8000, description="API port")
    api_workers: int = Field(default=1, description="Number of workers")
    api_reload: bool = Field(default=True, description="Enable auto-reload")

    # Security
    secret_key: str = Field(
        default="change-me-in-production-with-a-secure-32-char-key!",
        description="Secret key for JWT",
    )
    trusted_hosts: list[str] = Field(
        default=["localhost", "127.0.0.1"],
        description="Trusted hosts",
    )

    # Authentication
    auth_secret_key: str = Field(
        default="dev-jwt-secret-key-change-in-production-32chars!",
        description="JWT signing key (min 32 chars)",
    )
    auth_algorithm: str = Field(default="HS256", description="JWT algorithm")
    auth_access_token_expire_minutes: int = Field(
        default=15, description="Access token expiration (minutes)"
    )
    auth_refresh_token_expire_days: int = Field(
        default=7, description="Refresh token expiration (days)"
    )
    auth_cookie_secure: bool = Field(
        default=False, description="Secure cookie (HTTPS only)"
    )
    auth_cookie_httponly: bool = Field(
        default=True, description="HttpOnly cookie (no JS access)"
    )
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", description="SameSite cookie policy"
    )
    auth_cookie_name: str = Field(
        default="farmaeasy_refresh_token", description="Refresh token cookie name"
    )
    auth_default_max_concurrent_sessions: int = Field(
        default=10,
        description="Default max concurrent sessions per user (can be overridden per user)",
    )

    # Redis
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )
    redis_max_connections: int = Field(default=10, description="Max Redis connections")
    redis_socket_timeout: float = Field(default=5.0, description="Redis socket timeout")
    redis_socket_connect_timeout: float = Field(
        default=5.0, description="Redis connect timeout"
    )
    redis_retry_on_timeout: bool = Field(default=True, description="Retry on timeout")
    redis_health_check_interval: int = Field(
        default=30, description="Health check interval"
    )

    # Cassandra
    cassandra_hosts: list[str] = Field(
        default=["localhost"], description="Cassandra hosts"
    )
    cassandra_port: int = Field(default=9042, description="Cassandra port")
    cassandra_keyspace: str = Field(
        default="farmaeasy", description="Cassandra keyspace"
    )
    cassandra_username: str | None = Field(default=None, description="Cassandra user")
    cassandra_password: str | None = Field(
        default=None, description="Cassandra password"
    )
    cassandra_protocol_version: int = Field(default=4, description="Protocol version")
    cassandra_connect_timeout: float = Field(
        default=10.0, description="Connect timeout"
    )
    cassandra_request_timeout: float = Field(
        default=10.0, description="Request timeout"
    )

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="DEBUG", description="Log level"
    )
    log_format: Literal["json", "console"] = Field(
        default="console", description="Log format"
    )
    log_include_timestamp: bool = Field(default=True, description="Include timestamp")
    log_include_caller_info: bool = Field(
        default=True, description="Include caller info"
    )
    log_include_stack_info: bool = Field(default=True, description="Include stack info")
    log_dir: str = Field(default="logs", description="Directory for log files")
    log_file_max_bytes: int = Field(
        default=10 * 1024 * 1024, description="Max size per log file (10MB default)"
    )
    log_file_backup_count: int = Field(
        default=5, description="Number of backup log files to keep"
    )
    log_requests: bool = Field(
        default=True, description="Log HTTP request start/finish"
    )
    log_exclude_paths: list[str] = Field(
        default=["/health", "/health/live", "/health/ready"],
        description="Paths to exclude from request logging",
    )

    # CORS
    cors_origins: list[str] = Field(default=["*"], description="CORS origins")
    cors_allow_credentials: bool = Field(default=True, description="Allow credentials")
    cors_allow_methods: list[str] = Field(default=["*"], description="Allowed methods")
    cors_allow_headers: list[str] = Field(default=["*"], description="Allowed headers")
    cors_max_age: int = Field(default=600, description="CORS max age")

    # Compression
    compression_enabled: bool = Field(default=True, description="Enable compression")
    compression_minimum_size: int = Field(
        default=500, description="Minimum size for compression"
    )
    compression_gzip_level: int = Field(default=6, description="Gzip compression level")
    compression_brotli_quality: int = Field(
        default=4, description="Brotli compression quality"
    )
    compression_zstd_level: int = Field(default=4, description="Zstd compression level")

    # Bunny.net Stream
    bunny_library_id: str | None = Field(
        default=None, description="Bunny.net Stream Library ID"
    )
    bunny_cdn_hostname: str | None = Field(
        default=None, description="Bunny.net CDN hostname (e.g., vz-xxx.b-cdn.net)"
    )
    bunny_token_key: str | None = Field(
        default=None, description="Bunny.net Token Authentication Key (KEEP SECRET!)"
    )
    bunny_token_expiry_seconds: int = Field(
        default=14400, description="Token expiry time in seconds (default: 4 hours)"
    )

    # Firebase Storage
    firebase_enabled: bool = Field(
        default=False, description="Enable Firebase Storage for uploads"
    )
    firebase_credentials_path: str | None = Field(
        default=None, description="Path to Firebase service account JSON file"
    )
    firebase_storage_bucket: str | None = Field(
        default=None,
        description="Firebase Storage bucket (e.g., project-id.appspot.com)",
    )
    firebase_project_id: str | None = Field(
        default=None, description="Firebase project ID"
    )

    # Upload Settings
    upload_max_file_size_mb: int = Field(
        default=10, description="Maximum file size for uploads in MB"
    )
    upload_allowed_image_types: list[str] = Field(
        default=["image/jpeg", "image/png", "image/webp", "image/gif"],
        description="Allowed image MIME types",
    )
    upload_rate_limit_per_minute: int = Field(
        default=30, description="Maximum uploads per minute per user"
    )

    # Email (Gmail API)
    email_enabled: bool = Field(
        default=False, description="Enable email sending via Gmail API"
    )
    email_credentials_path: str = Field(
        default="credentials/google-service-account.json",
        description="Path to Google service account JSON file",
    )
    email_sender_address: str = Field(
        default="contato@farmaeasy.com.br",
        description="Sender email address (must be in Google Workspace domain)",
    )
    email_sender_name: str = Field(
        default="FarmaEasy", description="Sender display name"
    )

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.environment == "production"

    @property
    def is_testing(self) -> bool:
        """Check if running in testing mode."""
        return self.environment == "testing"

    @property
    def bunny_configured(self) -> bool:
        """Check if Bunny.net Stream is configured."""
        return bool(
            self.bunny_library_id and self.bunny_cdn_hostname and self.bunny_token_key
        )

    @property
    def firebase_configured(self) -> bool:
        """Check if Firebase Storage is configured."""
        return bool(
            self.firebase_enabled
            and self.firebase_credentials_path
            and self.firebase_storage_bucket
        )

    @property
    def email_configured(self) -> bool:
        """Check if Gmail API email is configured."""
        return bool(self.email_enabled and self.email_sender_address)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
