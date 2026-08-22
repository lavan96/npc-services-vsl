#!/usr/bin/env bash
#
# Uploads an encoded ladder to Supabase Storage with cache headers that let the
# CDN and the browser actually do their job.
#
# The deployed ladder currently serves every media segment with
# `cache-control: no-cache`, which is Supabase Storage's default. That means a
# replay, a seek backwards, or a second visit re-fetches the whole segment from
# origin — over the same connection that was already struggling. Segment names
# are content-addressed by the encode, so they are safe to mark immutable.
#
# Usage:
#   SUPABASE_URL=https://<project>.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<key> \
#   scripts/upload-vsl.sh dist/vsl vsl-media videos/main-vsl-v3
#
set -euo pipefail

SOURCE_DIR="${1:?usage: upload-vsl.sh <source-dir> <bucket> <prefix>}"
BUCKET="${2:?usage: upload-vsl.sh <source-dir> <bucket> <prefix>}"
PREFIX="${3:?usage: upload-vsl.sh <source-dir> <bucket> <prefix>}"

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"

# Segments and init fragments never change once published.
IMMUTABLE_CACHE="public, max-age=31536000, immutable"
# Playlists may be re-published (a new rung, a corrected manifest), so they get a
# short TTL and are revalidated rather than pinned.
PLAYLIST_CACHE="public, max-age=300, stale-while-revalidate=86400"

content_type_for() {
  case "$1" in
    *.m3u8) echo "application/vnd.apple.mpegurl" ;;
    *.m4s)  echo "video/iso.segment" ;;
    *.mp4)  echo "video/mp4" ;;
    *.ts)   echo "video/mp2t" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.webp) echo "image/webp" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

cache_for() {
  case "$1" in
    *.m3u8) echo "$PLAYLIST_CACHE" ;;
    *)      echo "$IMMUTABLE_CACHE" ;;
  esac
}

uploaded=0
failed=0

while IFS= read -r -d '' file; do
  # Always build the remote path with forward slashes. Packaging this ladder on
  # Windows is what produced the `v0\playlist.m3u8` references in the manifest
  # it replaces.
  relative="${file#"$SOURCE_DIR"/}"
  relative="${relative//\\//}"
  target="${SUPABASE_URL}/storage/v1/object/${BUCKET}/${PREFIX}/${relative}"

  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$target" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: $(content_type_for "$file")" \
    -H "Cache-Control: $(cache_for "$file")" \
    -H "x-upsert: true" \
    --data-binary "@${file}") || status="000"

  if [[ "$status" == "200" || "$status" == "201" ]]; then
    uploaded=$((uploaded + 1))
    printf '  ok   %s\n' "$relative"
  else
    failed=$((failed + 1))
    printf '  FAIL %s (HTTP %s)\n' "$relative" "$status"
  fi
done < <(find "$SOURCE_DIR" -type f -print0 | sort -z)

printf '\n%d uploaded, %d failed\n' "$uploaded" "$failed"

if [[ "$failed" -gt 0 ]]; then
  exit 1
fi

printf '\nVerify with:\n  node scripts/verify-ladder.mjs %s/storage/v1/object/public/%s/%s/master.m3u8\n' \
  "$SUPABASE_URL" "$BUCKET" "$PREFIX"
