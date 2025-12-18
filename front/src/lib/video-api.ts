/**
 * Video API client for Bunny.net Stream integration.
 *
 * Features:
 * - Generate signed video URLs from backend
 * - Check video configuration status
 * - Support for both embed and HLS URLs
 *
 * SECURITY: All token signing is done server-side.
 * The frontend never has access to Bunny.net API keys or token keys.
 */

import { api } from "./api";

/**
 * Request for generating signed video URL
 */
export interface SignedUrlRequest {
  content_url: string;
  prefer_hls?: boolean;
  autoplay?: boolean;
  start_time?: number;
}

/**
 * Response with signed video URLs
 */
export interface SignedUrlResponse {
  video_id: string;
  embed_url: string | null;
  hls_url: string | null;
  thumbnail_url: string | null;
  thumbnail_animated_url: string | null;
  type: string;
}

/**
 * Video configuration status
 */
export interface VideoConfigResponse {
  configured: boolean;
  library_id: string | null;
  cdn_hostname: string | null;
}

/**
 * Request for generating thumbnail URL
 */
export interface ThumbnailRequest {
  content_url: string;
  animated?: boolean;
}

/**
 * Response with thumbnail URL
 */
export interface ThumbnailResponse {
  video_id: string;
  thumbnail_url: string;
  animated: boolean;
}

/**
 * Video API endpoints
 */
export const videoApi = {
  /**
   * Check video streaming configuration status.
   * Does NOT expose sensitive information like token keys.
   */
  getConfig: async (): Promise<VideoConfigResponse> => {
    const response = await api.get<VideoConfigResponse>("/video/config");
    return response.data;
  },

  /**
   * Generate signed URLs for video playback.
   * Requires authentication.
   *
   * @param request - Video URL or ID with options
   * @returns Signed embed and/or HLS URLs with thumbnails
   */
  getSignedUrl: async (request: SignedUrlRequest): Promise<SignedUrlResponse> => {
    const response = await api.post<SignedUrlResponse>("/video/signed-url", request);
    return response.data;
  },

  /**
   * Generate thumbnail URL from video content.
   * Does NOT require authentication.
   *
   * @param request - Video URL or ID with options
   * @returns Thumbnail URL
   */
  getThumbnail: async (request: ThumbnailRequest): Promise<ThumbnailResponse> => {
    const response = await api.post<ThumbnailResponse>("/video/thumbnail", request);
    return response.data;
  },
};

// =============================================================================
// Utility functions for generating thumbnail URLs without API calls
// =============================================================================

/**
 * Regex patterns to extract video ID from various URL formats
 */
const VIDEO_ID_PATTERNS = {
  // Just a UUID (video ID only)
  videoId: /^[a-f0-9-]{36}$/i,
  // Embed URL: iframe.mediadelivery.net/embed/{library_id}/{video_id}
  embed: /iframe\.mediadelivery\.net\/embed\/\d+\/([a-f0-9-]+)/i,
  // Play URL: iframe.mediadelivery.net/play/{library_id}/{video_id}
  play: /iframe\.mediadelivery\.net\/play\/\d+\/([a-f0-9-]+)/i,
  // HLS URL: {video_id}/playlist.m3u8
  hls: /([a-f0-9-]{36})\/playlist\.m3u8/i,
  // CDN URL: {hostname}/{video_id}/...
  cdn: /b-cdn\.net\/([a-f0-9-]{36})/i,
};

/**
 * Extract video ID from a video URL or video ID string.
 *
 * @param contentUrl - Video URL or video ID
 * @returns Video ID if found, null otherwise
 */
export function extractVideoId(contentUrl: string | null | undefined): string | null {
  if (!contentUrl) return null;

  const url = contentUrl.trim();

  // Check if it's just a video ID
  if (VIDEO_ID_PATTERNS.videoId.test(url)) {
    return url;
  }

  // Try each pattern
  for (const pattern of Object.values(VIDEO_ID_PATTERNS)) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Generate Bunny.net thumbnail URL from a video ID.
 * Bunny.net automatically generates thumbnails for all uploaded videos.
 *
 * URL format: https://{cdn_hostname}/{video_id}/thumbnail.jpg
 * Animated:   https://{cdn_hostname}/{video_id}/preview.webp
 *
 * @param cdnHostname - Bunny CDN hostname (e.g., "vz-xxx.b-cdn.net")
 * @param videoId - Video ID (UUID format)
 * @param animated - If true, returns animated WebP preview URL
 * @returns Thumbnail URL
 */
export function generateThumbnailUrl(
  cdnHostname: string,
  videoId: string,
  animated = false,
): string {
  const filename = animated ? "preview.webp" : "thumbnail.jpg";
  return `https://${cdnHostname}/${videoId}/${filename}`;
}

/**
 * Generate thumbnail URL from a content URL.
 * Extracts the video ID and constructs the thumbnail URL.
 *
 * @param cdnHostname - Bunny CDN hostname (e.g., "vz-xxx.b-cdn.net")
 * @param contentUrl - Video URL or video ID
 * @param animated - If true, returns animated WebP preview URL
 * @returns Thumbnail URL or null if video ID cannot be extracted
 */
export function getThumbnailUrlFromContent(
  cdnHostname: string | null | undefined,
  contentUrl: string | null | undefined,
  animated = false,
): string | null {
  if (!cdnHostname || !contentUrl) return null;

  const videoId = extractVideoId(contentUrl);
  if (!videoId) return null;

  return generateThumbnailUrl(cdnHostname, videoId, animated);
}

export default videoApi;
