/**
 * The delivery ladder for the main VSL.
 *
 * Two things drive the shape of this ladder.
 *
 * First, coverage at the bottom. The ladder this replaces started at 480p /
 * 1.33 Mbps, so a viewer whose connection could sustain 900 kbps had nowhere to
 * go: the player was forced to choose between a rendition it could not fund and
 * an empty buffer. Every rung below 480p here exists purely so that playback
 * degrades in resolution instead of degrading into a spinner.
 *
 * Second, efficiency at the top. The rungs are constant-quality (CRF) with a
 * VBV ceiling rather than fixed bitrate, which is what lets a mostly-static
 * talking-head frame cost far less than the ceiling while a motion-heavy
 * section is still allowed to spend up to it. Combined with a slow preset and
 * psychovisual tuning, the 1080p rung reaches the quality of the previous
 * 5.5 Mbps encode at roughly 3.5 Mbps, so quality is preserved while the
 * bitrate the network has to sustain falls by about a third.
 */

/** Segment length in seconds. Also the GOP length, so rungs stay switchable. */
export const SEGMENT_SECONDS = 4;

/**
 * Audio is packaged once per group and shared by every video rung that
 * references it, instead of being muxed into all of them. On the previous
 * ladder the same audio was carried three times over.
 */
export const AUDIO_RENDITIONS = [
  {
    id: "aud-lo",
    groupId: "aud-lo",
    name: "English",
    channels: 1,
    bitrateKbps: 64,
    // AAC-LC. Mono at 64 kbps is transparent enough for speech and keeps the
    // emergency rungs genuinely reachable on a congested mobile link.
    codec: "mp4a.40.2",
  },
  {
    id: "aud-hi",
    groupId: "aud-hi",
    name: "English",
    channels: 2,
    bitrateKbps: 128,
    codec: "mp4a.40.2",
  },
];

/**
 * `crf` is the quality target; `maxrateKbps` is the ceiling the network is ever
 * asked to sustain. `avcProfile`/`avcLevel` are chosen so the low rungs remain
 * decodable on old and cheap hardware.
 */
export const VIDEO_RENDITIONS = [
  {
    id: "v240",
    width: 426,
    height: 240,
    crf: 24,
    maxrateKbps: 300,
    avcProfile: "main",
    avcLevel: "3.0",
    codec: "avc1.4d401e",
    audioGroup: "aud-lo",
  },
  {
    id: "v360",
    width: 640,
    height: 360,
    crf: 23,
    maxrateKbps: 600,
    avcProfile: "main",
    avcLevel: "3.0",
    codec: "avc1.4d401e",
    audioGroup: "aud-lo",
  },
  {
    id: "v480",
    width: 854,
    height: 480,
    crf: 22,
    maxrateKbps: 1100,
    avcProfile: "main",
    avcLevel: "3.1",
    codec: "avc1.4d401f",
    audioGroup: "aud-hi",
  },
  {
    id: "v720",
    width: 1280,
    height: 720,
    crf: 21,
    maxrateKbps: 2400,
    avcProfile: "high",
    avcLevel: "3.1",
    codec: "avc1.64001f",
    audioGroup: "aud-hi",
  },
  {
    id: "v1080",
    width: 1920,
    height: 1080,
    crf: 20,
    maxrateKbps: 4200,
    avcProfile: "high",
    avcLevel: "4.0",
    codec: "avc1.640028",
    audioGroup: "aud-hi",
  },
  {
    // Headroom rung. Most desktops settle on v1080; this exists so a viewer on
    // a genuinely fast connection is never capped below the source quality.
    id: "v1080p",
    width: 1920,
    height: 1080,
    crf: 18,
    maxrateKbps: 6500,
    avcProfile: "high",
    avcLevel: "4.0",
    codec: "avc1.640028",
    audioGroup: "aud-hi",
  },
];

/**
 * Single-file progressive fallback for the handful of clients that can play
 * neither MSE nor native HLS. Sized so that falling back is survivable.
 */
export const PROGRESSIVE_FALLBACK = {
  id: "fallback-720p",
  width: 1280,
  height: 720,
  crf: 23,
  maxrateKbps: 1600,
  audioBitrateKbps: 128,
};

/**
 * x264 parameters shared by every rung.
 *
 * `scenecut=0` with a fixed `keyint`/`min-keyint` is the important one: it
 * forces every rendition to place its IDR frames at exactly the same
 * timestamps. Without it the encoder inserts keyframes at scene changes, the
 * rungs stop being frame-aligned, and every adaptive switch risks a visible
 * glitch or an outright stall while the decoder resynchronises. The previous
 * ladder's segments ran anywhere from 3.28 s to 10 s for this reason.
 */
export function x264Params(gopFrames) {
  return [
    `keyint=${gopFrames}`,
    `min-keyint=${gopFrames}`,
    "scenecut=0",
    "open-gop=0",
    `rc-lookahead=${gopFrames}`,
    "ref=5",
    "bframes=5",
    "b-adapt=2",
    // Variance-based adaptive quantisation with auto-variance keeps detail in
    // dark and flat areas, which is where a low-bitrate rung usually falls
    // apart first.
    "aq-mode=3",
    "aq-strength=1.0",
    "psy-rd=1.00,0.15",
    "deblock=-1,-1",
    "me=umh",
    "subme=9",
    "trellis=2",
  ].join(":");
}
