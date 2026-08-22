#!/usr/bin/env node
/**
 * Packages the main VSL into a CMAF/HLS ladder.
 *
 * Usage:
 *   node scripts/encode-vsl.mjs <source-video> [--out dist/vsl] [--jobs 2]
 *
 * Requires ffmpeg and ffprobe on PATH.
 *
 * Output layout (all URIs in the manifests use forward slashes, always):
 *
 *   <out>/master.m3u8
 *   <out>/v240/playlist.m3u8, init.mp4, seg-00000.m4s ...
 *   <out>/aud-hi/playlist.m3u8, init.mp4, seg-00000.m4s ...
 *   <out>/fallback-720p.mp4
 *   <out>/poster.jpg
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  AUDIO_RENDITIONS,
  PROGRESSIVE_FALLBACK,
  SEGMENT_SECONDS,
  VIDEO_RENDITIONS,
  x264Params,
} from "./ladder.mjs";

function parseArgs(argv) {
  const args = { source: null, out: "dist/vsl", jobs: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "--jobs") args.jobs = Math.max(1, Number(argv[++i]) || 1);
    else if (!arg.startsWith("--")) args.source = arg;
  }
  return args;
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

async function probe(sourcePath) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      sourcePath,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`ffprobe failed: ${stderr}`)),
    );
  });

  const parsed = JSON.parse(output);
  const video = parsed.streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error("Source has no video stream");

  const [num, den] = String(video.r_frame_rate || "25/1").split("/").map(Number);
  const fps = den ? num / den : num;

  return {
    fps,
    width: Number(video.width),
    height: Number(video.height),
    duration: Number(parsed.format?.duration ?? 0),
  };
}

/**
 * Segments must be a whole number of GOPs, and the GOP must be a whole number
 * of frames, or the rungs drift out of alignment over a ten minute runtime.
 */
function gopFrames(fps) {
  return Math.max(1, Math.round(fps * SEGMENT_SECONDS));
}

async function encodeVideoRendition(sourcePath, outDir, rendition, sourceInfo) {
  const dir = path.join(outDir, rendition.id);
  await mkdir(dir, { recursive: true });

  const gop = gopFrames(sourceInfo.fps);
  const maxrate = `${rendition.maxrateKbps}k`;
  // Two seconds of VBV buffer. Large enough that a busy shot is not clipped,
  // small enough that the player's bandwidth estimate stays meaningful.
  const bufsize = `${rendition.maxrateKbps * 2}k`;

  await run("ffmpeg", [
    "-nostdin", "-y",
    "-i", sourcePath,

    "-an",
    "-map", "0:v:0",

    // Lanczos with accurate rounding; the default bilinear downscale is a
    // meaningful quality loss on text and fine detail, which this content has
    // a lot of.
    "-vf",
    `scale=${rendition.width}:${rendition.height}:flags=lanczos+accurate_rnd:force_original_aspect_ratio=decrease,` +
      `pad=${rendition.width}:${rendition.height}:-1:-1:color=black,setsar=1`,

    "-c:v", "libx264",
    "-preset", "veryslow",
    "-tune", "film",
    "-profile:v", rendition.avcProfile,
    "-level:v", rendition.avcLevel,
    "-crf", String(rendition.crf),
    "-maxrate", maxrate,
    "-bufsize", bufsize,
    "-x264-params", x264Params(gop),

    "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",

    // Constant frame rate keeps segment durations exact across every rung.
    "-r", String(sourceInfo.fps),

    "-f", "hls",
    "-hls_time", String(SEGMENT_SECONDS),
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4",
    "-hls_flags", "independent_segments",
    "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", path.join(dir, "seg-%05d.m4s"),
    "-hls_list_size", "0",
    path.join(dir, "playlist.m3u8"),
  ]);
}

async function encodeAudioRendition(sourcePath, outDir, rendition) {
  const dir = path.join(outDir, rendition.id);
  await mkdir(dir, { recursive: true });

  await run("ffmpeg", [
    "-nostdin", "-y",
    "-i", sourcePath,

    "-vn",
    "-map", "0:a:0",
    "-c:a", "aac",
    "-profile:a", "aac_low",
    "-ac", String(rendition.channels),
    "-b:a", `${rendition.bitrateKbps}k`,
    "-ar", "48000",

    "-f", "hls",
    "-hls_time", String(SEGMENT_SECONDS),
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4",
    "-hls_flags", "independent_segments",
    "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", path.join(dir, "seg-%05d.m4s"),
    "-hls_list_size", "0",
    path.join(dir, "playlist.m3u8"),
  ]);
}

async function encodeProgressiveFallback(sourcePath, outDir, sourceInfo) {
  const target = path.join(outDir, `${PROGRESSIVE_FALLBACK.id}.mp4`);
  const gop = gopFrames(sourceInfo.fps);

  await run("ffmpeg", [
    "-nostdin", "-y",
    "-i", sourcePath,
    "-vf",
    `scale=${PROGRESSIVE_FALLBACK.width}:${PROGRESSIVE_FALLBACK.height}:flags=lanczos+accurate_rnd:` +
      `force_original_aspect_ratio=decrease,pad=${PROGRESSIVE_FALLBACK.width}:${PROGRESSIVE_FALLBACK.height}:-1:-1:color=black,setsar=1`,
    "-c:v", "libx264",
    "-preset", "veryslow",
    "-tune", "film",
    "-profile:v", "high",
    "-crf", String(PROGRESSIVE_FALLBACK.crf),
    "-maxrate", `${PROGRESSIVE_FALLBACK.maxrateKbps}k`,
    "-bufsize", `${PROGRESSIVE_FALLBACK.maxrateKbps * 2}k`,
    "-x264-params", x264Params(gop),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", `${PROGRESSIVE_FALLBACK.audioBitrateKbps}k`,
    "-ac", "2",
    // Without faststart the moov atom lands at the end of the file and the
    // browser must download the whole thing before it can show a frame.
    "-movflags", "+faststart",
    target,
  ]);

  return target;
}

async function extractPoster(sourcePath, outDir, sourceInfo) {
  const target = path.join(outDir, "poster.jpg");
  // A few seconds in, so the poster is a real frame rather than a fade-from-black.
  const at = Math.min(6, Math.max(1, sourceInfo.duration * 0.02));
  await run("ffmpeg", [
    "-nostdin", "-y",
    "-ss", String(at),
    "-i", sourcePath,
    "-frames:v", "1",
    "-vf", "scale=1280:-2:flags=lanczos",
    "-q:v", "4",
    target,
  ]);
  return target;
}

/**
 * Measures what each rendition actually costs, rather than trusting the
 * requested ceiling. `BANDWIDTH` must be the peak a client needs to sustain and
 * `AVERAGE-BANDWIDTH` the mean; getting these wrong is what makes an ABR
 * controller systematically over- or under-select a rung.
 */
async function measureRendition(outDir, renditionId) {
  const dir = path.join(outDir, renditionId);
  const playlist = await readFile(path.join(dir, "playlist.m3u8"), "utf8");

  const durations = [];
  for (const line of playlist.split("\n")) {
    const match = /^#EXTINF:([\d.]+)/.exec(line.trim());
    if (match) durations.push(Number(match[1]));
  }

  const files = (await readdir(dir)).filter((name) => name.endsWith(".m4s")).sort();
  const sizes = await Promise.all(
    files.map(async (name) => (await stat(path.join(dir, name))).size),
  );

  const initSize = (await stat(path.join(dir, "init.mp4"))).size;
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0) + initSize;
  const totalSeconds = durations.reduce((sum, value) => sum + value, 0);

  // Peak is the worst single segment, which is what a client must be able to
  // fund in real time to avoid draining its buffer.
  let peakBps = 0;
  for (let i = 0; i < sizes.length; i += 1) {
    const seconds = durations[i] || SEGMENT_SECONDS;
    if (seconds <= 0) continue;
    peakBps = Math.max(peakBps, (sizes[i] * 8) / seconds);
  }

  return {
    averageBps: totalSeconds > 0 ? Math.round((totalBytes * 8) / totalSeconds) : 0,
    peakBps: Math.round(peakBps),
    totalBytes,
    totalSeconds,
    segments: sizes.length,
  };
}

function buildMaster(measurements, fps) {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    // Declares that every segment can be decoded without the one before it,
    // which is what makes mid-stream rung switching safe.
    "#EXT-X-INDEPENDENT-SEGMENTS",
    "",
  ];

  const usedGroups = new Set(VIDEO_RENDITIONS.map((r) => r.audioGroup));
  for (const audio of AUDIO_RENDITIONS) {
    if (!usedGroups.has(audio.groupId)) continue;
    lines.push(
      "#EXT-X-MEDIA:TYPE=AUDIO," +
        `GROUP-ID="${audio.groupId}",` +
        `NAME="${audio.name}",` +
        "LANGUAGE=\"en\"," +
        "DEFAULT=YES," +
        "AUTOSELECT=YES," +
        `CHANNELS="${audio.channels}",` +
        // Forward slash, unconditionally. The manifest this replaces was
        // packaged on Windows and shipped `v0\playlist.m3u8`, which every
        // RFC 3986 parser resolves to a 400.
        `URI="${audio.id}/playlist.m3u8"`,
    );
  }
  lines.push("");

  for (const rendition of VIDEO_RENDITIONS) {
    const video = measurements.get(rendition.id);
    const audio = AUDIO_RENDITIONS.find((a) => a.groupId === rendition.audioGroup);
    const audioMeasurement = measurements.get(audio.id);
    if (!video || !audioMeasurement) continue;

    // A client streaming this rung pays for the video and the audio together.
    const bandwidth = video.peakBps + audioMeasurement.peakBps;
    const averageBandwidth = video.averageBps + audioMeasurement.averageBps;

    lines.push(
      "#EXT-X-STREAM-INF:" +
        `BANDWIDTH=${bandwidth},` +
        `AVERAGE-BANDWIDTH=${averageBandwidth},` +
        `RESOLUTION=${rendition.width}x${rendition.height},` +
        `FRAME-RATE=${fps.toFixed(3)},` +
        `CODECS="${rendition.codec},${audio.codec}",` +
        `AUDIO="${rendition.audioGroup}",` +
        "CLOSED-CAPTIONS=NONE",
    );
    lines.push(`${rendition.id}/playlist.m3u8`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatMbps(bps) {
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
}

function formatMb(bytes) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function pump() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    console.error("Usage: node scripts/encode-vsl.mjs <source-video> [--out dir] [--jobs n]");
    process.exit(1);
  }

  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const source = await probe(args.source);
  console.log(
    `Source: ${source.width}x${source.height} @ ${source.fps.toFixed(3)} fps, ` +
      `${source.duration.toFixed(1)}s`,
  );
  console.log(`Segment length: ${SEGMENT_SECONDS}s (GOP ${gopFrames(source.fps)} frames)\n`);

  const jobs = [
    ...AUDIO_RENDITIONS.map((rendition) => ({
      kind: "audio",
      id: rendition.id,
      label: `${rendition.id} (${rendition.bitrateKbps} kbps, ${rendition.channels}ch)`,
      run: () => encodeAudioRendition(args.source, outDir, rendition),
    })),
    ...VIDEO_RENDITIONS.map((rendition) => ({
      kind: "video",
      id: rendition.id,
      label: `${rendition.id} (${rendition.width}x${rendition.height}, CRF ${rendition.crf}, cap ${rendition.maxrateKbps} kbps)`,
      run: () => encodeVideoRendition(args.source, outDir, rendition, source),
    })),
  ];

  await mapWithConcurrency(jobs, args.jobs, async (job) => {
    const startedAt = Date.now();
    console.log(`  encoding ${job.label} ...`);
    await job.run();
    console.log(`  done     ${job.id} in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  });

  const measurements = new Map();
  for (const job of jobs) {
    measurements.set(job.id, await measureRendition(outDir, job.id));
  }

  const master = buildMaster(measurements, source.fps);
  await writeFile(path.join(outDir, "master.m3u8"), master, "utf8");

  console.log("\n  encoding progressive fallback ...");
  const fallback = await encodeProgressiveFallback(args.source, outDir, source);
  await extractPoster(args.source, outDir, source);

  console.log("\nLadder:");
  for (const rendition of VIDEO_RENDITIONS) {
    const video = measurements.get(rendition.id);
    const audio = AUDIO_RENDITIONS.find((a) => a.groupId === rendition.audioGroup);
    const audioMeasurement = measurements.get(audio.id);
    console.log(
      `  ${rendition.id.padEnd(7)} ${String(rendition.width + "x" + rendition.height).padEnd(10)} ` +
        `avg ${formatMbps(video.averageBps + audioMeasurement.averageBps).padStart(9)}  ` +
        `peak ${formatMbps(video.peakBps + audioMeasurement.peakBps).padStart(9)}  ` +
        `${formatMb(video.totalBytes).padStart(9)}`,
    );
  }

  const fallbackSize = (await stat(fallback)).size;
  console.log(`  fallback 1280x720   ${formatMb(fallbackSize).padStart(30)}`);
  console.log(`\nWrote ${path.join(outDir, "master.m3u8")}`);
  console.log("Upload with scripts/upload-vsl.sh, then verify with scripts/verify-ladder.mjs.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
