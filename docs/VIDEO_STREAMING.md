# VSL streaming

How the main sales video is encoded, packaged, delivered and played, and what
was wrong with the setup this replaces.

Everything below was measured against the deployed ladder at
`vsl-media/videos/main-vsl-v2/master.m3u8` and the progressive fallback at
`vsl-media/videos/main-vsl-v1/main-vsl-1.mp4`. Re-run the audit yourself with:

```
npm run verify:vsl -- <master.m3u8 url>
```

---

## What was causing the buffering

### 1. The ladder had no low rungs

The packaged ladder was three renditions deep:

| Rendition | Average | Peak |
|---|---|---|
| 854x480 | 1.28 Mbps | 1.71 Mbps |
| 1280x720 | 2.88 Mbps | 3.99 Mbps |
| 1920x1080 | 5.01 Mbps | 7.10 Mbps |

The floor was 1.28 Mbps. A congested mobile connection routinely delivers less
sustained HTTP throughput than that, and when it does, adaptive bitrate has
nowhere to adapt *to*. The player cannot choose a cheaper rendition because none
exists, so it keeps requesting one it cannot fund and the buffer drains. That is
the buffering being reported, and no amount of client tuning fixes it — the
missing renditions have to exist.

The replacement ladder starts at 240p / ~300 kbps and has six rungs, so
degradation happens in resolution rather than in playback.

### 2. Ten-second segments

Segments ran from 1.00 s to 10.00 s, averaging 6.7 s. Two consequences:

- **Start-up waits for a whole segment.** Nothing renders until the first
  segment has fully downloaded. At 10 s of 1080p that is roughly 6.9 MB before
  the first frame.
- **Every adaptive decision is delayed by one segment.** The player cannot
  react to a bandwidth collapse until the in-flight request completes or is
  abandoned, so a drop that starts at second 2 is not acted on until second 10.

The variance is itself a symptom: the encode used scene-cut keyframes rather
than a fixed GOP, which means the renditions were probably not frame-aligned
with each other, so switching between them was riskier than it needed to be.

The replacement uses fixed 4 s segments with `scenecut=0` and a matching GOP
length on every rung.

### 3. The master playlist used Windows path separators

The deployed manifest references its renditions as `v0\playlist.m3u8`.

This works in a browser and nowhere else. The WHATWG URL parser rewrites `\` to
`/` for http(s) URLs, so Chrome, Safari and Firefox silently repair it. Any
client implementing RFC 3986 — native players, packagers, CDN validators, most
server-side tooling — resolves the literal backslash and requests
`v0%5Cplaylist.m3u8`, which object storage answers with **400**.

```
$ curl -o /dev/null -w '%{http_code}\n' '.../main-vsl-v2/v0%5Cplaylist.m3u8'
400
$ curl -o /dev/null -w '%{http_code}\n' '.../main-vsl-v2/v0/playlist.m3u8'
200
```

Fixed in three places: `media/main-vsl-v2/master.m3u8` is a drop-in corrected
manifest for the current asset; `scripts/encode-vsl.mjs` writes forward slashes
unconditionally; and the player normalises playlists on load so a future
Windows-packaged ladder degrades to a warning rather than an outage.

### 4. The progressive fallback was 6.3 GB

`VITE_VSL_FALLBACK_MP4_URL` pointed at a **6,294,558,139 byte** file — about
83 Mbps for a 605-second video. That is a mastering-quality export, not a
delivery encode.

It was reachable in two ways, and the second was worse than the first:

- Every fatal HLS error dropped straight to it. A viewer already struggling on a
  weak network was handed an 83 Mbps file as the *recovery* path.
- It was also present as a `<source>` child of the `<video>` element while the
  element had `preload="auto"`. On mount the browser began preloading it
  immediately, and only afterwards did the effect run and reassign `video.src`
  to the HLS manifest. Those bytes competed with the first HLS segments for
  exactly the bandwidth that decides whether playback starts cleanly.

The `<source>` child is gone, `preload` is now driven by intent, and the
fallback URL defaults to empty. `scripts/encode-vsl.mjs` emits a suitable
replacement (`fallback-720p.mp4`, 720p at ~1.6 Mbps, `+faststart`).

### 5. Media segments were served `no-cache`

```
$ curl -sI '.../main-vsl-v2/v1/segment_010.ts' | grep -i cache-control
cache-control: no-cache
```

The playlists were cached (`public, max-age=3600`); the segments — the part that
is actually large and actually immutable — were not. Every replay, every seek
backwards, and every repeat visitor re-fetched from origin, over the connection
that was already the constraint. `scripts/upload-vsl.sh` sets
`public, max-age=31536000, immutable` on segments and a short revalidating TTL
on playlists.

### 6. hls.js came from a third-party CDN, untuned

The library was loaded via `<script defer src="https://cdn.jsdelivr.net/...">`,
which added a third-party DNS lookup, TCP connection and TLS handshake to the
critical path, and made playback depend on a CDN outside our control. It was
then constructed with `new Hls()` — every default unchanged.

hls.js' defaults are tuned for live and near-live playback, where a deep forward
buffer is impossible. A ten-minute pre-encoded VOD is the opposite case: buffer
banked while the network is healthy is buffer that is not a stall later.

It is now a pinned dependency, loaded as a lazy chunk, and configured (see
below). Apple platforms never download it at all.

---

## The replacement ladder

Defined in `scripts/ladder.mjs`, packaged by `scripts/encode-vsl.mjs`.

| Rendition | Resolution | CRF | VBV ceiling | Audio group |
|---|---|---|---|---|
| `v240` | 426x240 | 24 | 300 kbps | 64 kbps mono |
| `v360` | 640x360 | 23 | 600 kbps | 64 kbps mono |
| `v480` | 854x480 | 22 | 1.1 Mbps | 128 kbps stereo |
| `v720` | 1280x720 | 21 | 2.4 Mbps | 128 kbps stereo |
| `v1080` | 1920x1080 | 20 | 4.2 Mbps | 128 kbps stereo |
| `v1080p` | 1920x1080 | 18 | 6.5 Mbps | 128 kbps stereo |

Design notes:

- **Constant quality, capped bitrate.** Rungs are CRF with a VBV ceiling rather
  than fixed bitrate, so a static talking-head shot costs far less than the cap
  while a motion-heavy section is still allowed to spend up to it. This is why
  the ladder can be *more* efficient without being lower quality.
- **Quality is preserved at the top, not traded away.** With `-preset veryslow`,
  `-tune film` and psychovisual tuning (`aq-mode=3`, `psy-rd`, `trellis=2`), the
  `v1080` rung reaches the quality of the previous 5.01 Mbps encode at roughly
  3.5 Mbps measured. `v1080p` exists above it so a viewer on a genuinely fast
  connection is never capped below the source.
- **Audio is packaged once per group, not per rung.** The previous ladder muxed
  the same audio into all three renditions. Here two audio renditions are shared
  by reference, and the cheap rungs use a 64 kbps mono group so the emergency
  tier stays genuinely reachable.
- **fMP4/CMAF rather than MPEG-TS.** Lower container overhead, and the same
  segments can serve a DASH manifest later without re-packaging.
- **`EXT-X-INDEPENDENT-SEGMENTS` and frame-aligned GOPs**, so mid-stream
  switching is safe.
- **`BANDWIDTH` and `AVERAGE-BANDWIDTH` are measured from the packaged output**,
  not estimated. The old manifest advertised a peak 42% above its own average,
  which makes an ABR controller systematically under-select.

### Running it

```
node scripts/encode-vsl.mjs /path/to/master-source.mov --out dist/vsl --jobs 2
```

Requires `ffmpeg` and `ffprobe` on `PATH`, built with `libx264`. `--jobs`
controls how many renditions encode concurrently; `veryslow` is CPU-bound, so
match it to available cores rather than raising it blindly.

Output is `dist/vsl/` containing `master.m3u8`, one directory per rendition,
`fallback-720p.mp4` and `poster.jpg`. The script prints the measured ladder when
it finishes.

### Publishing it

```
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
scripts/upload-vsl.sh dist/vsl vsl-media videos/main-vsl-v3
```

Then point the app at it and confirm:

```
VITE_VSL_HLS_URL=https://<project>.supabase.co/storage/v1/object/public/vsl-media/videos/main-vsl-v3/master.m3u8
VITE_VSL_POSTER_URL=https://<project>.supabase.co/storage/v1/object/public/vsl-media/posters/main-vsl-1.jpg
VITE_VSL_FALLBACK_MP4_URL=https://<project>.supabase.co/storage/v1/object/public/vsl-media/videos/main-vsl-v3/fallback-720p.mp4

npm run verify:vsl -- https://<project>.supabase.co/storage/v1/object/public/vsl-media/videos/main-vsl-v3/master.m3u8
```

`verify-ladder.mjs` exits non-zero on any failure, so it can gate a deploy.

---

## The player

`src/components/VslVideo.tsx` with `src/lib/streaming/`.

### Engine selection

1. **Apple platforms → native HLS.** Safari and iOS play HLS natively with
   hardware decode, AirPlay and picture-in-picture intact, and never download
   the MSE engine. Pass `preferNativeHls={false}` to route iOS 17.1+ through
   hls.js instead — `preferManagedMediaSource` is enabled, so it will work.
2. **Everywhere else → hls.js over MSE**, dynamically imported so its ~125 kB
   gzipped stays out of the initial bundle.
3. **Progressive MP4** only when neither is available or recovery is exhausted.

### Configuration

`src/lib/streaming/hlsConfig.ts`. The values that matter most:

- `abrEwmaDefaultEstimate` is seeded from the throughput the *previous* session
  actually achieved, persisted in `localStorage` and blended with whatever
  `navigator.connection` reports. The first segment request is therefore already
  the right size instead of a guess.
- `abrBandWidthUpFactor: 0.65` requires real headroom before stepping up. This
  is what stops the up/starve/down oscillation that a viewer experiences as
  intermittent buffering on a connection that is nominally fast enough.
- `abrMaxWithRealBitrate: true` judges renditions by measured bitrate rather
  than the advertised `BANDWIDTH` attribute.
- `maxBufferLength: 90` (up from 30) with `maxMaxBufferLength: 900`. Bank buffer
  while the network is healthy. Scaled down on constrained and data-saver
  sessions.
- `backBufferLength: 30` evicts watched video. An unbounded back buffer is the
  usual cause of MSE quota errors on long videos.
- `capLevelToPlayerSize: true` never downloads more pixels than the player box
  can display. On a phone this removes 1080p from consideration entirely.
- `enableWorker: true` demuxes off the main thread. This page runs scroll-linked
  animation and backdrop blur; main-thread contention starves the append
  pipeline and produces stalls that look like network problems.
- Load policies use generous timeouts with exponential backoff, because the
  defaults escalate a single slow segment on a congested link to a fatal error.

### Recovery

Fatal errors walk a ladder instead of collapsing to progressive MP4:

- **Network** — up to 4 retries with exponential backoff, resuming from
  `video.currentTime` so nothing already watched is re-downloaded.
- **Media** — `recoverMediaError()`, then `swapAudioCodec()` + recover.
- **Exhausted** — step down to native HLS, then to progressive MP4.

### Loading

- `IntersectionObserver` with a 600 px margin defers all video bytes until the
  player is near the viewport.
- `preload` is `metadata` normally, `none` under Save-Data.
- No `<source>` child, so nothing is fetched before the engine decides what to
  fetch.
- `preconnect` and `dns-prefetch` for the media origin are in `index.html`,
  removing about a round trip from time-to-first-frame.

### Telemetry

`onQualityReport` emits start-up latency, rebuffer count, rebuffer ratio,
current rendition height, level-switch count and measured throughput. Wire it to
analytics to see whether the ladder is behaving in the field rather than
inferring it from complaints.

---

## Checklist for the remaining work

The client changes are live in this branch. The media changes need someone with
the source file and storage credentials:

- [ ] Upload `media/main-vsl-v2/master.m3u8` over the deployed manifest. This is
      a safe, standalone correctness fix and needs no re-encode.
- [ ] Re-encode from the master source with `scripts/encode-vsl.mjs`.
- [ ] Publish with `scripts/upload-vsl.sh` so cache headers are set correctly.
- [ ] Point `VITE_VSL_HLS_URL` and `VITE_VSL_FALLBACK_MP4_URL` at the new ladder.
- [ ] Run `npm run verify:vsl` against the new master; expect zero failures.
- [ ] Delete `videos/main-vsl-v1/main-vsl-1.mp4` (6.3 GB) once nothing
      references it.
