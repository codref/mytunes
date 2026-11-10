# Adaptation: players that fit the listener

## Motivation

People do not all want the same mix, tempo, or emotional intensity. Generative audio makes **taste-shaped playback** practical: the player holds a `.tune` (source) plus a **listener profile**, then produces a suitable take — cached, streamed, or on-device.

`.tune` does not define the profile format in v1; it defines the **song source** that profiles act upon.

## Conceptual pipeline

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  .tune      │     │ Listener profile │     │ Adapter         │
│  pattern +  │ ──▶ │ (energy, genre   │ ──▶ │ merge → recompile│
│  rights +   │     │  lean, language, │     │ → generate/play │
│  optional   │     │  BPM preference) │     │                 │
│  takes      │     └──────────────────┘     └─────────────────┘
└─────────────┘
```

1. **Load** — parse `song.json`, rights, optional takes.
2. **Decide** — if a faithful take matches the profile closely enough, play it.
3. **Adapt** — otherwise patch allowed knobs (energy, mood hints, slot intensity, language when licensed/supported), recompile prompt, regenerate.
4. **Attribute** — display composer / license / made-by from the archive.
5. **Optionally fork** — write a new `.tune` for the adapted pattern under a compatible license.

## What may be adapted (informative)

Safe-by-default knobs for taste profiles (author can constrain later via policy extensions):

| Knob family | Examples |
|-------------|----------|
| Energy / dynamics | `song.energy`, timeline intensities, drum fills |
| Color / genre lean | `song.genre`, `song.mood`, slot `style` knobs |
| Tempo | `song.bpm` within a reasonable band of the source |
| Vocals | presence, timbre; language only if the model + license allow |
| Structure | Prefer keeping section order; shortening duration hints for “quick listen” |

Adapters SHOULD treat lyrics as **high integrity** content: paraphrase only when the license and UX clearly allow “cover-like” regeneration, and always keep attribution.

## What must not be silently dropped

- `rights.*` and `legal/*`
- Original composer / lyricist credit when distributing a derived package
- Dual-license choice semantics (downstream still may pick either license if dual)

## Faithful vs adaptive modes

| Mode | Player behavior |
|------|-----------------|
| **Faithful** | Prefer included take or regenerate from `prompt/compiled.txt` unchanged |
| **Adaptive** | Merge profile → pattern → new compile → new take |
| **Offline** | Play included MP3s only; show that adaptation needs a model |

## Future hooks (non-normative in v1)

Possible later extensions (new `tuneFormatVersion` or additive files):

- `adaptation/policy.json` — author-declared allowed knob ranges
- `adaptation/seeds.json` — preferred seeds / model hints
- Listener profile interchange (separate spec)

v1 stays lean: **source + rights + optional builds** is enough for first adapters.
