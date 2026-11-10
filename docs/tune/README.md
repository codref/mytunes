# The `.tune` open format

**Status:** Draft · **Version:** 1 · **Extension:** `.tune`

`.tune` is an open, ZIP-based container for the **source of a song** — structured creative intent, lyrics, arrangement knobs, rights, optional cover artwork, and optional rendered takes — so tools and players can **reproduce, share, and adapt** music without treating a single MP3 as the only artifact.

Music is becoming generative and personal. Fixed recordings still matter; they are no longer the whole story. A format that carries *how a song is specified* lets a player, studio, or agent regenerate or reshape the piece for different tastes, contexts, or models — while keeping authorship and license first-class.

| Document | Topic |
|----------|--------|
| [VISION.md](VISION.md) | Why `.tune` exists; song-as-source-code |
| [SCOPE.md](SCOPE.md) | What v1 includes and deliberately omits |
| [FORMAT.md](FORMAT.md) | Container layout, `manifest.json`, schemas |
| [RIGHTS.md](RIGHTS.md) | Attribution, SPDX licenses, dual licensing |
| [ADAPTATION.md](ADAPTATION.md) | Taste adaptation and player profiles |
| [CONFORMANCE.md](CONFORMANCE.md) | Writer / reader / adapter rules |
| [EXAMPLES.md](EXAMPLES.md) | Minimal archive walkthrough |

**Reference implementation:** [myTunes](../../README.md) (export / load `.tune`, Rights tab).

**Default work license in the reference UI:** [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) (the myTunes *application* remains MIT; the creative work is separate).

```
docs/tune/          ← this standard tree
src/models/         ← Pattern, SongRights (live schema)
src-electron/
  services/tuneArchive.ts
  assets/licenses/  ← short SPDX texts packed into legal/
```
