#!/usr/bin/env node
/**
 * Audits a deployed HLS ladder the way a strict player would.
 *
 * Usage:
 *   node scripts/verify-ladder.mjs <master.m3u8 url>
 *
 * Checks, in the order they tend to break playback:
 *
 *   1. Variant URIs resolve under RFC 3986. Browsers quietly rewrite `\` to `/`
 *      in http(s) URLs; nothing else does. A ladder that only works because of
 *      that rewrite is one strict client away from falling off the ladder
 *      entirely, and that failure mode is invisible in a desktop browser.
 *   2. The ladder reaches low enough. If the cheapest rung costs more than a
 *      weak mobile connection can fund, adaptation has nowhere to go and the
 *      player rebuffers instead of stepping down.
 *   3. Segments are short and evenly sized. Long or wildly variable segments
 *      slow start-up and make every adaptive decision coarse.
 *   4. Media is cacheable. `no-cache` on immutable segments defeats both the
 *      CDN edge and the browser cache, so a replay or a seek re-downloads
 *      everything over the network that was already struggling.
 */

import process from "node:process";

/**
 * RFC 3986 section 5.3 reference resolution, without the WHATWG URL parser's
 * backslash leniency. This is deliberately the strict behaviour: it is what
 * native players, packagers and CDN validators implement.
 */
function resolveStrict(reference, base) {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(reference)) return reference;
  if (reference.startsWith("//")) return `${base.slice(0, base.indexOf(":") + 1)}${reference}`;

  const baseMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*)([^?#]*)/.exec(base);
  if (!baseMatch) throw new Error(`Cannot parse base URL: ${base}`);
  const [, origin, basePath] = baseMatch;

  if (reference.startsWith("/")) return origin + reference;

  const dir = basePath.slice(0, basePath.lastIndexOf("/") + 1);
  const merged = dir + reference;

  const segments = [];
  for (const segment of merged.split("/")) {
    if (segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return origin + segments.join("/");
}

function parseMaster(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const variants = [];
  const media = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
      let uri = null;
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j].trim();
        if (candidate.length === 0 || candidate.startsWith("#")) continue;
        uri = candidate;
        break;
      }
      variants.push({ attrs, uri });
    }

    if (line.startsWith("#EXT-X-MEDIA:")) {
      media.push(parseAttributes(line.slice("#EXT-X-MEDIA:".length)));
    }
  }

  return { variants, media };
}

function parseAttributes(input) {
  const attrs = {};
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    attrs[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return attrs;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { text: await response.text(), headers: response.headers };
}

async function head(url) {
  const response = await fetch(url, { method: "HEAD" });
  return {
    status: response.status,
    ok: response.ok,
    length: Number(response.headers.get("content-length") || 0),
    cacheControl: response.headers.get("cache-control"),
    contentType: response.headers.get("content-type"),
  };
}

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
  console.log(`  FAIL  ${message}`);
}

function warn(message) {
  notes.push(message);
  console.log(`  WARN  ${message}`);
}

function pass(message) {
  console.log(`  ok    ${message}`);
}

async function main() {
  const masterUrl = process.argv[2];
  if (!masterUrl) {
    console.error("Usage: node scripts/verify-ladder.mjs <master.m3u8 url>");
    process.exit(1);
  }

  console.log(`Master: ${masterUrl}\n`);
  const { text: masterText, headers: masterHeaders } = await fetchText(masterUrl);
  const { variants, media } = parseMaster(masterText);

  console.log("Manifest URIs");
  if (masterText.includes("\\")) {
    fail(
      "master playlist contains backslash path separators; RFC 3986 parsers will " +
        "request the escaped form and get a 4xx",
    );
  } else {
    pass("no backslash path separators");
  }

  const references = [
    ...variants.map((variant) => ({ label: variant.attrs.RESOLUTION || "variant", uri: variant.uri })),
    ...media.filter((m) => m.URI).map((m) => ({ label: `audio ${m["GROUP-ID"]}`, uri: m.URI })),
  ];

  const resolved = [];
  for (const reference of references) {
    if (!reference.uri) {
      fail(`${reference.label}: no URI follows the tag`);
      continue;
    }
    const base = resolveStrict(reference.uri, masterUrl);
    // Probe the strict form. `fetch` would otherwise re-parse the string with
    // the WHATWG parser and silently repair a backslash, hiding exactly the
    // failure this check exists to catch.
    const strictUrl = base.replace(/\\/g, "%5C");
    // The lenient form is what a browser actually requests, and is what the
    // remaining checks inspect so that a backslash failure does not mask the
    // segmentation and caching findings underneath it.
    const lenientUrl = base.replace(/\\/g, "/");

    const result = await head(strictUrl);
    resolved.push({ ...reference, url: strictUrl, lenientUrl, ...result });
    if (!result.ok) fail(`${reference.label}: ${result.status} for ${strictUrl}`);
    else pass(`${reference.label}: resolves`);
  }

  console.log("\nLadder coverage");
  if (variants.length === 0) {
    fail("master advertises no variants");
  } else {
    const rungs = variants
      .map((variant) => ({
        resolution: variant.attrs.RESOLUTION || "?",
        height: Number((variant.attrs.RESOLUTION || "0x0").split("x")[1]) || 0,
        bandwidth: Number(variant.attrs.BANDWIDTH || 0),
        average: Number(variant.attrs["AVERAGE-BANDWIDTH"] || variant.attrs.BANDWIDTH || 0),
      }))
      .sort((a, b) => a.average - b.average);

    for (const rung of rungs) {
      console.log(
        `        ${rung.resolution.padEnd(10)} avg ${(rung.average / 1e6).toFixed(2)} Mbps  ` +
          `peak ${(rung.bandwidth / 1e6).toFixed(2)} Mbps`,
      );
    }

    const cheapest = rungs[0];
    // A congested mobile connection commonly delivers well under 1 Mbps of
    // sustained HTTP throughput. A ladder whose floor sits above that has no
    // way to serve those sessions except by stalling.
    if (cheapest.average > 700_000) {
      fail(
        `cheapest rung averages ${(cheapest.average / 1e6).toFixed(2)} Mbps; ` +
          "sessions below that have no rung to fall back to and will rebuffer",
      );
    } else {
      pass(`cheapest rung averages ${(cheapest.average / 1e6).toFixed(2)} Mbps`);
    }

    if (rungs.length < 4) {
      warn(`${rungs.length} rungs; adaptation is coarse below about 5`);
    } else {
      pass(`${rungs.length} rungs`);
    }
  }

  console.log("\nSegmentation");
  let firstSegmentUrl = null;
  let variantCacheControl = null;
  const firstVariant = resolved.find((entry) => !entry.label.startsWith("audio"));
  if (firstVariant) {
    const { text: variantText, headers: variantHeaders } = await fetchText(firstVariant.lenientUrl);
    const durations = [];
    for (const line of variantText.split("\n")) {
      const match = /^#EXTINF:([\d.]+)/.exec(line.trim());
      if (match) durations.push(Number(match[1]));
    }

    if (durations.length > 0) {
      const max = Math.max(...durations);
      const min = Math.min(...durations);
      const total = durations.reduce((sum, value) => sum + value, 0);
      console.log(
        `        ${durations.length} segments, ${total.toFixed(1)}s total, ` +
          `min ${min.toFixed(2)}s max ${max.toFixed(2)}s`,
      );

      if (max > 6) {
        fail(
          `segments run up to ${max.toFixed(1)}s; start-up waits for a whole segment ` +
            "and every adaptive decision is delayed by one",
        );
      } else {
        pass(`longest segment ${max.toFixed(1)}s`);
      }

      if (max - min > 2) {
        warn(
          `segment durations vary by ${(max - min).toFixed(1)}s, which suggests ` +
            "scene-cut keyframes rather than a fixed GOP; rungs may not be frame-aligned",
        );
      } else {
        pass("segment durations are uniform");
      }
    }

    if (!variantText.includes("#EXT-X-INDEPENDENT-SEGMENTS")) {
      warn("variant playlist does not declare EXT-X-INDEPENDENT-SEGMENTS");
    }

    for (const line of variantText.split("\n")) {
      const candidate = line.trim();
      if (candidate.length === 0 || candidate.startsWith("#")) continue;
      firstSegmentUrl = resolveStrict(candidate, firstVariant.lenientUrl).replace(/\\/g, "/");
      break;
    }
    variantCacheControl = variantHeaders.get("cache-control");
  }

  console.log("\nCaching");
  const cacheTargets = [
    { label: "master playlist", cacheControl: masterHeaders.get("cache-control") },
    ...(variantCacheControl !== null
      ? [{ label: "variant playlist", cacheControl: variantCacheControl }]
      : []),
  ];

  if (firstSegmentUrl) {
    const segment = await head(firstSegmentUrl);
    cacheTargets.push({ label: "media segment", cacheControl: segment.cacheControl });
  }

  for (const target of cacheTargets) {
    const value = target.cacheControl || "(none)";
    if (!target.cacheControl || /no-cache|no-store|max-age=0/.test(target.cacheControl)) {
      fail(
        `${target.label} is served with \`cache-control: ${value}\`; every replay, ` +
          "seek and repeat visitor re-fetches from origin",
      );
    } else {
      pass(`${target.label}: ${value}`);
    }
  }

  console.log(
    `\n${problems.length} failure(s), ${notes.length} warning(s).`,
  );
  process.exit(problems.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
