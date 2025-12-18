"""Bunny.net Stream service for secure video URL generation.

This service handles:
- Generating signed embed URLs for Bunny.net Stream videos
- Token authentication for secure video access
- URL parsing and video ID extraction

SECURITY: The token_key is kept server-side and never exposed to clients.
"""

import hashlib
import re
import time
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urlencode, urlparse

import structlog

from src.config.settings import Settings


logger = structlog.get_logger(__name__)


class VideoUrlType(str, Enum):
    """Types of video URLs supported."""

    EMBED = "embed"  # iframe.mediadelivery.net/embed/...
    PLAY = "play"  # iframe.mediadelivery.net/play/...
    HLS = "hls"  # .m3u8 streams
    DIRECT = "direct"  # Direct video file
    VIDEO_ID = "video_id"  # Just a video ID


@dataclass
class ParsedVideoUrl:
    """Parsed video URL information."""

    url_type: VideoUrlType
    video_id: str
    library_id: str | None = None
    original_url: str = ""


class BunnyServiceError(Exception):
    """Base exception for Bunny service errors."""


class VideoNotConfiguredError(BunnyServiceError):
    """Raised when Bunny.net is not configured."""


class InvalidVideoUrlError(BunnyServiceError):
    """Raised when a video URL cannot be parsed."""


class BunnyService:
    """Service for generating secure Bunny.net Stream URLs.

    This service generates signed URLs that include:
    - token: SHA256 hash of (token_key + video_id + expiration)
    - expires: UNIX timestamp for URL expiration

    The signing is done server-side to keep the token_key secret.
    """

    # Regex patterns for URL parsing
    EMBED_PATTERN = re.compile(
        r"iframe\.mediadelivery\.net/embed/(\d+)/([a-f0-9-]+)", re.IGNORECASE
    )
    PLAY_PATTERN = re.compile(
        r"iframe\.mediadelivery\.net/play/(\d+)/([a-f0-9-]+)", re.IGNORECASE
    )
    HLS_PATTERN = re.compile(r"([a-f0-9-]+)/playlist\.m3u8", re.IGNORECASE)
    VIDEO_ID_PATTERN = re.compile(r"^[a-f0-9-]{36}$", re.IGNORECASE)

    def __init__(self, settings: Settings) -> None:
        """Initialize Bunny service with settings.

        Args:
            settings: Application settings containing Bunny configuration.
        """
        self.settings = settings
        self._library_id = settings.bunny_library_id
        self._cdn_hostname = settings.bunny_cdn_hostname
        self._token_key = settings.bunny_token_key
        self._token_expiry = settings.bunny_token_expiry_seconds

    @property
    def is_configured(self) -> bool:
        """Check if Bunny.net is properly configured."""
        return self.settings.bunny_configured

    def _ensure_configured(self) -> None:
        """Raise error if Bunny.net is not configured."""
        if not self.is_configured:
            raise VideoNotConfiguredError(
                "Bunny.net Stream is not configured. "
                "Please set BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME, and BUNNY_TOKEN_KEY."
            )

    def parse_video_url(self, url: str) -> ParsedVideoUrl:
        """Parse a video URL to extract video ID and type.

        Args:
            url: The video URL or video ID to parse.

        Returns:
            ParsedVideoUrl with extracted information.

        Raises:
            InvalidVideoUrlError: If URL cannot be parsed.
        """
        url = url.strip()

        # Check if it's just a video ID
        if self.VIDEO_ID_PATTERN.match(url):
            return ParsedVideoUrl(
                url_type=VideoUrlType.VIDEO_ID,
                video_id=url,
                library_id=self._library_id,
                original_url=url,
            )

        # Check for embed URL
        match = self.EMBED_PATTERN.search(url)
        if match:
            return ParsedVideoUrl(
                url_type=VideoUrlType.EMBED,
                video_id=match.group(2),
                library_id=match.group(1),
                original_url=url,
            )

        # Check for play URL
        match = self.PLAY_PATTERN.search(url)
        if match:
            return ParsedVideoUrl(
                url_type=VideoUrlType.PLAY,
                video_id=match.group(2),
                library_id=match.group(1),
                original_url=url,
            )

        # Check for HLS URL
        match = self.HLS_PATTERN.search(url)
        if match:
            return ParsedVideoUrl(
                url_type=VideoUrlType.HLS,
                video_id=match.group(1),
                library_id=self._library_id,
                original_url=url,
            )

        # Check for direct video files
        if any(ext in url.lower() for ext in [".mp4", ".webm", ".ogg", ".mov"]):
            # Try to extract video ID from path
            parsed = urlparse(url)
            path_parts = parsed.path.strip("/").split("/")
            for part in path_parts:
                if self.VIDEO_ID_PATTERN.match(part):
                    return ParsedVideoUrl(
                        url_type=VideoUrlType.DIRECT,
                        video_id=part,
                        library_id=self._library_id,
                        original_url=url,
                    )

        raise InvalidVideoUrlError(f"Cannot parse video URL: {url}")

    def _generate_token(self, video_id: str, expires: int) -> str:
        """Generate SHA256 token for video authentication.

        Algorithm: SHA256_HEX(token_key + video_id + expires)

        Args:
            video_id: The video ID.
            expires: UNIX timestamp for expiration.

        Returns:
            Hexadecimal SHA256 hash.
        """
        if not self._token_key:
            raise VideoNotConfiguredError("Token key not configured")

        # Bunny.net algorithm: SHA256(token_key + video_id + expiration_timestamp)
        data = f"{self._token_key}{video_id}{expires}"
        return hashlib.sha256(data.encode()).hexdigest()

    def generate_signed_embed_url(
        self,
        video_id: str,
        library_id: str | None = None,
        *,
        autoplay: bool = False,
        captions: bool = True,
        show_speed: bool = True,
        remember_position: bool = True,
        preload: str = "metadata",
        start_time: int | None = None,
    ) -> str:
        """Generate a signed embed URL for iframe embedding.

        Args:
            video_id: The video ID.
            library_id: Optional library ID (uses default if not provided).
            autoplay: Auto-start playback.
            captions: Show captions button.
            show_speed: Show playback speed control.
            remember_position: Remember playback position.
            preload: Preload strategy (none, metadata, auto).
            start_time: Start time in seconds.

        Returns:
            Signed embed URL with token and expires parameters.
        """
        self._ensure_configured()

        lib_id = library_id or self._library_id
        if not lib_id:
            raise VideoNotConfiguredError("Library ID not configured")

        # Calculate expiration
        expires = int(time.time()) + self._token_expiry

        # Generate token
        token = self._generate_token(video_id, expires)

        # Build query parameters
        params: dict[str, str | int] = {
            "token": token,
            "expires": expires,
        }

        if autoplay:
            params["autoplay"] = "true"
        if not captions:
            params["captions"] = "false"
        if not show_speed:
            params["showSpeed"] = "false"
        if not remember_position:
            params["rememberPosition"] = "false"
        if preload != "metadata":
            params["preload"] = preload
        if start_time and start_time > 0:
            params["t"] = start_time

        query_string = urlencode(params)
        url = (
            f"https://iframe.mediadelivery.net/embed/{lib_id}/{video_id}?{query_string}"
        )

        logger.debug(
            "Generated signed embed URL",
            video_id=video_id,
            library_id=lib_id,
            expires=expires,
        )

        return url

    def generate_signed_hls_url(
        self,
        video_id: str,
        *,
        _start_time: int | None = None,  # Reserved for future use
    ) -> str:
        """Generate a signed HLS streaming URL.

        Args:
            video_id: The video ID.
            _start_time: Reserved for future use (HLS doesn't support start time in URL).

        Returns:
            Signed HLS URL with token authentication.
        """
        self._ensure_configured()

        if not self._cdn_hostname:
            raise VideoNotConfiguredError("CDN hostname not configured")

        # Calculate expiration
        expires = int(time.time()) + self._token_expiry

        # For HLS, the token path needs to include the video path
        token_path = f"/{video_id}/"

        # Generate token for the path
        # Bunny CDN Token Auth: SHA256(token_key + path + expiration)
        data = f"{self._token_key}{token_path}{expires}"
        token = hashlib.sha256(data.encode()).hexdigest()

        # Build URL with token parameters
        # Format: https://hostname/bcdn_token=TOKEN&expires=EXPIRES&token_path=PATH/video_id/playlist.m3u8
        url = (
            f"https://{self._cdn_hostname}/"
            f"bcdn_token={token}&"
            f"expires={expires}&"
            f"token_path={token_path}/"
            f"{video_id}/playlist.m3u8"
        )

        logger.debug(
            "Generated signed HLS URL",
            video_id=video_id,
            expires=expires,
        )

        return url

    def get_signed_url(
        self,
        content_url: str,
        *,
        prefer_hls: bool = False,
        autoplay: bool = False,
        start_time: int | None = None,
    ) -> dict[str, str | None]:
        """Get signed URL(s) for a video.

        This is the main method to use for getting playable URLs.
        It parses the input URL and generates appropriate signed URLs.

        Args:
            content_url: The original content URL or video ID.
            prefer_hls: Prefer HLS streaming over iframe embed.
            autoplay: Auto-start playback (for embed).
            start_time: Start time in seconds.

        Returns:
            Dict with 'embed_url' and optionally 'hls_url'.
        """
        self._ensure_configured()

        parsed = self.parse_video_url(content_url)
        video_id = parsed.video_id
        library_id = parsed.library_id

        result: dict[str, str | None] = {
            "video_id": video_id,
            "embed_url": None,
            "hls_url": None,
            "type": parsed.url_type.value,
        }

        # Always generate embed URL
        result["embed_url"] = self.generate_signed_embed_url(
            video_id=video_id,
            library_id=library_id,
            autoplay=autoplay,
            start_time=start_time,
        )

        # Generate HLS URL if requested or if original was HLS
        if prefer_hls or parsed.url_type == VideoUrlType.HLS:
            result["hls_url"] = self.generate_signed_hls_url(
                video_id=video_id,
                start_time=start_time,
            )

        return result

    def generate_thumbnail_url(
        self,
        video_id: str,
        *,
        animated: bool = False,
    ) -> str:
        """Generate thumbnail URL for a video.

        Bunny.net automatically generates thumbnails for uploaded videos.
        The thumbnail is accessible at: https://{cdn_hostname}/{video_id}/thumbnail.jpg
        Animated previews are at: https://{cdn_hostname}/{video_id}/preview.webp

        Args:
            video_id: The video ID (UUID format).
            animated: If True, returns animated WebP preview URL instead of static JPEG.

        Returns:
            Thumbnail URL.

        Raises:
            VideoNotConfiguredError: If CDN hostname is not configured.
        """
        if not self._cdn_hostname:
            raise VideoNotConfiguredError("CDN hostname not configured")

        filename = "preview.webp" if animated else "thumbnail.jpg"
        return f"https://{self._cdn_hostname}/{video_id}/{filename}"

    def get_thumbnail_url_from_content(
        self,
        content_url: str,
        *,
        animated: bool = False,
    ) -> str | None:
        """Extract video ID from content URL and generate thumbnail URL.

        This is a convenience method that parses a video URL and returns
        the corresponding thumbnail URL.

        Args:
            content_url: The video URL or video ID.
            animated: If True, returns animated WebP preview URL.

        Returns:
            Thumbnail URL if video ID can be extracted, None otherwise.
        """
        if not self._cdn_hostname:
            return None

        try:
            parsed = self.parse_video_url(content_url)
            return self.generate_thumbnail_url(parsed.video_id, animated=animated)
        except InvalidVideoUrlError:
            return None
