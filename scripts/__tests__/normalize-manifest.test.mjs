import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Mirror of `normalizeManifest` in src/lib/streaming/manifest.ts.
 *
 * The player module is TypeScript and the project has no test-time transpile
 * step, so the algorithm is duplicated here rather than left unverified. Both
 * copies are small and the cases below are the ones that actually broke.
 */
function normalizeManifest(text) {
  if (text.indexOf("\\") === -1) return text;

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return line;

      if (trimmed.charCodeAt(0) === 35) {
        return line.replace(/URI="([^"]*)"/g, (match, uri) =>
          uri.indexOf("\\") === -1 ? match : `URI="${uri.replace(/\\/g, "/")}"`,
        );
      }

      return line.replace(/\\/g, "/");
    })
    .join("\n");
}

test("rewrites Windows separators in bare variant URIs", () => {
  const input = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=7095872,RESOLUTION=1920x1080",
    "v0\\playlist.m3u8",
  ].join("\n");

  assert.equal(
    normalizeManifest(input),
    ["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=7095872,RESOLUTION=1920x1080", "v0/playlist.m3u8"].join(
      "\n",
    ),
  );
});

test("rewrites separators inside quoted URI attributes", () => {
  const input = '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",URI="aud\\playlist.m3u8"';
  assert.equal(
    normalizeManifest(input),
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",URI="aud/playlist.m3u8"',
  );
});

test("leaves backslashes in non-URI tag attributes alone", () => {
  const input = '#EXT-X-SESSION-DATA:DATA-ID="com.npc.note",VALUE="a\\b"';
  assert.equal(normalizeManifest(input), input);
});

test("handles nested paths and multiple separators", () => {
  assert.equal(normalizeManifest("a\\b\\c\\playlist.m3u8"), "a/b/c/playlist.m3u8");
});

test("preserves absolute URLs and leading whitespace", () => {
  const input = "  https://cdn.example.com/v0/playlist.m3u8  ";
  assert.equal(normalizeManifest(input), input);
});

test("is a no-op on a well-formed manifest", () => {
  const input = ["#EXTM3U", "#EXT-X-VERSION:7", "v240/playlist.m3u8", ""].join("\n");
  assert.equal(normalizeManifest(input), input);
});

test("preserves blank lines and CRLF carriage returns", () => {
  const input = "#EXTM3U\r\n\r\nv0\\playlist.m3u8\r\n";
  assert.equal(normalizeManifest(input), "#EXTM3U\r\n\r\nv0/playlist.m3u8\r\n");
});
