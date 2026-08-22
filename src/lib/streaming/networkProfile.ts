/**
 * Network + device profiling used to seed the adaptive bitrate ladder.
 *
 * The single biggest cause of start-up stalls is the player guessing wrong on
 * the very first segment: it has no throughput history yet, so it either picks
 * a rendition that is far too heavy (immediate rebuffer) or far too light
 * (visible quality ramp). We solve that the same way the large streaming
 * services do — remember what the last session actually achieved, blend it with
 * whatever the Network Information API is willing to tell us, and start there.
 */

const STORAGE_KEY = "npc.vsl.bandwidth.v1";

/** Estimates outside this window are treated as noise and discarded. */
const MIN_ESTIMATE_BPS = 250_000;
const MAX_ESTIMATE_BPS = 40_000_000;

/** A stored estimate older than this no longer describes the user's network. */
const ESTIMATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Used when we know nothing at all — deliberately mid-ladder, not top. */
const COLD_START_BPS = 1_800_000;

type EffectiveType = "slow-2g" | "2g" | "3g" | "4g";

type NetworkInformation = {
  downlink?: number;
  effectiveType?: EffectiveType;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

type StoredEstimate = {
  bps: number;
  at: number;
};

export type NetworkProfile = {
  /** Seed throughput for the ABR controller, in bits per second. */
  estimatedBps: number;
  /** True when the user has explicitly asked the browser to conserve data. */
  saveData: boolean;
  /** Coarse connection class, when the browser exposes it. */
  effectiveType: EffectiveType | "unknown";
  /** Round-trip time in ms, when exposed. */
  rtt: number;
  /** True for connections where deep pre-buffering does more harm than good. */
  constrained: boolean;
  /** Rough memory ceiling in GB, when exposed. Drives buffer sizing. */
  deviceMemoryGb: number;
  /** True when the device is likely to choke on a large MSE buffer. */
  lowMemory: boolean;
};

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

function readStoredEstimate(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEstimate;
    if (typeof parsed?.bps !== "number" || typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > ESTIMATE_TTL_MS) return null;
    if (!Number.isFinite(parsed.bps)) return null;
    return clampEstimate(parsed.bps);
  } catch {
    // Private-mode Safari and hardened browsers throw on localStorage access.
    return null;
  }
}

/**
 * Persist the throughput this session actually achieved so the next visit can
 * start at the right rung instead of re-discovering the network from scratch.
 * Blended with the previous value so one bad segment cannot poison the seed.
 */
export function persistBandwidthEstimate(bps: number): void {
  if (!Number.isFinite(bps) || bps <= 0) return;
  try {
    const previous = readStoredEstimate();
    const blended = previous ? previous * 0.4 + bps * 0.6 : bps;
    const payload: StoredEstimate = { bps: clampEstimate(blended), at: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: we simply lose the head start next time.
  }
}

function clampEstimate(bps: number): number {
  return Math.min(MAX_ESTIMATE_BPS, Math.max(MIN_ESTIMATE_BPS, Math.round(bps)));
}

/**
 * `downlink` is capped at 10 Mbps by the spec and is a *link* estimate rather
 * than an achievable HTTP throughput, so we discount it before trusting it.
 */
function estimateFromConnection(connection: NetworkInformation | undefined): number | null {
  if (!connection) return null;
  if (typeof connection.downlink === "number" && connection.downlink > 0) {
    return clampEstimate(connection.downlink * 1_000_000 * 0.75);
  }
  switch (connection.effectiveType) {
    case "slow-2g":
      return MIN_ESTIMATE_BPS;
    case "2g":
      return 350_000;
    case "3g":
      return 1_000_000;
    case "4g":
      return 5_000_000;
    default:
      return null;
  }
}

export function readNetworkProfile(): NetworkProfile {
  const connection = getConnection();
  const stored = readStoredEstimate();
  const live = estimateFromConnection(connection);

  // A remembered measurement beats an advertised link rate, but we take the
  // lower of the two so a stale fast estimate cannot flood a slow connection.
  let estimatedBps: number;
  if (stored !== null && live !== null) {
    estimatedBps = Math.min(stored, live * 1.5);
  } else {
    estimatedBps = stored ?? live ?? COLD_START_BPS;
  }

  const saveData = connection?.saveData === true;
  const effectiveType = connection?.effectiveType ?? "unknown";
  const rtt = typeof connection?.rtt === "number" ? connection.rtt : 0;

  const deviceMemoryGb =
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
      : 4;

  const constrained =
    saveData ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    effectiveType === "3g" ||
    estimatedBps < 1_200_000;

  return {
    estimatedBps: clampEstimate(estimatedBps),
    saveData,
    effectiveType,
    rtt,
    constrained,
    deviceMemoryGb,
    lowMemory: deviceMemoryGb <= 2,
  };
}

/** Subscribe to connection changes so the player can re-cap mid-playback. */
export function onNetworkChange(handler: () => void): () => void {
  const connection = getConnection();
  if (!connection?.addEventListener) return () => {};
  connection.addEventListener("change", handler);
  return () => connection.removeEventListener?.("change", handler);
}
