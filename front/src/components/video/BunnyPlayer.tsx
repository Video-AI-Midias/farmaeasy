/**
 * Bunny.net Stream video player component.
 *
 * Supports multiple video source formats:
 * - Bunny iframe embed URLs (iframe.mediadelivery.net/embed/)
 * - Bunny play URLs (iframe.mediadelivery.net/play/ -> converted to embed)
 * - HLS/m3u8 streams (using HLS.js)
 * - CDN URLs (b-cdn.net with playlist.m3u8)
 *
 * Features:
 * - Auto-detection of URL type
 * - Responsive player
 * - Player.js integration for iframe control
 * - HLS.js for direct stream playback
 * - Progress tracking with callbacks
 * - Keyboard shortcuts support
 */

import { cn } from "@/lib/utils";
import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

// Player.js type declarations for iframe mode
// NOTE: Getter methods are CALLBACK-BASED per Player.js spec!
// See: https://github.com/embedly/player.js and https://docs.bunny.net/docs/playback-control-api
interface BunnyPlayerInstance {
  play: () => void;
  pause: () => void;
  setCurrentTime: (seconds: number) => void;
  // Getter methods require callbacks - they do NOT return values directly!
  getCurrentTime: (callback: (seconds: number) => void) => void;
  getDuration: (callback: (seconds: number) => void) => void;
  setVolume: (level: number) => void;
  getVolume: (callback: (level: number) => void) => void;
  setMuted: (muted: boolean) => void;
  getMuted: (callback: (muted: boolean) => void) => void;
  getPaused: (callback: (paused: boolean) => void) => void;
  on: (event: string, callback: (data?: unknown) => void) => void;
  off: (event: string, callback: (data?: unknown) => void) => void;
  supports: (type: "method" | "event", name: string) => boolean;
}

declare global {
  interface Window {
    playerjs: {
      Player: new (iframe: HTMLIFrameElement) => BunnyPlayerInstance;
    };
  }
}

interface BunnyPlayerProps {
  /** Video source - can be embed URL, play URL, or HLS m3u8 URL */
  src: string;
  /** Bunny video library ID (required if src is just videoId) */
  libraryId?: string;
  /** Video title for accessibility */
  title?: string;
  /** Callback when video progress changes (percentage 0-100) */
  onProgress?: (progress: number, currentTime: number, duration: number) => void;
  /** Callback when video ends */
  onEnded?: () => void;
  /** Callback when video starts playing */
  onPlay?: () => void;
  /** Callback when video is paused */
  onPause?: () => void;
  /** Callback when player is ready */
  onReady?: (player: BunnyPlayerInstance | HTMLVideoElement) => void;
  /** Callback on error */
  onError?: (error: unknown) => void;
  /** Start time in seconds */
  startTime?: number;
  /** Enable autoplay */
  autoplay?: boolean;
  /** Enable captions by default */
  captions?: boolean;
  /** Show speed control */
  showSpeed?: boolean;
  /** Remember playback position */
  rememberPosition?: boolean;
  /** Enable Chromecast */
  chromecast?: boolean;
  /** Preload strategy */
  preload?: "none" | "metadata" | "auto";
  /** Additional CSS classes */
  className?: string;
  /** Aspect ratio - default 16:9 */
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
}

// Track progress at these intervals (percentage)
const PROGRESS_TRACK_INTERVAL = 5;

/**
 * Detect the type of video URL
 */
type VideoSourceType =
  | "iframe-embed"
  | "iframe-embed-signed"
  | "iframe-play"
  | "hls"
  | "direct"
  | "video-id";

function detectSourceType(src: string): VideoSourceType {
  // HLS/m3u8 stream
  if (src.includes(".m3u8") || src.includes("playlist.m3u8")) {
    return "hls";
  }

  // Bunny iframe embed URL - check if already signed (has token & expires)
  if (src.includes("iframe.mediadelivery.net/embed/")) {
    // If URL contains token and expires, it's already signed by backend
    if (src.includes("token=") && src.includes("expires=")) {
      return "iframe-embed-signed";
    }
    return "iframe-embed";
  }

  // Bunny play URL (needs conversion to embed)
  if (src.includes("iframe.mediadelivery.net/play/")) {
    return "iframe-play";
  }

  // Direct video URL (mp4, webm, etc.)
  if (src.match(/\.(mp4|webm|ogg|mov)(\?|$)/i)) {
    return "direct";
  }

  // CDN URL with video files
  if (src.includes("b-cdn.net") || src.includes("bunnycdn.com")) {
    // Check if it's a CDN HLS stream
    if (src.includes("/playlist") || src.includes("video_id")) {
      return "hls";
    }
    return "direct";
  }

  // Full URL that we don't recognize - try as iframe
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return "iframe-embed";
  }

  // Just a video ID
  return "video-id";
}

/**
 * Convert play URL to embed URL
 */
function convertPlayToEmbed(url: string): string {
  return url.replace("/play/", "/embed/");
}

/**
 * Build Bunny.net Stream embed URL with query parameters.
 */
function buildEmbedUrl(
  src: string,
  libraryId: string | undefined,
  options: {
    autoplay: boolean;
    captions: boolean;
    showSpeed: boolean;
    rememberPosition: boolean;
    chromecast: boolean;
    preload: "none" | "metadata" | "auto";
    startTime: number | undefined;
  },
): string {
  const sourceType = detectSourceType(src);
  let baseUrl: string;

  switch (sourceType) {
    case "iframe-embed":
      baseUrl = src;
      break;
    case "iframe-play":
      baseUrl = convertPlayToEmbed(src);
      break;
    case "video-id":
      if (libraryId) {
        baseUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${src}`;
      } else if (src.includes("/")) {
        baseUrl = `https://iframe.mediadelivery.net/embed/${src}`;
      } else {
        throw new Error("libraryId required when src is just a video ID");
      }
      break;
    default:
      // HLS or direct - these shouldn't use iframe
      baseUrl = src;
  }

  // Parse existing URL to add/update query params
  const url = new URL(baseUrl);

  // Add query parameters
  url.searchParams.set("autoplay", options.autoplay.toString());
  url.searchParams.set("captions", options.captions.toString());
  url.searchParams.set("showSpeed", options.showSpeed.toString());
  url.searchParams.set("preload", options.preload);

  if (options.rememberPosition) {
    url.searchParams.set("rememberPosition", "true");
  }
  if (options.chromecast) {
    url.searchParams.set("chromecast", "true");
  }
  if (options.startTime && options.startTime > 0) {
    url.searchParams.set("t", options.startTime.toString());
  }

  // Add responsive flag for better iframe sizing
  url.searchParams.set("responsive", "true");

  return url.toString();
}

/**
 * HLS Video Player component
 */
function HLSPlayer({
  src,
  title,
  onProgress,
  onEnded,
  onPlay,
  onPause,
  onReady,
  onError,
  startTime,
  autoplay,
  className,
}: {
  src: string;
  title: string;
  onProgress?: (progress: number, currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (error: unknown) => void;
  startTime?: number;
  autoplay?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastProgressRef = useRef<number>(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs for callbacks to avoid re-running effects when callbacks change reference
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with props
  useEffect(() => {
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check if HLS is supported natively (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        setIsReady(true);
        onReadyRef.current?.(video);
        if (startTime && startTime > 0) {
          video.currentTime = startTime;
        }
        if (autoplay) {
          video.play().catch(() => {
            // Autoplay blocked by browser
          });
        }
      });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
        setError(null);
        onReadyRef.current?.(video);
        if (startTime && startTime > 0) {
          video.currentTime = startTime;
        }
        if (autoplay) {
          video.play().catch(() => {
            // Autoplay blocked by browser
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Erro de rede ao carregar video");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Erro de midia ao reproduzir video");
              hls.recoverMediaError();
              break;
            default:
              setError("Erro fatal ao carregar video");
              onErrorRef.current?.(data);
              break;
          }
        }
      });
    } else {
      setError("Seu navegador nao suporta reproducao de video HLS");
      onErrorRef.current?.("HLS not supported");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, startTime, autoplay]);

  // Event handlers - use refs to avoid re-running when callbacks change
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const currentTime = video.currentTime;
      const duration = video.duration;
      if (duration > 0 && !Number.isNaN(duration)) {
        const progress = Math.floor((currentTime / duration) * 100);

        if (
          Math.floor(progress / PROGRESS_TRACK_INTERVAL) !==
          Math.floor(lastProgressRef.current / PROGRESS_TRACK_INTERVAL)
        ) {
          lastProgressRef.current = progress;
          onProgressRef.current?.(progress, currentTime, duration);
        }
      }
    };

    const handleEnded = () => {
      const duration = video.duration;
      onProgressRef.current?.(100, duration, duration);
      onEndedRef.current?.();
    };

    const handlePlay = () => onPlayRef.current?.();
    const handlePause = () => onPauseRef.current?.();

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, []);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-lg aspect-video",
          className,
        )}
      >
        <div className="text-center text-muted-foreground p-4">
          <p className="font-medium">Erro ao carregar video</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-black", className)}>
      <video
        ref={videoRef}
        title={title}
        controls
        playsInline
        className="w-full h-full aspect-video"
      >
        <track kind="captions" srcLang="pt" label="Portugues" default />
      </video>
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

/**
 * Iframe Video Player component
 */
// Type for timeupdate event data from Player.js
interface TimeupdateData {
  seconds: number;
  duration: number;
}

function IframePlayer({
  embedUrl,
  title,
  onProgress,
  onEnded,
  onPlay,
  onPause,
  onReady,
  onError,
  startTime,
  className,
  aspectRatioClass,
}: {
  embedUrl: string;
  title: string;
  onProgress?: (progress: number, currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReady?: (player: BunnyPlayerInstance) => void;
  onError?: (error: unknown) => void;
  startTime?: number;
  className?: string;
  aspectRatioClass: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<BunnyPlayerInstance | null>(null);
  const lastProgressRef = useRef<number>(0);
  const lastDurationRef = useRef<number>(0); // Store duration for ended event
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEmbedUrlRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Log the embed URL for debugging (only in dev)
  useEffect(() => {
    if (embedUrl) {
      console.log("[BunnyPlayer] Embed URL configured:", {
        url: `${embedUrl.substring(0, 100)}...`,
        hasToken: embedUrl.includes("token="),
        hasExpires: embedUrl.includes("expires="),
      });
    }
  }, [embedUrl]);

  // Use refs for callbacks to avoid re-creating initializePlayer when callbacks change
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onReadyRef = useRef(onReady);

  // Keep refs in sync with props
  useEffect(() => {
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onReadyRef.current = onReady;
  });

  // Reset state when embedUrl changes (using ref comparison to avoid linter warning)
  if (prevEmbedUrlRef.current !== null && prevEmbedUrlRef.current !== embedUrl) {
    // URL changed - reset state synchronously during render
    setIsReady(false);
    setError(null);
    lastProgressRef.current = 0;
    lastDurationRef.current = 0;
    playerRef.current = null;
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
  }
  prevEmbedUrlRef.current = embedUrl;

  // Load Player.js script
  useEffect(() => {
    if (typeof window.playerjs !== "undefined") {
      console.log("[BunnyPlayer] Player.js already loaded");
      return;
    }

    console.log("[BunnyPlayer] Loading Player.js script...");
    const script = document.createElement("script");
    // Use latest version as recommended by Bunny.net docs
    script.src = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
    script.async = true;
    script.onload = () => {
      console.log("[BunnyPlayer] Player.js script loaded successfully");
    };
    script.onerror = () => {
      console.error("[BunnyPlayer] Failed to load Player.js script");
    };
    document.head.appendChild(script);
  }, []);

  const initializePlayer = useCallback(() => {
    console.log("[BunnyPlayer] initializePlayer called", {
      hasIframe: !!iframeRef.current,
      hasPlayer: !!playerRef.current,
      playerjsAvailable: typeof window.playerjs !== "undefined",
    });

    if (!iframeRef.current || playerRef.current) {
      console.log("[BunnyPlayer] Skipping init - iframe missing or player exists");
      return;
    }

    try {
      console.log("[BunnyPlayer] Creating Player.js instance...");
      const player = new window.playerjs.Player(iframeRef.current);
      playerRef.current = player;
      console.log("[BunnyPlayer] Player instance created");

      player.on("ready", () => {
        console.log("[BunnyPlayer] READY event fired!");
        setIsReady(true);
        setError(null);

        // Try to capture initial duration when player is ready (callback-based)
        player.getDuration((dur: number) => {
          console.log("[BunnyPlayer] Initial duration from callback:", dur);
          if (dur > 0) {
            lastDurationRef.current = dur;
          }
        });

        onReadyRef.current?.(player);

        if (startTime && startTime > 0) {
          console.log("[BunnyPlayer] Setting start time:", startTime);
          player.setCurrentTime(startTime);
        }
      });

      player.on("play", () => {
        console.log("[BunnyPlayer] PLAY event");
        onPlayRef.current?.();
      });

      player.on("pause", () => {
        console.log("[BunnyPlayer] PAUSE event");
        onPauseRef.current?.();
      });

      player.on("ended", () => {
        console.log("[BunnyPlayer] ENDED event, stored duration:", lastDurationRef.current);
        const duration = lastDurationRef.current > 0 ? lastDurationRef.current : 1;
        // Always report 100% completion on ended
        console.log("[BunnyPlayer] Reporting 100% progress on ended");
        onProgressRef.current?.(100, duration, duration);
        onEndedRef.current?.();
      });

      // timeupdate provides { seconds, duration } according to Player.js spec
      player.on("timeupdate", (data: unknown) => {
        // Player.js provides data as { seconds, duration }
        const timingData = data as TimeupdateData | undefined;

        // DEBUG: Log raw data to understand format
        console.log("[BunnyPlayer] TIMEUPDATE raw data:", data);

        // IMPORTANT: Per Player.js spec, data MUST contain seconds and duration
        // The previous fallback to getCurrentTime()/getDuration() was WRONG
        // because those methods are callback-based, not synchronous!
        if (timingData?.seconds === undefined || timingData?.duration === undefined) {
          console.warn("[BunnyPlayer] timeupdate missing seconds/duration, skipping", data);
          return;
        }

        const currentTime = timingData.seconds;
        const duration = timingData.duration;

        // Store duration for ended event
        if (duration > 0) {
          lastDurationRef.current = duration;
        }

        if (duration > 0 && !Number.isNaN(duration)) {
          const progress = Math.floor((currentTime / duration) * 100);

          // Track progress at intervals (every 5%)
          if (
            Math.floor(progress / PROGRESS_TRACK_INTERVAL) !==
            Math.floor(lastProgressRef.current / PROGRESS_TRACK_INTERVAL)
          ) {
            console.log("[BunnyPlayer] Progress milestone:", progress, "% at", currentTime, "s");
            lastProgressRef.current = progress;
            onProgressRef.current?.(progress, currentTime, duration);
          }
        }
      });

      player.on("error", (data) => {
        console.error("[BunnyPlayer] ERROR event:", data);
      });

      console.log("[BunnyPlayer] All event listeners attached");
    } catch (err) {
      // Player.js initialization failed, but video can still play
      console.error("[BunnyPlayer] Failed to initialize Player.js:", err);
      setIsReady(true); // Show the video anyway
    }
  }, [startTime]);

  const handleIframeLoad = useCallback(() => {
    console.log("[BunnyPlayer] Iframe loaded", {
      hasIframe: !!iframeRef.current,
      playerjsAvailable: typeof window.playerjs !== "undefined",
    });

    // Clear load timeout since iframe loaded
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (!iframeRef.current) {
      console.warn("[BunnyPlayer] Iframe ref is null on load");
      return;
    }

    // Clear any previous timeout
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    if (typeof window.playerjs === "undefined") {
      console.log("[BunnyPlayer] Player.js not ready, waiting 2s...");
      // Wait for Player.js to load, then initialize
      initTimeoutRef.current = setTimeout(() => {
        console.log("[BunnyPlayer] Timeout fired, checking Player.js...", {
          playerjsAvailable: typeof window.playerjs !== "undefined",
        });
        if (iframeRef.current && typeof window.playerjs !== "undefined") {
          initializePlayer();
        } else {
          // Player.js not available, but video should still work
          console.warn("[BunnyPlayer] Player.js still not available after timeout");
          setIsReady(true);
        }
      }, 2000); // Increased from 1500ms to 2000ms
    } else {
      console.log("[BunnyPlayer] Player.js ready, initializing immediately");
      initializePlayer();
    }
  }, [initializePlayer]);

  // Timeout-based error detection - if iframe never becomes ready, show error
  // This catches cases like 403 errors that don't trigger iframe onerror
  useEffect(() => {
    if (embedUrl && !isReady && !error) {
      // Clear any previous timeout
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }

      // Set timeout to detect failed loads (8 seconds should be enough)
      loadTimeoutRef.current = setTimeout(() => {
        if (!isReady && !error) {
          console.error("[BunnyPlayer] Video load timeout - possible 403 error");
          console.error(
            "[BunnyPlayer] This usually means the Bunny.net 'Allowed Referrers' setting",
          );
          console.error("[BunnyPlayer] needs to include this domain:", window.location.origin);
          setError(
            "Erro ao carregar video. Verifique se o dominio esta autorizado nas configuracoes do Bunny.net (Allowed Referrers).",
          );
          onError?.(new Error("Video load timeout - possible 403 error"));
        }
      }, 8000);

      return () => {
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
      };
    }
  }, [embedUrl, isReady, error, onError]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current = null;
      }
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-lg",
          aspectRatioClass,
          className,
        )}
      >
        <div className="text-center text-muted-foreground p-4">
          <p className="font-medium">Erro ao carregar video</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-black", className)}>
      <div className={cn("relative w-full", aspectRatioClass)}>
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          onLoad={handleIframeLoad}
        />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main BunnyPlayer component
 * Auto-detects URL type and renders appropriate player
 */
export function BunnyPlayer({
  src,
  libraryId,
  title = "Video Player",
  onProgress,
  onEnded,
  onPlay,
  onPause,
  onReady,
  onError,
  startTime,
  autoplay = false,
  captions = true,
  showSpeed = true,
  rememberPosition = true,
  chromecast = true,
  preload = "metadata",
  className,
  aspectRatio = "16:9",
}: BunnyPlayerProps) {
  const sourceType = detectSourceType(src);

  const aspectRatioClass = {
    "16:9": "aspect-video",
    "4:3": "aspect-[4/3]",
    "1:1": "aspect-square",
    "9:16": "aspect-[9/16]",
  }[aspectRatio];

  // For HLS/direct streams, use HLS.js player
  if (sourceType === "hls" || sourceType === "direct") {
    const hlsProps = {
      src,
      title,
      autoplay,
      ...(onProgress && { onProgress }),
      ...(onEnded && { onEnded }),
      ...(onPlay && { onPlay }),
      ...(onPause && { onPause }),
      ...(onReady && { onReady: onReady as (video: HTMLVideoElement) => void }),
      ...(onError && { onError }),
      ...(startTime !== undefined && { startTime }),
      ...(className && { className }),
    };

    return <HLSPlayer {...hlsProps} />;
  }

  // For pre-signed embed URLs (from backend), use directly without modification
  // This preserves the token and expires parameters added by the server
  if (sourceType === "iframe-embed-signed") {
    const iframeProps = {
      embedUrl: src, // Use the signed URL directly
      title,
      aspectRatioClass,
      ...(onProgress && { onProgress }),
      ...(onEnded && { onEnded }),
      ...(onPlay && { onPlay }),
      ...(onPause && { onPause }),
      ...(onReady && { onReady: onReady as (player: BunnyPlayerInstance) => void }),
      ...(onError && { onError }),
      ...(startTime !== undefined && { startTime }),
      ...(className && { className }),
    };

    return <IframePlayer {...iframeProps} />;
  }

  // For unsigned iframe URLs (embed, play, video-id), build URL with options
  try {
    const embedUrl = buildEmbedUrl(src, libraryId, {
      autoplay,
      captions,
      showSpeed,
      rememberPosition,
      chromecast,
      preload,
      startTime,
    });

    const iframeProps = {
      embedUrl,
      title,
      aspectRatioClass,
      ...(onProgress && { onProgress }),
      ...(onEnded && { onEnded }),
      ...(onPlay && { onPlay }),
      ...(onPause && { onPause }),
      ...(onReady && { onReady: onReady as (player: BunnyPlayerInstance) => void }),
      ...(onError && { onError }),
      ...(startTime !== undefined && { startTime }),
      ...(className && { className }),
    };

    return <IframePlayer {...iframeProps} />;
  } catch (err) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-lg",
          aspectRatioClass,
          className,
        )}
      >
        <div className="text-center text-muted-foreground p-4">
          <p className="font-medium">Erro de configuracao</p>
          <p className="text-sm mt-1">
            {err instanceof Error ? err.message : "URL de video invalida"}
          </p>
        </div>
      </div>
    );
  }
}

export default BunnyPlayer;
