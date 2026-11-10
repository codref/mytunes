# Vision: song as source code

## The gap

For decades, sharing music meant sharing a **finished waveform** (or a score that assumes human performers). Generative models change the economics of listening:

- The same lyrical and structural idea can be realized in many styles.
- Listeners already expect personalization (playlists, mood, language, energy).
- Creators need a way to publish **intent + rights**, not only one mixdown.

Existing containers (AIFM, AIM, C2PA music guidance, plain prompt text files) either package **outputs** with provenance, or paste **flat prompts** into a single vendor’s UI. None of them yet define a portable **creative source document** aimed at LLM / music-model interchange *and* listener-side adaptation.

## What `.tune` is

A `.tune` file is the **source code of a song**:

1. **Intent** — genre, mood, tempo, key, structure or timeline, band roles, lyrics.
2. **Compiled prompt** — a frozen natural-language rendering of that intent for a generator.
3. **Rights** — who wrote it, under which SPDX license(s), human/AI disclosure.
4. **Optional takes** — example renders so a package remains playable offline.
5. **Optional cover** — square artwork so players and libraries can present the song visually.

Audio is a *build artifact*. The pattern is the program.

## Why adaptation matters

Emerging players will not only decode MP3s. They will:

- Prefer a quieter arrangement for late-night listening.
- Shift language, energy, or instrumentation within the author’s license.
- Re-generate a chorus for a local model when the original take is unavailable.
- Respect share-alike and attribution when deriving a new take.

That only works if the **editable source** travels with (or instead of) a single master recording. `.tune` is designed so a conformant player can:

| Mode | Behavior |
|------|----------|
| **Faithful** | Play an included take, or regenerate from the compiled prompt as-is |
| **Profiled** | Apply a listener taste profile (tempo band, energy, genre lean) to knobs, then recompile / regenerate |
| **Fork** | Save a new `.tune` with remapped ids, preserving upstream credit and license |

See [ADAPTATION.md](ADAPTATION.md).

## Principles

1. **Source over stem** — knobs and lyrics outrank any one render.
2. **Rights travel with the work** — license text and SPDX ids live in the archive.
3. **Model-agnostic core** — structured fields first; vendor prompts are derived views.
4. **Graceful degradation** — a dumb player can still play included audio; a smart one can adapt.
5. **Open and versioned** — `tuneFormatVersion` is the contract; extend without silent breakage.

## Relationship to myTunes

myTunes is a **reference studio**: it authors patterns, compiles Lyria prompts, and round-trips `.tune` archives. The format is not proprietary to Google Lyria or to myTunes — other compilers and players SHOULD map the same structured fields to their backends.
