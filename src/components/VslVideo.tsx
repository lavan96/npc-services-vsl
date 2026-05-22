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
  fallbackMp4Url?: string;
  posterUrl?: string;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
};

export default function VslVideo({
  hlsUrl,
  fallbackMp4Url,
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

    const useFallback = () => {
      if (fallbackMp4Url) {
        video.src = fallbackMp4Url;
      } else {
        setInitError(true);
      }
    };

    if (!hlsUrl) {
      useFallback();
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }

    if (window.Hls?.isSupported()) {
      const HlsCtor = window.Hls;
      hls = new HlsCtor();
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MEDIA_ATTACHED, () => {
        hls?.loadSource(hlsUrl);
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
  }, [hlsUrl, fallbackMp4Url]);

  return (
    <>
      <video
        ref={videoRef}
        className={className}
        controls
        playsInline
        preload="auto"
        poster={posterUrl}
        onPlay={onPlay}
        onPause={onPause}
      >
        {fallbackMp4Url && <source src={fallbackMp4Url} type="video/mp4" />}
        Your browser does not support the video tag.
      </video>

      {initError && (
        <div className="absolute inset-0 z-[4] flex items-center justify-center bg-brand-black/80 p-6">
          <div className="max-w-xl text-center">
            <p className="text-white font-serif text-2xl mb-3">Video unavailable in this browser session.</p>
            {fallbackMp4Url && (
              <a href={fallbackMp4Url} target="_blank" rel="noreferrer" className="text-[#dfbd69] underline underline-offset-4">
                Open the video directly
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
