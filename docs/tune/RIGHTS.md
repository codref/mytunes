# Rights and licensing

Authorship and license are **central** to `.tune`. A shared song source without clear rights is a liability for platforms and listeners alike.

## Layers

| Layer | What it covers | Typical license |
|-------|----------------|-----------------|
| **Application** (e.g. myTunes) | Studio software | MIT (for myTunes) |
| **Creative work** | Pattern, lyrics, compiled prompt, included takes | Declared in the `.tune` (default CC-BY-SA-4.0 in the reference UI) |

Do not confuse the two. Shipping a `.tune` under CC BY-SA does not relicense the studio app.

## `SongRights` fields

Stored under `song.json` → `pattern.song.rights`:

| Field | Meaning |
|-------|---------|
| `composers` | Composer credit (free text; `;`-separated names OK) |
| `lyricists` | Lyricist credit (blank if same as composer) |
| `copyrightHolder` | Rights holder name |
| `copyrightYear` | Year string |
| `licensePrimary` | SPDX id (required; default `CC-BY-SA-4.0`) |
| `licenseSecondary` | Optional second SPDX id for dual licensing |
| `notice` | Extra credit, URL, or notes |
| `madeBy` | `human` \| `ai` \| `both` |

Manifest mirrors `licensePrimary` / `licenseSecondary` for quick inspection.

## Dual licensing

When `licenseSecondary` is non-empty, the work is **dual-licensed**: a downstream party may choose to comply with **either** the primary **or** the secondary license (standard open-source dual-license semantics).

Writers MUST embed:

- `legal/license-primary.txt`
- `legal/license-secondary.txt` (only when dual)

## Recommended SPDX set (v1 UI)

- `CC-BY-SA-4.0` (default)
- `CC-BY-4.0`
- `CC0-1.0`
- `CC-BY-NC-SA-4.0`
- `MIT`
- `Apache-2.0`
- Custom SPDX / proprietary id (document in `notice` and custom legal text)

## Adaptation and share-alike

If the primary (or chosen dual) license is share-alike (e.g. CC BY-SA), derived `.tune` packages and regenerated audio distributed publicly SHOULD carry a compatible license and retain attribution fields. See [ADAPTATION.md](ADAPTATION.md).

## What rights are not

- Not a DRM system
- Not proof of originality
- Not injected into generator prompts by conformant compilers
