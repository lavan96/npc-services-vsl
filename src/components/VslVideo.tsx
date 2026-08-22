import { useCallback, useEffect, useRef, useState } from "react";
import { persistBandwidthEstimate, readNetworkProfile } from "../lib/streaming/networkProfile";
import {
  PlaybackQualityTracker,
  type PlaybackQualityReport,
} from "../lib/streaming/telemetry";
import type { MseEngine } from "../lib/streaming/mseEngine";

type VslVideoProps = {
  hlsUrl?: string;
  iosHlsUrl?: string;
  fallbackMp4Url?: string;
  iosFallbackMp4Url?: string;
  posterUrl?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  /**
   * Apple platforms play HLS natively with hardware decode, AirPlay and
   * picture-in-picture intact, and never download the MSE engine at all, so we
   * let them do so by default. Set this false to route iOS 17.1+ and Safari
   * through the tuned adaptive ladder instead.
   */
  preferNativeHls?: boolean;
  /** Emits start-up latency, rebuffer ratio and rendition data as they change. */
  onQualityReport?: (report: PlaybackQualityReport) => void;
};

/** Distance from the viewport at which we start warming the stream. */
const PREWARM_MARGIN = "600px";

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = navigator.maxTouchPoints || 0;

  const classicIOS = /iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform);
  // iPadOS 13+ reports itself as desktop Safari; the touch-point count is the
  // only reliable discriminator.
  const modernIPadOS = platform === "MacIntel" && touchPoints > 1;
  const desktopSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|Android|Edg\//.test(ua) && /Mac OS X/.test(ua);

  return classicIOS || modernIPadOS || desktopSafari;
}

export default function VslVideo({
  hlsUrl,
  iosHlsUrl,
  fallbackMp4Url,
  iosFallbackMp4Url,
  posterUrl,
  className,
  onPlay,
  onPause,
  preferNativeHls,
  onQualityReport,
}: VslVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [initError, setInitError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  // Keep the latest callback without making it an effect dependency, so a
  // re-rendered parent never tears down and rebuilds the streaming session.
  const qualityReportRef = useRef(onQualityReport);
  qualityReportRef.current = onQualityReport;

  /**
   * Defer every byte of video until the player is near the viewport. The video
   * sits in the hero on desktop, but on mobile it is often below the fold, and
   * a visitor who bounces before scrolling should not pay for a stream they
   * never saw.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: PREWARM_MARGIN },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

    setInitError(false);

    const profile = readNetworkProfile();
    const tracker = new PlaybackQualityTracker((report) => qualityReportRef.current?.(report));

    const apple = isApplePlatform();
    const useNativeFirst = preferNativeHls ?? apple;

    const selectedHlsUrl = apple ? iosHlsUrl || hlsUrl : hlsUrl;
    const selectedMp4Url = apple ? iosFallbackMp4Url || fallbackMp4Url : fallbackMp4Url;

    let disposed = false;
    let engine: MseEngine | null = null;
    let nativeRetried = false;
    const mediaListeners: Array<[string, EventListener]> = [];

    // Data-saver sessions should not speculatively fetch anything at all; other
    // sessions fetch metadata so the poster gives way to a real first frame.
    video.preload = profile.saveData ? "none" : "metadata";

    const addMediaListener = (type: string, handler: EventListener) => {
      video.addEventListener(type, handler);
      mediaListeners.push([type, handler]);
    };

    addMediaListener("playing", () => {
      tracker.markFirstFrame();
      tracker.markStallEnd();
    });
    addMediaListener("waiting", () => tracker.markStallStart());
    addMediaListener("canplay", () => tracker.markStallEnd());

    /**
     * Progressive MP4 is a genuine last resort. It has no adaptation at all, so
     * a viewer who lands here on a weak network is worse off than one watching
     * the lowest rung of the ladder. We only reach it when no form of HLS is
     * available, or when every recovery attempt has been exhausted.
     */
    const useProgressiveFallback = () => {
      if (disposed) return;

      if (!selectedMp4Url) {
        setInitError(true);
        return;
      }

      tracker.markLoadStart("progressive");
      video.src = selectedMp4Url;
      video.load();
    };

    const startNativeHls = (url: string): boolean => {
      if (!video.canPlayType("application/vnd.apple.mpegurl")) return false;

      tracker.markLoadStart("native-hls");
      video.src = url;
      video.load();

      // Safari surfaces a manifest or decode failure as a plain media error, so
      // one retry and then progressive is the only ladder available to us here.
      addMediaListener("error", () => {
        if (disposed) return;
        if (!nativeRetried) {
          nativeRetried = true;
          video.load();
          return;
        }
        useProgressiveFallback();
      });

      return true;
    };

    const startMse = async (url: string): Promise<boolean> => {
      try {
        const { createMseEngine, isMseSupported } = await import("../lib/streaming/mseEngine");
        if (disposed || !isMseSupported()) return false;

        tracker.markLoadStart("mse");
        engine = createMseEngine({
          video,
          url,
          profile,
          debug: import.meta.env.DEV,
          onLevel: (height) => tracker.markLevel(height),
          onThroughput: (bps) => tracker.markThroughput(bps),
          onExhausted: () => {
            engine = null;
            if (disposed) return;
            // Step down the engine ladder rather than straight to progressive.
            if (!startNativeHls(url)) useProgressiveFallback();
          },
        });

        return engine !== null;
      } catch {
        // The engine chunk failed to load — an offline session, a blocked
        // request, or a stale deployment. Fall through to the next engine.
        return false;
      }
    };

    const start = async () => {
      if (!selectedHlsUrl) {
        useProgressiveFallback();
        return;
      }

      if (useNativeFirst) {
        if (startNativeHls(selectedHlsUrl)) return;
        if (await startMse(selectedHlsUrl)) return;
      } else {
        if (await startMse(selectedHlsUrl)) return;
        if (disposed) return;
        if (startNativeHls(selectedHlsUrl)) return;
      }

      useProgressiveFallback();
    };

    void start();

    return () => {
      disposed = true;

      // Only persist a throughput that was actually observed. hls.js reports the
      // seeded estimate until the first fragment lands, and writing that back
      // would let a stale guess reinforce itself across sessions.
      const observed = tracker.snapshot().throughputBps;
      if (observed) persistBandwidthEstimate(engine?.bandwidthEstimate() ?? observed);

      engine?.destroy();
      engine = null;

      mediaListeners.forEach(([type, listener]) => video.removeEventListener(type, listener));

      // Release the network and the decoder immediately rather than waiting for
      // the element to be garbage collected.
      video.removeAttribute("src");
      video.load();
    };
  }, [shouldLoad, hlsUrl, iosHlsUrl, fallbackMp4Url, iosFallbackMp4Url, preferNativeHls]);

  const handlePlay = useCallback(() => onPlay?.(), [onPlay]);
  const handlePause = useCallback(() => onPause?.(), [onPause]);

  return (
    <>
      <video
        ref={videoRef}
        className={className}
        controls
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        preload="none"
        poster={posterUrl}
        onPlay={handlePlay}
        onPause={handlePause}
      >
        Your browser does not support the video tag.
      </video>

      {initError && (
        <div className="absolute inset-0 z-[4] flex items-center justify-center bg-brand-black/80 p-6">
          <div className="max-w-xl text-center">
            <p className="text-white font-serif text-2xl mb-3">Video unavailable in this browser session.</p>
            {(iosFallbackMp4Url || fallbackMp4Url) && (
              <a
                href={iosFallbackMp4Url || fallbackMp4Url}
                target="_blank"
                rel="noreferrer"
                className="text-[#dfbd69] underline underline-offset-4"
              >
                Open the video directly
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
