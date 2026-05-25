import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Hls?: {
      isSupported: () => boolean;
      Events: {
        MEDIA_ATTACHED: string;
        ERROR: string;
      };
      new (): {
        attachMedia: (video: HTMLVideoElement) => void;
        loadSource: (src: string) => void;
        on: (event: string, handler: (_event: unknown, data?: any) => void) => void;
        destroy: () => void;
      };
    };
  }
}

type VslVideoProps = {
  hlsUrl?: string;
  iosHlsUrl?: string;
  fallbackMp4Url?: string;
  iosFallbackMp4Url?: string;
  posterUrl?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
};

export default function VslVideo({
  hlsUrl,
  iosHlsUrl,
  fallbackMp4Url,
  iosFallbackMp4Url,
  posterUrl,
  className,
  onPlay,
  onPause,
}: VslVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setInitError(false);

    type HlsInstance = {
      attachMedia: (video: HTMLVideoElement) => void;
      loadSource: (src: string) => void;
      on: (event: string, handler: (_event: unknown, data?: any) => void) => void;
      destroy: () => void;
    };

    let hls: HlsInstance | null = null;

    const isIOSDevice = () => {
      const ua = window.navigator.userAgent || "";
      const platform = window.navigator.platform || "";
      const maxTouchPoints = window.navigator.maxTouchPoints || 0;

      const isClassicIOS = /iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform);
      const isModernIPadOS = platform === "MacIntel" && maxTouchPoints > 1;

      return isClassicIOS || isModernIPadOS;
    };

    const isIOS = isIOSDevice();
    const selectedHlsUrl = isIOS ? iosHlsUrl || hlsUrl : hlsUrl;
    const selectedFallbackMp4Url = isIOS ? iosFallbackMp4Url || fallbackMp4Url : fallbackMp4Url;

    const useFallback = () => {
      if (selectedFallbackMp4Url) {
        video.src = selectedFallbackMp4Url;
        video.load();
      } else {
        setInitError(true);
      }
    };

    const onNativeHlsError = () => {
      useFallback();
    };

    if (!selectedHlsUrl) {
      useFallback();
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = selectedHlsUrl;
      video.load();
      video.addEventListener("error", onNativeHlsError, { once: true });

      return () => {
        video.removeEventListener("error", onNativeHlsError);
      };
    }

    if (window.Hls?.isSupported()) {
      const HlsCtor = window.Hls;
      hls = new HlsCtor();
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MEDIA_ATTACHED, () => {
        hls?.loadSource(selectedHlsUrl);
      });
      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (import.meta.env.DEV) {
          console.error("[VSL][HLS] playback error", data);
        }

        if (data?.fatal) {
          hls?.destroy();
          hls = null;
          useFallback();
        }
      });
    } else {
      useFallback();
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [hlsUrl, iosHlsUrl, fallbackMp4Url, iosFallbackMp4Url]);

  return (
    <>
      <video
        ref={videoRef}
        className={className}
        controls
        playsInline
        webkit-playsinline="true"
        preload="auto"
        poster={posterUrl}
        onPlay={onPlay}
        onPause={onPause}
      >
        {(iosFallbackMp4Url || fallbackMp4Url) && <source src={iosFallbackMp4Url || fallbackMp4Url} type="video/mp4" />}
        Your browser does not support the video tag.
      </video>

      {initError && (
        <div className="absolute inset-0 z-[4] flex items-center justify-center bg-brand-black/80 p-6">
          <div className="max-w-xl text-center">
            <p className="text-white font-serif text-2xl mb-3">Video unavailable in this browser session.</p>
            {(iosFallbackMp4Url || fallbackMp4Url) && (
              <a href={iosFallbackMp4Url || fallbackMp4Url} target="_blank" rel="noreferrer" className="text-[#dfbd69] underline underline-offset-4">
                Open the video directly
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
