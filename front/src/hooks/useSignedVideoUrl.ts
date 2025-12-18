/**
 * Hook for fetching signed video URLs from the backend.
 *
 * Features:
 * - Fetches signed URLs from backend (token signing is server-side)
 * - Caches URLs to avoid unnecessary requests
 * - Handles loading and error states
 * - Auto-refreshes before expiration (URLs expire after ~4 hours)
 * - Works correctly with React StrictMode (prevents double fetches)
 *
 * SECURITY: This hook fetches pre-signed URLs from the backend.
 * The token signing key is never exposed to the frontend.
 */

import { type SignedUrlResponse, videoApi } from "@/lib/video-api";
import type { AxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

// Global cache to persist data across StrictMode remounts and component instances
// Using a Map to store { data, timestamp } for each contentUrl
interface CacheEntry {
  data: SignedUrlResponse;
  timestamp: number;
}
const signedUrlCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<SignedUrlResponse>>();

// Cache TTL: 1 hour (signed URLs expire after ~4 hours, so 1 hour is safe)
const CACHE_TTL_MS = 60 * 60 * 1000;

interface UseSignedVideoUrlOptions {
  /** Prefer HLS streaming over iframe embed */
  preferHls?: boolean;
  /** Auto-start video playback */
  autoplay?: boolean;
  /** Start time in seconds */
  startTime?: number;
  /** Enable auto-fetch on mount */
  enabled?: boolean;
}

interface UseSignedVideoUrlReturn {
  /** Signed embed URL (iframe) */
  embedUrl: string | null;
  /** Signed HLS URL (for direct playback) */
  hlsUrl: string | null;
  /** Detected URL type */
  type: string | null;
  /** Whether the URL is being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch the signed URL */
  refetch: () => Promise<void>;
}

/**
 * Extract error message from various error types
 */
function extractErrorMessage(err: unknown): string {
  // Axios error with response data
  if (err && typeof err === "object" && "response" in err) {
    const axiosErr = err as AxiosError<{ message?: string; detail?: string }>;
    const responseData = axiosErr.response?.data;

    if (responseData?.message) {
      return responseData.message;
    }
    if (responseData?.detail) {
      return String(responseData.detail);
    }
    if (axiosErr.message) {
      return axiosErr.message;
    }
  }

  // Standard Error
  if (err instanceof Error) {
    return err.message;
  }

  // Object with detail field (FastAPI style)
  if (err && typeof err === "object" && "detail" in err) {
    return String((err as { detail: unknown }).detail);
  }

  return "Erro ao obter URL do video";
}

/**
 * Hook to fetch signed video URLs from the backend.
 *
 * @param contentUrl - The original video URL or video ID
 * @param options - Additional options
 * @returns Signed URLs, loading state, and error
 */
export function useSignedVideoUrl(
  contentUrl: string | null | undefined,
  options: UseSignedVideoUrlOptions = {},
): UseSignedVideoUrlReturn {
  const { preferHls = false, autoplay = false, startTime, enabled = true } = options;

  // Initialize state from cache if available
  const getCachedData = useCallback((): SignedUrlResponse | null => {
    if (!contentUrl) return null;
    const cached = signedUrlCache.get(contentUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    return null;
  }, [contentUrl]);

  const [data, setData] = useState<SignedUrlResponse | null>(getCachedData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to prevent race conditions
  const isMountedRef = useRef(true);

  // Store options in ref to avoid dependency issues
  const optionsRef = useRef({ preferHls, autoplay, startTime });
  optionsRef.current = { preferHls, autoplay, startTime };

  const fetchSignedUrl = useCallback(
    async (forceRefetch = false) => {
      // Early exit if no URL
      if (!contentUrl) {
        setData(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      // Check global cache first (unless forced)
      if (!forceRefetch) {
        const cached = signedUrlCache.get(contentUrl);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          setData(cached.data);
          setError(null);
          setIsLoading(false);
          return;
        }
      }

      // Check if there's already a pending request for this URL (deduplication)
      const pending = pendingRequests.get(contentUrl);
      if (pending && !forceRefetch) {
        setIsLoading(true);
        try {
          const response = await pending;
          if (isMountedRef.current) {
            setData(response);
            setError(null);
          }
        } catch (err) {
          if (isMountedRef.current) {
            setError(extractErrorMessage(err));
            setData(null);
          }
        } finally {
          if (isMountedRef.current) {
            setIsLoading(false);
          }
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      // Create the fetch promise
      const opts = optionsRef.current;
      const fetchPromise = videoApi.getSignedUrl({
        content_url: contentUrl,
        prefer_hls: opts.preferHls,
        autoplay: opts.autoplay,
        ...(opts.startTime !== undefined && { start_time: opts.startTime }),
      });

      // Store as pending to deduplicate concurrent requests
      pendingRequests.set(contentUrl, fetchPromise);

      try {
        const response = await fetchPromise;

        // Store in global cache
        signedUrlCache.set(contentUrl, {
          data: response,
          timestamp: Date.now(),
        });

        // Update state if still mounted
        if (isMountedRef.current) {
          setData(response);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const message = extractErrorMessage(err);
          setError(message);
          setData(null);
        }
      } finally {
        // Remove from pending
        pendingRequests.delete(contentUrl);
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [contentUrl],
  );

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-fetch on mount or when contentUrl changes
  useEffect(() => {
    if (enabled && contentUrl) {
      fetchSignedUrl();
    }
  }, [enabled, contentUrl, fetchSignedUrl]);

  // Manual refetch function (forces a new fetch)
  const refetch = useCallback(async () => {
    if (contentUrl) {
      // Clear cache to force refetch
      signedUrlCache.delete(contentUrl);
    }
    await fetchSignedUrl(true);
  }, [contentUrl, fetchSignedUrl]);

  return {
    embedUrl: data?.embed_url ?? null,
    hlsUrl: data?.hls_url ?? null,
    type: data?.type ?? null,
    isLoading,
    error,
    refetch,
  };
}

export default useSignedVideoUrl;
