# Conformance

Three roles: **Writer**, **Reader**, **Adapter**.

## Writer (export)

MUST:

1. Produce a ZIP with extension `.tune`.
2. Include valid `manifest.json` with `tuneFormatVersion: 1`.
3. Include `song.json` with a pattern containing song identity and lyrics fields (lyrics MAY be empty for instrumentals).
4. Include `prompt/compiled.txt` (empty file allowed only if no prompt was available).
5. Include `legal/license-primary.txt` matching `licensePrimary`.
6. If dual-licensed, set `licenseSecondary` and include `legal/license-secondary.txt`.
7. If shipping takes, put portable records in `generations/index.json` and audio as `generations/{id}.mp3` (no reliance on absolute host paths for consumers).

SHOULD:

1. Normalize pattern fields (defaults for missing legacy data).
2. Keep rights out of the compiled generator prompt.
3. Set `madeBy` honestly (`human` / `ai` / `both`).
4. When the song has artwork, include root `cover.jpg` (square JPEG preferred) and set `manifest.cover`.

## Reader (inspect / library import)

MUST:

1. Reject archives with unsupported `tuneFormatVersion`.
2. Surface title and license ids from the manifest (or song rights).
3. On import into a library, **mint new song and generation ids** (never overwrite by exported id alone).

SHOULD:

1. Remap `activeGenerationId` through the id map.
2. Preserve unknown JSON fields when rewriting `song.json`.
3. Import and preserve `cover.jpg` (or `manifest.cover`) under the new song id.

MAY:

1. Play included MP3s without understanding knobs.
2. Ignore `generations/` entirely and only load source.
3. Ignore cover artwork.

## Adapter (taste / regenerate)

MUST:

1. Honor attribution display when playing or redistributing.
2. When publishing a derived `.tune`, keep or upgrade license terms consistently with the chosen license (especially share-alike).

SHOULD:

1. Prefer recompiling from structured pattern after knob patches over silently editing only `compiled.txt`.
2. Record in derived metadata that adaptation occurred (e.g. notice field or future policy file).

MUST NOT:

1. Strip `legal/` while redistributing the creative source.
2. Claim a faithful original take when the audio was regenerated under a different profile (label adaptive playback).

## Test checklist (smoke)

- [ ] Unzip → `manifest.json` parses; version is 1
- [ ] `song.json` has `pattern.song` and `pattern.lyrics`
- [ ] Primary license file present
- [ ] Dual: secondary id + file both present or both absent
- [ ] Import twice → two distinct library songs
- [ ] Optional: play at least one included take
- [ ] Optional: cover present → import shows artwork; export round-trips `cover.jpg`
