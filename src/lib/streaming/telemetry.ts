/**
 * Minimal playback-quality instrumentation.
 *
 * The two numbers that decide whether a viewer stays with a ten minute sales
 * video are how long they wait for the first frame and how much of their watch
 * time is spent staring at a spinner. Measuring them here means a regression in
 * the encoding ladder or the CDN shows up as data rather than as anecdote.
 */

export type PlaybackQualityReport = {
  /** Milliseconds from load starting to the first rendered frame. */
  startupMs: number | null;
  /** Number of stalls after playback began. */
  rebufferCount: number;
  /** Total milliseconds spent stalled after playback began. */
  rebufferMs: number;
  /** Fraction of elapsed watch time spent stalled, 0-1. */
  rebufferRatio: number;
  /** Last throughput measurement in bits per second, when available. */
  throughputBps: number | null;
  /** Height in pixels of the rendition being played, when known. */
  currentHeight: number | null;
  /** How many times the adaptive ladder changed rendition. */
  levelSwitches: number;
  /** How the stream was delivered. */
  engine: "mse" | "native-hls" | "progressive" | null;
};

export class PlaybackQualityTracker {
  private loadStartedAt: number | null = null;
  private stallStartedAt: number | null = null;
  private playbackStartedAt: number | null = null;

  private report: PlaybackQualityReport = {
    startupMs: null,
    rebufferCount: 0,
    rebufferMs: 0,
    rebufferRatio: 0,
    throughputBps: null,
    currentHeight: null,
    levelSwitches: 0,
    engine: null,
  };

  constructor(private readonly onUpdate?: (report: PlaybackQualityReport) => void) {}

  markLoadStart(engine: PlaybackQualityReport["engine"]): void {
    this.loadStartedAt = now();
    this.report.engine = engine;
    this.emit();
  }

  markFirstFrame(): void {
    if (this.report.startupMs !== null || this.loadStartedAt === null) return;
    this.report.startupMs = Math.round(now() - this.loadStartedAt);
    this.playbackStartedAt = now();
    this.emit();
  }

  markStallStart(): void {
    // Waiting events before the first frame are start-up latency, not rebuffer.
    if (this.report.startupMs === null || this.stallStartedAt !== null) return;
    this.stallStartedAt = now();
    this.report.rebufferCount += 1;
    this.emit();
  }

  markStallEnd(): void {
    if (this.stallStartedAt === null) return;
    this.report.rebufferMs += Math.round(now() - this.stallStartedAt);
    this.stallStartedAt = null;
    this.recomputeRatio();
    this.emit();
  }

  markThroughput(bps: number): void {
    if (!Number.isFinite(bps) || bps <= 0) return;
    this.report.throughputBps = Math.round(bps);
  }

  markLevel(height: number | null): void {
    if (height === this.report.currentHeight) return;
    if (this.report.currentHeight !== null) this.report.levelSwitches += 1;
    this.report.currentHeight = height;
    this.emit();
  }

  snapshot(): PlaybackQualityReport {
    this.recomputeRatio();
    return { ...this.report };
  }

  private recomputeRatio(): void {
    if (this.playbackStartedAt === null) return;
    const elapsed = now() - this.playbackStartedAt;
    this.report.rebufferRatio = elapsed > 0 ? this.report.rebufferMs / elapsed : 0;
  }

  private emit(): void {
    this.onUpdate?.(this.snapshot());
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
