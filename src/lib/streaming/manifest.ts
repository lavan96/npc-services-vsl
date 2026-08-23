import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderResponse,
  LoaderStats,
  PlaylistLoaderConstructor,
} from "hls.js";

/**
 * ffmpeg's HLS muxer emits `var_stream_map` directory separators using the host
 * platform's path separator. A ladder packaged on Windows therefore ships a
 * master playlist whose variant URIs read `v0\playlist.m3u8`.
 *
 * Browsers hide this because the WHATWG URL parser silently rewrites `\` to `/`
 * for http(s) URLs, but any parser that follows RFC 3986 instead — which is what
 * most players, packagers and CDN validators use — resolves the literal
 * backslash and requests `v0%5Cplaylist.m3u8`. Object storage answers that with
 * a 400, the load is fatal, and the player drops off the adaptive ladder onto
 * whatever progressive fallback exists.
 *
 * Normalising the manifest text on the way in makes the ladder resolve
 * identically everywhere, and costs one pass over a few hundred bytes.
 */
export function normalizeManifest(text: string): string {
  if (text.indexOf("\\") === -1) return text;

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return line;

      if (trimmed.charCodeAt(0) === 35 /* '#' */) {
        // Tag line: only rewrite inside quoted URI attributes so that literal
        // backslashes in, say, a title attribute survive untouched.
        return line.replace(/URI="([^"]*)"/g, (match, uri: string) =>
          uri.indexOf("\\") === -1 ? match : `URI="${uri.replace(/\\/g, "/")}"`,
        );
      }

      // Bare URI line.
      return line.replace(/\\/g, "/");
    })
    .join("\n");
}

/**
 * Wraps hls.js' default loader so every playlist is normalised before it is
 * parsed. Composition rather than subclassing keeps this independent of the
 * loader implementation hls.js happens to select (fetch or XHR).
 */
export function createNormalizingPlaylistLoader(
  BaseLoader: HlsConfig["loader"],
): PlaylistLoaderConstructor {
  return class NormalizingPlaylistLoader implements Loader<LoaderContext> {
    private readonly inner: Loader<LoaderContext>;

    constructor(config: HlsConfig) {
      this.inner = new BaseLoader(config);
    }

    get context(): LoaderContext | null {
      return this.inner.context;
    }

    get stats(): LoaderStats {
      return this.inner.stats;
    }

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ): void {
      const { onSuccess } = callbacks;

      this.inner.load(context, config, {
        ...callbacks,
        onSuccess: (
          response: LoaderResponse,
          stats: LoaderStats,
          ctx: LoaderContext,
          networkDetails: unknown,
        ) => {
          if (typeof response.data === "string") {
            response.data = normalizeManifest(response.data);
          }
          onSuccess(response, stats, ctx, networkDetails);
        },
      });
    }

    abort(): void {
      this.inner.abort();
    }

    destroy(): void {
      this.inner.destroy();
    }

    getCacheAge(): number | null {
      return this.inner.getCacheAge?.() ?? null;
    }

    getResponseHeader(name: string): string | null {
      return this.inner.getResponseHeader?.(name) ?? null;
    }
  } as unknown as PlaylistLoaderConstructor;
}
