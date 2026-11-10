# Scope (v1)

## In scope

| Area | v1 commitment |
|------|----------------|
| Container | ZIP archive with extension `.tune` |
| Identity | Title, ids, export timestamp, producing app |
| Creative source | Pattern: song identity, band slots/knobs, lyrics, composition mode (sections or timeline) |
| Prompt snapshot | Frozen `prompt/compiled.txt` at export time |
| Rights | Composer/lyricist/holder/year, SPDX primary (+ optional secondary), made-by, notice |
| Takes | Optional generation index + MP3s for that song only |
| Cover | Optional square song artwork (`cover.jpg`) for players / libraries |
| Round-trip | Import always mints new ids (no silent overwrite of a library) |

## Explicitly out of scope (v1)

- Multi-track DAW projects, stem separation, or DAW session interchange
- Guaranteed bit-identical regeneration across model versions or vendors
- Cryptographic proof of authorship (C2PA may wrap a `.tune` later; not required in v1)
- Album / multi-song packages (one `.tune` = one song project)
- Real-time collaborative editing protocols
- DRM or license *enforcement* engines (declaration only)
- Binding to a single music API (Lyria, Suno, etc.)

## Non-goals that look similar

| Nearby idea | How `.tune` differs |
|-------------|---------------------|
| **AIFM / release packs** | Output-centric music delivery with optional prompts; `.tune` is source-first, audio optional |
| **MusicXML / MIDI** | Symbolic performance data; `.tune` is LLM-oriented creative intent |
| **OpenSong-style paste files** | Human-readable prompt blocks; `.tune` adds archive, knobs, rights, takes |
| **App project folders** | Vendor-private; `.tune` is an open interchange document |

## Success criteria for v1

A third-party tool can:

1. Unzip a `.tune` and read title, licenses, and lyrics without myTunes.
2. Feed `prompt/compiled.txt` (or recompile from `song.json`) into another model.
3. Optionally play included takes.
4. Optionally display `cover.jpg` as song artwork.
5. Optionally apply a taste profile and produce a derived `.tune` under the stated license.
