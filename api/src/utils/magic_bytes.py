"""Magic bytes detection for file type validation.

Validates actual file content against declared Content-Type for security (OWASP).
Prevents file type spoofing attacks where malicious files are disguised as images.
"""

from typing import NamedTuple


# Minimum bytes needed for detection
MIN_BYTES_FOR_DETECTION = 4
WEBP_HEADER_LENGTH = 12


class MagicSignature(NamedTuple):
    """Magic bytes signature for a file type."""

    bytes_pattern: bytes
    mime_type: str
    offset: int = 0


# Common image magic bytes signatures
# Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
MAGIC_SIGNATURES: list[MagicSignature] = [
    # JPEG - FF D8 FF
    MagicSignature(b"\xff\xd8\xff", "image/jpeg"),
    # PNG - 89 50 4E 47 0D 0A 1A 0A
    MagicSignature(b"\x89PNG\r\n\x1a\n", "image/png"),
    # GIF87a
    MagicSignature(b"GIF87a", "image/gif"),
    # GIF89a
    MagicSignature(b"GIF89a", "image/gif"),
    # WebP - RIFF....WEBP
    MagicSignature(b"RIFF", "image/webp"),
    # BMP - 42 4D
    MagicSignature(b"BM", "image/bmp"),
    # ICO - 00 00 01 00
    MagicSignature(b"\x00\x00\x01\x00", "image/x-icon"),
    # TIFF (little endian) - 49 49 2A 00
    MagicSignature(b"II*\x00", "image/tiff"),
    # TIFF (big endian) - 4D 4D 00 2A
    MagicSignature(b"MM\x00*", "image/tiff"),
    # AVIF - ....ftypavif
    MagicSignature(b"ftypavif", "image/avif", offset=4),
    # HEIC - ....ftypheic or ....ftypmif1
    MagicSignature(b"ftypheic", "image/heic", offset=4),
    MagicSignature(b"ftypmif1", "image/heic", offset=4),
    # SVG (XML-based, check for opening tag)
    MagicSignature(b"<svg", "image/svg+xml"),
    MagicSignature(b"<?xml", "image/svg+xml"),
]

# Group signatures by media type for compatibility checking
IMAGE_MIME_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/bmp",
        "image/x-icon",
        "image/tiff",
        "image/avif",
        "image/heic",
        "image/svg+xml",
    }
)


def detect_content_type(data: bytes) -> str | None:
    """Detect content type from file magic bytes.

    Args:
        data: First 64+ bytes of file content.

    Returns:
        Detected MIME type or None if unknown.
    """
    if len(data) < MIN_BYTES_FOR_DETECTION:
        return None

    # Check WebP specifically (RIFF + WEBP at offset 8)
    if (
        data[:4] == b"RIFF"
        and len(data) >= WEBP_HEADER_LENGTH
        and data[8:12] == b"WEBP"
    ):
        return "image/webp"

    # Check other signatures
    for sig in MAGIC_SIGNATURES:
        if sig.offset > 0:
            # Check at specific offset
            end_offset = sig.offset + len(sig.bytes_pattern)
            if (
                len(data) > end_offset
                and data[sig.offset : end_offset] == sig.bytes_pattern
            ):
                return sig.mime_type
        elif data.startswith(sig.bytes_pattern):
            return sig.mime_type

    return None


def validate_content_type(  # noqa: PLR0911
    data: bytes,
    declared_type: str | None,
    *,
    strict: bool = False,
    allowed_types: frozenset[str] | None = None,
) -> tuple[bool, str | None, str | None]:
    """Validate file content against declared Content-Type.

    Args:
        data: First 64+ bytes of file content.
        declared_type: Content-Type header value.
        strict: If True, requires exact MIME type match.
                If False, allows compatible types within same media class.
        allowed_types: Set of allowed MIME types. None = allow all detected.

    Returns:
        Tuple of (is_valid, detected_type, error_message).

    Examples:
        >>> # Strict mode - exact match required
        >>> validate_content_type(jpeg_bytes, "image/jpeg", strict=True)
        (True, "image/jpeg", None)

        >>> # Non-strict - compatible types OK
        >>> validate_content_type(jpeg_bytes, "image/png", strict=False)
        (True, "image/jpeg", None)  # Both are images

        >>> # Invalid - not an image
        >>> validate_content_type(exe_bytes, "image/jpeg", strict=False)
        (False, None, "File content does not match an image type")
    """
    detected_type = detect_content_type(data)

    # Could not detect type
    if detected_type is None:
        return (False, None, "Unable to detect file type from content")

    # Check if detected type is in allowed types
    if allowed_types is not None and detected_type not in allowed_types:
        return (
            False,
            detected_type,
            f"File type '{detected_type}' is not allowed. "
            f"Allowed: {', '.join(sorted(allowed_types))}",
        )

    # No declared type to compare against
    if not declared_type:
        return (True, detected_type, None)

    # Normalize declared type (remove parameters like charset)
    declared_base = declared_type.split(";")[0].strip().lower()

    # Strict mode: exact match required
    if strict:
        if detected_type != declared_base:
            return (
                False,
                detected_type,
                f"Content-Type mismatch: declared '{declared_base}', "
                f"detected '{detected_type}'",
            )
        return (True, detected_type, None)

    # Non-strict mode: same media class is OK
    detected_class = detected_type.split("/")[0]
    declared_class = declared_base.split("/")[0]

    if detected_class != declared_class:
        return (
            False,
            detected_type,
            f"Media class mismatch: declared '{declared_class}', "
            f"detected '{detected_class}'",
        )

    return (True, detected_type, None)


def is_valid_image(data: bytes) -> bool:
    """Check if data represents a valid image file.

    Args:
        data: First 64+ bytes of file content.

    Returns:
        True if valid image detected.
    """
    detected = detect_content_type(data)
    return detected is not None and detected in IMAGE_MIME_TYPES
