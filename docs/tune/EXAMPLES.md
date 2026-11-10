# Examples

## Minimal source-only archive

```text
demo.tune
├── manifest.json
├── song.json
├── prompt/
│   └── compiled.txt
└── legal/
    └── license-primary.txt
```

### `manifest.json`

```json
{
  "tuneFormatVersion": 1,
  "exportedAt": "2026-11-10T19:00:00.000Z",
  "app": "myTunes",
  "songId": "11111111-1111-1111-1111-111111111111",
  "title": "Harbor Lights",
  "licensePrimary": "CC-BY-SA-4.0",
  "licenseSecondary": ""
}
```

### Rights snippet inside `song.json`

```json
{
  "pattern": {
    "song": {
      "genre": "indie pop",
      "mood": "dreamy",
      "bpm": 110,
      "rights": {
        "composers": "A. River",
        "lyricists": "A. River",
        "copyrightHolder": "A. River",
        "copyrightYear": "2026",
        "licensePrimary": "CC-BY-SA-4.0",
        "licenseSecondary": "",
        "notice": "",
        "madeBy": "both"
      }
    }
  }
}
```

## Dual-licensed package

Same layout, plus:

```text
legal/license-secondary.txt
```

Manifest:

```json
{
  "licensePrimary": "CC-BY-SA-4.0",
  "licenseSecondary": "MIT"
}
```

Downstream may use the work under **either** CC BY-SA 4.0 **or** MIT.

## With takes (playable offline)

```text
demo.tune
├── manifest.json
├── song.json
├── prompt/compiled.txt
├── legal/license-primary.txt
└── generations/
    ├── index.json
    ├── aaaaaaaa-....mp3
    └── bbbbbbbb-....mp3
```

`index.json` lists take metadata (mode, model, compiled prompt snapshot, optional returned lyrics). Audio filenames match generation ids.

## With cover artwork

```text
demo.tune
├── manifest.json          # includes "cover": "cover.jpg"
├── song.json
├── cover.jpg              # square JPEG (1:1 recommended)
├── prompt/compiled.txt
└── legal/license-primary.txt
```

Cover is song-level (not per take). Players MAY show it as album art or a panel background.

## myTunes round-trip

1. Author knobs + lyrics + Rights tab; optionally **Set cover** on the player panel (1:1 crop).
2. **Export .tune…** → native save dialog → folder revealed (includes `cover.jpg` when set).
3. On another machine: **Open → Load .tune…** → new library song + remapped takes + cover.

Implementation: [`tuneArchive.ts`](../../src-electron/services/tuneArchive.ts).
