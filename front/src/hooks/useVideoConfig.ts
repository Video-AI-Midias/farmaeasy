/**
 * Hook for video configuration and thumbnail URL generation.
 *
 * Features:
 * - Loads video config from API (once)
 * - Caches cdn_hostname for thumbnail URL generation
 * - Provides utility functions for generating thumbnail URLs
 *
 * Usage:
 * ```tsx
 * const { cdnHostname, getThumbnailUrl, isConfigured } = useVideoConfig();
 * const thumbnail = getThumbnailUrl(lesson.content_url);
 * ```
 */

import { type VideoConfigResponse, getThumbnailUrlFromContent, videoApi } from "@/lib/video-api";
import { useCallback, useEffect, useState } from "react";

// Cache the config at module level to avoid re-fetching
let cachedConfig: VideoConfigResponse | null = null;
let configPromise: Promise<VideoConfigResponse> | null = null;

/**
 * Fetch video config with caching.
 * Only fetches once per session.
 */
async function fetchVideoConfig(): Promise<VideoConfigResponse> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (configPromise) {
    return configPromise;
  }

  configPromise = videoApi
    .getConfig()
    .then((config) => {
      cachedConfig = config;
      return config;
    })
    .catch((error) => {
      console.error("Failed to fetch video config:", error);
      // Return empty config on error
      const emptyConfig: VideoConfigResponse = {
        configured: false,
        library_id: null,
        cdn_hostname: null,
      };
      cachedConfig = emptyConfig;
      return emptyConfig;
    })
    .finally(() => {
      configPromise = null;
    });

  return configPromise;
}

/**
 * Hook for video configuration.
 *
 * @returns Video config state and thumbnail URL generator function
 */
export function useVideoConfig() {
  const [config, setConfig] = useState<VideoConfigResponse | null>(cachedConfig);
  const [isLoading, setIsLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      setIsLoading(false);
      return;
    }

    fetchVideoConfig().then((result) => {
      setConfig(result);
      setIsLoading(false);
    });
  }, []);

  /**
   * Generate thumbnail URL from a content URL.
   *
   * @param contentUrl - Video URL or video ID
   * @param animated - If true, returns animated WebP preview
   * @returns Thumbnail URL or null if not configured/invalid
   */
  const getThumbnailUrl = useCallback(
    (contentUrl: string | null | undefined, animated = false): string | null => {
      if (!config?.cdn_hostname) return null;
      return getThumbnailUrlFromContent(config.cdn_hostname, contentUrl, animated);
    },
    [config?.cdn_hostname],
  );

  return {
    /** Whether video streaming is configured */
    isConfigured: config?.configured ?? false,
    /** Whether config is still loading */
    isLoading,
    /** Bunny CDN hostname for thumbnail URLs */
    cdnHostname: config?.cdn_hostname ?? null,
    /** Bunny library ID */
    libraryId: config?.library_id ?? null,
    /** Generate thumbnail URL from content URL */
    getThumbnailUrl,
    /** Full config object */
    config,
  };
}

export default useVideoConfig;
