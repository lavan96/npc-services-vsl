# Drop-in replacement master playlist for `main-vsl-v2`

The deployed `videos/main-vsl-v2/master.m3u8` references its variants as
`v0\playlist.m3u8`. That is a Windows path separator, emitted by ffmpeg's HLS
muxer when the ladder is packaged on Windows.

Browsers hide the problem: the WHATWG URL parser rewrites `\` to `/` for http(s)
URLs. Nothing else does. Any client that follows RFC 3986 — native players,
packagers, CDN validators, most server-side tooling — resolves the literal
backslash, requests `v0%5Cplaylist.m3u8`, and object storage answers `400`.

`master.m3u8` here is byte-for-byte the deployed manifest with the separators
corrected and `EXT-X-INDEPENDENT-SEGMENTS` / `CLOSED-CAPTIONS=NONE` declared.
The segment data is untouched, so this can be uploaded over the existing file on
its own, ahead of any re-encode:

    supabase storage cp media/main-vsl-v2/master.m3u8 \
      ss://vsl-media/videos/main-vsl-v2/master.m3u8 --experimental

Confirm afterwards with:

    node scripts/verify-ladder.mjs \
      https://<project>.supabase.co/storage/v1/object/public/vsl-media/videos/main-vsl-v2/master.m3u8

This is a correctness fix only. It does not address the ladder's 1.28 Mbps floor
or its 10-second segments — see `docs/VIDEO_STREAMING.md` for those.
