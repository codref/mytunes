# mytunes

Desktop music studio (Quasar Vue 3 + Electron). Band-style knobs and lyrics compile into a Lyria prompt; Gemini Flash assists with lyrics/prompt refine; Lyria Clip / full-song models generate audio.

## Google backends (both supported)

| Backend | When used | Auth | Full-song model |
|---------|-----------|------|-----------------|
| **Vertex AI** (preferred if project set) | `GOOGLE_CLOUD_PROJECT` set | ADC or `GOOGLE_APPLICATION_CREDENTIALS` | `lyria-3-pro-preview` |
| **Gemini Developer API** | `GOOGLE_API_KEY` and no Vertex project (or `GOOGLE_GENAI_USE_GEMINI_API=true`) | API key | `lyria-3.5` |

Clip model on both: `lyria-3-clip-preview` (~$0.04). Full song ~$0.08.

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

## Usage notes

- One Lyria call per song — band tabs shape a single prompt.
- Default to **Clip** for iteration; **Full** when committing.
- Budget bar: soft warn at 80%, hard stop at 100%.
- Patterns / MP3s live under Electron `userData`.
