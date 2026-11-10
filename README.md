# myTunes

Desktop music studio that turns band-style knobs, lyrics, and arrangement into a single Lyria prompt, then generates audio with Google’s music models. Built with Quasar (Vue 3) + Electron.

**License:** [MIT](LICENSE) — free to use, modify, and redistribute, including commercially.

## Project scope

**myTunes** is a local creative workstation for AI song generation. You shape a *pattern* (song identity + band slots + lyrics), the app compiles that into one Lyria prompt, and each Generate call produces a versioned take you can play, compare, fork, and export.

| Layer | Role |
|-------|------|
| **Studio UI** | Song/library management, band knobs, lyrics, timeline, coherence audit, player |
| **Prompt compiler** | Deterministic knobs → Lyria prompt (previewable before spend) |
| **Gemini Flash** | Lyrics help, prompt refine, coherence re-split, in-app assistant |
| **Lyria** | Clip (~30s) or full-song audio generation |
| **Electron main** | API keys / Vertex auth, budget ledger, song & generation storage under `userData` |

### In scope

- One Lyria call per song take (band tabs feed a single compiled prompt)
- Clip vs full generation modes with soft/hard budget gates
- Multi-voice vocals with `[Voice: Name]` lyric tags
- Section-based or timed-timeline composition
- Version history with recall / fork from prior takes
- Waveform MP4 + SRT export
- Chat assistant that proposes soft knobs patches and hard lyrics/structure changes

### Out of scope

- Multi-track DAW editing or stem separation
- Real-time collaborative editing
- Non-Google music backends (current stack is Vertex / Gemini Developer API only)

---

## User guide

### First-time setup

1. Install dependencies and copy env:

```bash
npm install
cd src-electron && npm install && cd ..
cp .env.local.example .env.local
```

2. Configure a Google backend (see [Google backends](#google-backends-both-supported) below), or open **Settings** in the app after launch.
3. Optional smoke test, then start the desktop app:

```bash
npm run smoke:gemini
npm run dev:electron
```

If the header shows a red banner (“No backend configured”), open **Settings** (tune icon) and add a Gemini API key or Vertex project.

### Studio layout

| Area | What it does |
|------|----------------|
| **Header** | Song title, version count, budget meter, Settings, Assistant |
| **Left panel** | Band tabs that define the pattern |
| **Right panel** | Player, version list, video export |
| **Toolbar** | New / Save / Save as / Open, Generate Clip or Full |

Songs and MP3s are stored under Electron `userData` (not in the git repo).

### Typical workflow

1. **New song** — set a name in the Song tab (or rename from the header).
2. **Song identity** — genre, mood, BPM, energy, key, time signature, language, optional soundscape / production notes.
3. **Composition mode**
   - *Sections* — structure like `[Intro] -> [Verse 1] -> [Chorus]` (or let Lyria decide with Auto structure).
   - *Timeline* — timed segments with intensity; structure tags can sync from timeline labels.
4. **Band slots** — enable Vocals / Drums / Bass / Guitars / Keys / Other and tune knobs + free-text notes. Disabled slots are omitted from the prompt.
5. **Lyrics** — write tagged sections (`[Verse]`, `[Chorus]`, …). Use **Generate lyrics** or **Check & fix** (Flash). Mark instrumental if you want no sung text.
6. **Prompt tab** — review the compiled prompt before spending.
7. **Generate** — prefer **Clip** while iterating (~$0.04); use **Full** when committing (~$0.08).
8. **Listen & audit** — play the take; check **Coherence** for knob/lyric drift; adopt returned lyrics from the Lyrics tab when useful.
9. **Versions** — expand a take to recall its pattern, fork into a new song, or **Export video** (waveform MP4 + SRT).

### Song tab

- **Presets** — quick-load song presets.
- **Auto toggles** — omit duration or structure from the Lyria prompt while keeping values in the UI.
- Supported vocal languages: English, German, Spanish, French, Hindi, Japanese, Korean, Portuguese.

### Lyrics tab

- Source lyrics go to Lyria; slight wording adaptation is expected.
- Tag singers with `[Voice: Lead]` (names must match the **Vocals** tab). Untagged lines use the first voice.
- Put stage directions in parentheses — they are stripped from sung text so Lyria does not treat them as backing-vocal echoes.
- After a take, compare your sheet to returned lyrics; adopt or keep editing.

### Vocals tab

- Up to four voices (name, style, gender, range, timbre, delivery, presence).
- Toggle Vocals off for instrumental-forward tracks (or use Song → instrumental).

### Coherence tab

- Audits the active take against your current knobs, structure, and lyric sheet.
- Overlap badge shows how closely returned lyrics match your sheet.
- **Re-split (Flash)** separates sung lyrics from arrangement commentary when Lyria mixes them.

### Timeline tab

Visible when composition mode is **Timeline**. Edit timed segments (start/end, label, direction, intensity 1–10). The compiler turns these into timed arrangement blocks in the prompt.

### Prompt tab

Read-only preview of what will be sent. Use this before Clip/Full to catch empty lyrics, disabled slots, or accidental Auto omissions.

### Generate & budget

- Split button: click to generate with the current mode; dropdown switches Clip / Full and shows price.
- Budget bar: soft warn at **80%**, hard stop at **100%** (raise limits via the gear on the budget meter).
- Each generation is billed once and stored as a version on the current song.

### Player & versions

- Play the active take; switch versions from the list.
- **Recall** restores that take’s pattern snapshot into the editor.
- **Fork** copies a take’s pattern into a new song.
- **Export video** renders a waveform MP4 plus sidecar SRT captions.

### Assistant

Open with the chat icon. The assistant sees your current pattern and can:

- Suggest **soft** patches (genre, BPM, knobs, voices, …) — applied immediately, undoable
- Propose **hard** patches (lyrics, structure, mode, timeline) — accept or reject explicitly

Use it to brainstorm arrangement changes without hand-editing every field. Flash usage counts against your budget.

### Settings

- **Backend**: Auto / Vertex / Gemini API
- API key, Vertex project/location, optional service-account JSON path
- Flash model used for assistant, lyrics, and refine
- Default pattern values for **Reset** / new songs

`.env.local` remains the fallback when Settings fields are empty.

---

## Google backends (both supported)

| Backend | Auth | Typical use |
|---------|------|-------------|
| **Vertex AI** | ADC or `GOOGLE_APPLICATION_CREDENTIALS` + project | Larger GCP credits |
| **Gemini Developer API** | API key (AI Studio prepaid) | Smaller prepaid balance |

**Settings** has separate tabs:

- **Accounts** — shared API key + Vertex project/location
- **Assistant** — Vertex *or* Gemini API for Flash (chat, lyrics, refine)
- **Music** — Vertex *or* Gemini API for Lyria (+ clip/full model picks)

Header cost tracking shows **two spend bars** (Vertex vs Gemini API). Default full models: Vertex `lyria-3-pro-preview`, Gemini API `lyria-3.5`. Clip: `lyria-3-clip-preview` (~$0.04). Full ~$0.08.

### Vertex setup (Cloud Console)

1. Create/select a GCP project with **Cloud Billing** enabled.
2. Enable **Vertex AI API** (`aiplatform.googleapis.com`).
3. Authenticate:

```bash
gcloud auth application-default login
# or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON
```

4. In `.env.local`:

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
```

Lyria Interactions require **location `global`**.

### Gemini Developer API setup (AI Studio)

```bash
GOOGLE_API_KEY=your_key
# optional if you also have a project set:
GOOGLE_GENAI_USE_GEMINI_API=true
```

Requires prepaid credits on the AI Studio / Developer API project.

---

## Install & smoke test

```bash
npm install
cd src-electron && npm install && cd ..
cp .env.local.example .env.local   # edit credentials
npm run smoke:gemini
npm run dev:electron
```

Smoke exit `2` usually means auth worked but billing/quota failed.

### Smoke flags (run tests individually)

```bash
npm run smoke:flash          # Gemini text only
npm run smoke:clip           # Lyria Clip only (~$0.04)
npm run smoke:full           # Lyria full song (~$0.08)
npm run smoke:all            # flash + clip + full
npm run smoke:gemini -- --help

# examples
npm run smoke:gemini -- --flash --flash-model gemini-2.0-flash-001 --location us-central1
npm run smoke:gemini -- --clip --location global
npm run smoke:gemini -- --flash --clip --strict
```

Default `smoke:gemini` runs `--flash --clip`. Vertex Flash 404 warns unless `--strict`.

### Other scripts

```bash
npm run lint                 # format + eslint fix
npm run typecheck
npm run build:electron       # packaged desktop build
```

### CI (GitHub Actions)

Workflow [`.github/workflows/electron-build.yml`](.github/workflows/electron-build.yml) builds unsigned Electron bundles on Linux, Windows, and macOS.

- **Manual:** Actions → *Electron build* → *Run workflow*
- **Tagged release:** push a tag like `v0.1.0` — builds upload as artifacts and attach to a GitHub Release

Artifacts are zip files under `dist/electron/Packaged` (Quasar + `@electron/packager`). Code signing / notarization is not configured yet.

---

## Tips

- Iterate on **Clip**; spend on **Full** when the prompt and lyrics are stable.
- Keep voice names in lyrics identical to the Vocals roster.
- Check **Coherence** after surprising takes — drift often means tightening structure tags or voice presence, not rewriting everything.
- Patterns, songs, and audio live under Electron `userData`; treat that folder as your library backup.
