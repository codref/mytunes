# Format internals (v1)

## Media type and packaging

- **File extension:** `.tune`
- **Container:** ZIP (DEFLATE recommended)
- **Charset:** UTF-8 for all text and JSON
- **Version field:** `manifest.tuneFormatVersion` — currently `1`

Writers MUST set `tuneFormatVersion` to an integer they support. Readers MUST reject unknown major versions they cannot interpret (v1 readers reject ≠ 1).

## Directory layout

```text
archive.tune/                    (ZIP root)
  manifest.json                  REQUIRED
  song.json                      REQUIRED
  prompt/
    compiled.txt                 REQUIRED (may be empty if instrumental / incomplete)
  legal/
    license-primary.txt          REQUIRED
    license-secondary.txt        OPTIONAL (dual license only)
  generations/
    index.json                   OPTIONAL (omit or `[]` if no takes)
    {generationId}.mp3           OPTIONAL per take
```

Unknown top-level entries SHOULD be preserved on round-trip by advanced tools; simple tools MAY ignore them.

## `manifest.json`

Minimal interchange header so tools need not parse the full song to show title and license.

```json
{
  "tuneFormatVersion": 1,
  "exportedAt": "2026-11-10T18:00:00.000Z",
  "app": "myTunes",
  "songId": "uuid-of-exported-song",
  "title": "Song title",
  "licensePrimary": "CC-BY-SA-4.0",
  "licenseSecondary": ""
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `tuneFormatVersion` | yes | Integer; `1` for this revision |
| `exportedAt` | yes | ISO-8601 UTC |
| `app` | yes | Producing application name |
| `songId` | yes | Id at export time (import remaps) |
| `title` | yes | Display title |
| `licensePrimary` | yes | SPDX id or custom token |
| `licenseSecondary` | yes | Empty string if not dual-licensed |

## `song.json`

Full song project document. In the myTunes reference model this is a `Song`:

```ts
{
  id: string;
  name: string;
  updatedAt: string;           // ISO-8601
  pattern: Pattern;            // creative source
  activeGenerationId?: string; // optional pointer into generations/
}
```

### `Pattern` (creative source)

Canonical fields live in [`src/models/pattern.ts`](../../src/models/pattern.ts). Summary:

| Area | Fields |
|------|--------|
| Meta | `id`, `name`, `lyriaMode`, `compositionMode` |
| Song identity | `genre`, `mood`, `bpm`, `timeSignature`, `key`, `energy`, `structure[]`, `durationHint`, `instrumental`, `language`, `soundscape`, `productionQuality`, `timeline[]`, `auto` |
| Rights | `song.rights` — see [RIGHTS.md](RIGHTS.md) |
| Lyrics | `lyrics.text`, `lyrics.source` (`manual` \| `generated`) |
| Band | `slots[]` — vocals / drums / bass / guitars / keys / other (`enabled`, `knobs`, `notes`, optional `voices`) |
| Prompt cache | `compiledPrompt` (derived; also frozen in `prompt/compiled.txt`) |

**Normative rule:** Rights and license text MUST NOT be required as input to a music generator. They travel for humans, platforms, and adapters — not as sung or style content unless the author puts them in lyrics deliberately.

## `prompt/compiled.txt`

Snapshot of the natural-language prompt as compiled at export. Adapters MAY:

- Send this file verbatim to a model, or
- Recompile from `song.json` with their own compiler (preferred when adapting knobs).

## `legal/`

Short human-readable license texts corresponding to the SPDX (or custom) ids in the manifest and `song.rights`. See [RIGHTS.md](RIGHTS.md).

## `generations/`

Optional example renders for the song.

`index.json` is an array of take records. Audio paths inside the archive are `generations/{id}.mp3`. Importing tools MUST remap ids and MUST NOT assume absolute host paths from the exporter’s machine are valid.

Takes are **illustrative builds**, not the sole definition of the work.

## Stability

- Additive JSON fields with defaults are preferred over renames.
- Removing or reinterpreting a required v1 field requires a new `tuneFormatVersion`.
- Reference pack/unpack: [`src-electron/services/tuneArchive.ts`](../../src-electron/services/tuneArchive.ts).
