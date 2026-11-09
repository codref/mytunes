import { Type, type Content, type FunctionDeclaration, type Part } from '@google/genai';
import type {
  AssistantPatch,
  HardPatch,
  SoftPatch,
  SoftPatchOp,
} from '../../src/models/assistant';
import {
  BAND_SLOT_IDS,
  DEFAULT_TIME_SIGNATURE,
  LYRIA_LANGUAGES,
  TIME_SIGNATURES,
  clampIntensity,
  createTimelineSegment,
  getCompositionMode,
  type BandSlotId,
  type Pattern,
  type TimelineSegment,
} from '../../src/models/pattern';
import { defaultTimelineDuration, describeSongForTranspose } from '../../src/models/timeline';
import {
  estimateFlashCost,
  getClient,
  KeyMissingError,
  resolveFlashModel,
} from './geminiClient';

const MAX_STEPS = 5;

const SYSTEM_PROMPT = `You are the mytunes studio co-pilot. Users describe a song idea; you turn that into concrete Pattern knobs and settings.

Rules:
- Prefer calling tools to update the live Pattern. Explain musical intent in plain language after tools run.
- Use update_song / update_slot / update_voice for soft adjustments (genre, mood, BPM, meter, key, energy, soundscape, production, instruments, vocal gender/range/timbre).
- Use set_structure, set_lyrics, or set_lyria_mode when proposing structure, lyrics, or clip/full mode — these need user confirmation in the UI.
- Composition modes: "sections" (default lyric tags) vs "timeline" (timed [mm:ss] segments with Intensity 1–10).
- When compositionMode is "timeline", prefer set_timeline / update_timeline_segment / transpose_to_timeline. Treat section structure as derived from timeline labels. Do not fight the timeline with set_structure unless the user asks.
- When compositionMode is "sections", prefer set_structure. Offer transpose_to_timeline when the user wants timed arrangement control.
- Languages must be one of: ${LYRIA_LANGUAGES.join(', ')}.
- Pick concrete values (e.g. bpm 118, timeSignature "4/4", energy 70, groove "shuffled"), not vague prose in knobs.
- Never name real artists, bands, or songs in knobs, notes, lyrics, or genre — Lyria blocks those prompts.
- When drafting lyrics, respect the song time signature and BPM (line length / stress); give a clear theme/story; Lyria may adapt wording slightly — keep strong hooks and section tags.
- Prefer Clip mode while iterating; keep lyrics short unless the user asks for a full song.
- Never generate audio or claim you called Lyria. The user owns Generate.
- Keep answers concise (a few sentences). Do not dump full JSON unless asked.
- Current Pattern JSON is provided each turn — ground your changes in it.`;

const TIMELINE_SEGMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    startSec: { type: Type.NUMBER },
    endSec: { type: Type.NUMBER },
    label: { type: Type.STRING },
    direction: { type: Type.STRING },
    intensity: { type: Type.NUMBER, description: '1–10' },
  },
  required: ['startSec', 'endSec', 'label', 'intensity'],
};

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'update_song',
    description: 'Update soft song-level fields (auto-applied in the UI).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Pattern / song name' },
        genre: { type: Type.STRING },
        mood: { type: Type.STRING },
        bpm: { type: Type.NUMBER, description: 'Tempo 60–180' },
        timeSignature: {
          type: Type.STRING,
          description: 'Meter e.g. 4/4, 3/4, 6/8, 12/8, 5/4, 7/8',
        },
        key: { type: Type.STRING, description: 'e.g. G major, A minor' },
        energy: { type: Type.NUMBER, description: '0–100' },
        language: {
          type: Type.STRING,
          description: `One of: ${LYRIA_LANGUAGES.join(', ')}`,
        },
        instrumental: { type: Type.BOOLEAN },
        durationHint: { type: Type.STRING, description: 'Hint for full-song mode' },
        soundscape: {
          type: Type.STRING,
          description: 'Ambient / sonic environment e.g. rain, spacious reverb',
        },
        productionQuality: {
          type: Type.STRING,
          description: 'Mix character e.g. clean mix, vintage recording',
        },
      },
    },
  },
  {
    name: 'update_slot',
    description: 'Update one band slot (vocals, drums, bass, guitars, keys, other). Soft / auto-applied.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Band slot id',
          enum: [...BAND_SLOT_IDS],
        },
        enabled: { type: Type.BOOLEAN },
        notes: { type: Type.STRING },
        knobs: {
          type: Type.OBJECT,
          description: 'Knob key/value map (numbers 0–100 or style strings)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_voice',
    description:
      'Update one vocal voice (gender, range, timbre, style, delivery, presence, notes, name). Soft / auto-applied. Use voiceId from Pattern JSON, or omit to update the lead (first) voice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        voiceId: { type: Type.STRING, description: 'Voice id; omit for lead/first voice' },
        name: { type: Type.STRING },
        style: { type: Type.STRING },
        gender: {
          type: Type.STRING,
          enum: ['female', 'male', 'neutral', 'unspecified'],
          description: 'Singer gender / presentation (unspecified = leave blank)',
        },
        range: {
          type: Type.STRING,
          description: 'baritone | tenor | alto | mezzo | soprano | low | mid | high',
        },
        timbre: {
          type: Type.STRING,
          description: 'e.g. breathy, soulful, gravelly, clear, sweet',
        },
        delivery: { type: Type.STRING },
        presence: { type: Type.NUMBER, description: '0–100' },
        notes: { type: Type.STRING },
      },
    },
  },
  {
    name: 'set_structure',
    description: 'Propose a full song structure (requires user Apply). Prefer when compositionMode is sections.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        structure: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Section tags e.g. [Intro], [Verse 1], [Chorus]',
        },
      },
      required: ['structure'],
    },
  },
  {
    name: 'set_composition_mode',
    description: 'Propose sections vs timeline composition (requires user Apply).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ['sections', 'timeline'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'set_timeline',
    description:
      'Propose a full timed timeline (requires Apply). Switches to timeline mode. Prefer when compositionMode is timeline or user wants timed arrangement.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        segments: {
          type: Type.ARRAY,
          items: TIMELINE_SEGMENT_SCHEMA,
          description: 'Ordered timeline segments with startSec/endSec/label/direction/intensity',
        },
      },
      required: ['segments'],
    },
  },
  {
    name: 'transpose_to_timeline',
    description:
      'Read live song settings and propose a coherent timeline (requires Apply). Use when the user asks to transpose configuration into timed segments.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        segments: {
          type: Type.ARRAY,
          items: TIMELINE_SEGMENT_SCHEMA,
          description:
            'Full timeline derived from genre/mood/BPM/meter/structure/duration/energy/instruments',
        },
        notes: { type: Type.STRING, description: 'Brief rationale' },
      },
      required: ['segments'],
    },
  },
  {
    name: 'update_timeline_segment',
    description: 'Soft-update one timeline segment (intensity/direction/label/times). Auto-applied.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        startSec: { type: Type.NUMBER },
        endSec: { type: Type.NUMBER },
        label: { type: Type.STRING },
        direction: { type: Type.STRING },
        intensity: { type: Type.NUMBER },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_lyrics',
    description: 'Propose lyrics text (requires user Apply).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
      },
      required: ['text'],
    },
  },
  {
    name: 'set_lyria_mode',
    description: 'Propose clip vs full generation mode (requires user Apply).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ['clip', 'full'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'read_pattern',
    description: 'Echo the current Pattern snapshot for grounding.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export interface AssistantTurnInput {
  conversationId: string;
  message: string;
  pattern: Pattern;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Override settings flash model for this turn. */
  model?: string;
  signal?: AbortSignal;
  onProgress?: (text: string) => void;
}

export interface AssistantTurnResult {
  message: string;
  patches: AssistantPatch[];
  costUsd: number;
  model: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function soft(
  op: SoftPatchOp,
  path: string,
  value: unknown,
  label: string,
  previous?: unknown,
  extra?: Partial<SoftPatch>,
): SoftPatch {
  return {
    kind: 'soft',
    id: newId(),
    op,
    path,
    value,
    label,
    previous,
    ...extra,
  };
}

function hard(op: HardPatch['op'], value: unknown, label: string): HardPatch {
  return {
    kind: 'hard',
    id: newId(),
    op,
    value,
    label,
    status: 'pending',
  };
}

function clampBpm(n: number): number {
  return Math.max(60, Math.min(180, Math.round(n)));
}

function clampEnergy(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeTimeSignature(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, '');
  const known = (TIME_SIGNATURES as readonly string[]).find((s) => s === cleaned);
  if (known) return known;
  if (/^\d{1,2}\/\d{1,2}$/.test(cleaned)) return cleaned;
  return DEFAULT_TIME_SIGNATURE;
}

function normalizeLanguageArg(raw: string): string {
  const exact = (LYRIA_LANGUAGES as readonly string[]).find(
    (l) => l.toLowerCase() === raw.trim().toLowerCase(),
  );
  return exact ?? 'English';
}

function isSlotId(id: string): id is BandSlotId {
  return (BAND_SLOT_IDS as string[]).includes(id);
}

function parseSegments(raw: unknown): TimelineSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const s = (item && typeof item === 'object' ? item : {}) as Partial<TimelineSegment>;
    const partial: Partial<TimelineSegment> = {
      startSec: Number(s.startSec) || 0,
      endSec: Number(s.endSec) || 0,
      label: String(s.label ?? 'Section'),
      direction: String(s.direction ?? ''),
      intensity: clampIntensity(Number(s.intensity) || 3),
    };
    if (typeof s.id === 'string' && s.id) partial.id = s.id;
    return createTimelineSegment(partial);
  });
}

function executeTool(
  name: string,
  args: Record<string, unknown>,
  pattern: Pattern,
): { result: Record<string, unknown>; patches: AssistantPatch[] } {
  const patches: AssistantPatch[] = [];
  const compositionMode = getCompositionMode(pattern);

  if (name === 'read_pattern') {
    return {
      result: {
        pattern,
        compositionMode,
        transposeHints: describeSongForTranspose(pattern.song),
        suggestedDurationSec: defaultTimelineDuration(pattern),
      },
      patches,
    };
  }

  if (name === 'update_song') {
    const applied: string[] = [];
    if (typeof args.name === 'string' && args.name.trim()) {
      patches.push(soft('name', 'name', args.name.trim(), `Name → ${args.name.trim()}`, pattern.name));
      applied.push('name');
    }
    if (typeof args.genre === 'string') {
      patches.push(
        soft('song.genre', 'song.genre', args.genre, `Genre → ${args.genre}`, pattern.song.genre),
      );
      applied.push('genre');
    }
    if (typeof args.mood === 'string') {
      patches.push(
        soft('song.mood', 'song.mood', args.mood, `Mood → ${args.mood}`, pattern.song.mood),
      );
      applied.push('mood');
    }
    if (typeof args.bpm === 'number') {
      const bpm = clampBpm(args.bpm);
      patches.push(soft('song.bpm', 'song.bpm', bpm, `BPM → ${bpm}`, pattern.song.bpm));
      applied.push('bpm');
    }
    if (typeof args.timeSignature === 'string' && args.timeSignature.trim()) {
      const timeSignature = normalizeTimeSignature(args.timeSignature);
      patches.push(
        soft(
          'song.timeSignature',
          'song.timeSignature',
          timeSignature,
          `Meter → ${timeSignature}`,
          pattern.song.timeSignature,
        ),
      );
      applied.push('timeSignature');
    }
    if (typeof args.key === 'string') {
      patches.push(soft('song.key', 'song.key', args.key, `Key → ${args.key}`, pattern.song.key));
      applied.push('key');
    }
    if (typeof args.energy === 'number') {
      const energy = clampEnergy(args.energy);
      patches.push(
        soft('song.energy', 'song.energy', energy, `Energy → ${energy}`, pattern.song.energy),
      );
      applied.push('energy');
    }
    if (typeof args.language === 'string') {
      const language = normalizeLanguageArg(args.language);
      patches.push(
        soft(
          'song.language',
          'song.language',
          language,
          `Language → ${language}`,
          pattern.song.language,
        ),
      );
      applied.push('language');
    }
    if (typeof args.instrumental === 'boolean') {
      patches.push(
        soft(
          'song.instrumental',
          'song.instrumental',
          args.instrumental,
          args.instrumental ? 'Instrumental on' : 'Vocals enabled',
          pattern.song.instrumental,
        ),
      );
      applied.push('instrumental');
    }
    if (typeof args.durationHint === 'string') {
      patches.push(
        soft(
          'song.durationHint',
          'song.durationHint',
          args.durationHint,
          `Duration hint → ${args.durationHint}`,
          pattern.song.durationHint,
        ),
      );
      applied.push('durationHint');
    }
    if (typeof args.soundscape === 'string') {
      patches.push(
        soft(
          'song.soundscape',
          'song.soundscape',
          args.soundscape,
          `Soundscape → ${args.soundscape}`,
          pattern.song.soundscape,
        ),
      );
      applied.push('soundscape');
    }
    if (typeof args.productionQuality === 'string') {
      patches.push(
        soft(
          'song.productionQuality',
          'song.productionQuality',
          args.productionQuality,
          `Production → ${args.productionQuality}`,
          pattern.song.productionQuality,
        ),
      );
      applied.push('productionQuality');
    }
    return { result: { ok: true, applied }, patches };
  }

  if (name === 'update_slot') {
    const id = typeof args.id === 'string' ? args.id : '';
    if (!isSlotId(id)) {
      return { result: { ok: false, error: `Unknown slot ${id}` }, patches };
    }
    const slot = pattern.slots.find((s) => s.id === id);
    if (!slot) {
      return { result: { ok: false, error: `Missing slot ${id}` }, patches };
    }
    const applied: string[] = [];
    if (typeof args.enabled === 'boolean') {
      patches.push(
        soft('slot.enabled', `slots.${id}.enabled`, args.enabled, `${id} ${args.enabled ? 'on' : 'off'}`, slot.enabled, {
          slotId: id,
        }),
      );
      applied.push('enabled');
    }
    if (typeof args.notes === 'string') {
      patches.push(
        soft('slot.notes', `slots.${id}.notes`, args.notes, `${id} notes updated`, slot.notes, {
          slotId: id,
        }),
      );
      applied.push('notes');
    }
    if (args.knobs && typeof args.knobs === 'object' && !Array.isArray(args.knobs)) {
      for (const [key, value] of Object.entries(args.knobs as Record<string, unknown>)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          continue;
        }
        let next: string | number | boolean = value;
        if (typeof value === 'number') next = Math.max(0, Math.min(100, Math.round(value)));
        patches.push(
          soft('slot.knob', `slots.${id}.knobs.${key}`, next, `${id}.${key} → ${String(next)}`, slot.knobs[key], {
            slotId: id,
            knobKey: key,
          }),
        );
        applied.push(`knob:${key}`);
      }
    }
    return { result: { ok: true, slot: id, applied }, patches };
  }

  if (name === 'update_voice') {
    const vocals = pattern.slots.find((s) => s.id === 'vocals');
    if (!vocals?.voices?.length) {
      return { result: { ok: false, error: 'No vocal voices on pattern' }, patches };
    }
    const voiceId =
      typeof args.voiceId === 'string' && args.voiceId.trim()
        ? args.voiceId.trim()
        : vocals.voices[0]!.id;
    const voice = vocals.voices.find((v) => v.id === voiceId);
    if (!voice) {
      return { result: { ok: false, error: `Unknown voice ${voiceId}` }, patches };
    }
    const next: Record<string, unknown> = {};
    const applied: string[] = [];
    if (typeof args.name === 'string') {
      next.name = args.name;
      applied.push('name');
    }
    if (typeof args.style === 'string') {
      next.style = args.style;
      applied.push('style');
    }
    if (typeof args.gender === 'string') {
      next.gender = args.gender === 'unspecified' ? '' : args.gender;
      applied.push('gender');
    }
    if (typeof args.range === 'string') {
      next.range = args.range;
      applied.push('range');
    }
    if (typeof args.timbre === 'string') {
      next.timbre = args.timbre;
      applied.push('timbre');
    }
    if (typeof args.delivery === 'string') {
      next.delivery = args.delivery;
      applied.push('delivery');
    }
    if (typeof args.presence === 'number') {
      next.presence = Math.max(0, Math.min(100, Math.round(args.presence)));
      applied.push('presence');
    }
    if (typeof args.notes === 'string') {
      next.notes = args.notes;
      applied.push('notes');
    }
    if (!applied.length) {
      return { result: { ok: false, error: 'No voice fields to update' }, patches };
    }
    const previous: Record<string, unknown> = {};
    const voiceRec = voice as unknown as Record<string, unknown>;
    for (const key of applied) {
      previous[key] = voiceRec[key];
    }
    patches.push(
      soft(
        'voice',
        `slots.vocals.voices.${voiceId}`,
        next,
        `Voice ${voice.name}: ${applied.join(', ')}`,
        previous,
        { voiceId, slotId: 'vocals' },
      ),
    );
    return { result: { ok: true, voiceId, applied }, patches };
  }

  if (name === 'set_structure') {
    if (compositionMode === 'timeline') {
      return {
        result: {
          ok: false,
          error:
            'Pattern is in timeline mode — use set_timeline or update_timeline_segment instead of set_structure.',
        },
        patches,
      };
    }
    const structure = Array.isArray(args.structure)
      ? args.structure.map((s) => String(s)).filter(Boolean)
      : [];
    if (!structure.length) {
      return { result: { ok: false, error: 'Empty structure' }, patches };
    }
    patches.push(hard('structure', structure, `Structure → ${structure.join(' → ')}`));
    return { result: { ok: true, pendingConfirm: true, structure }, patches };
  }

  if (name === 'set_composition_mode') {
    const mode = args.mode === 'timeline' ? 'timeline' : args.mode === 'sections' ? 'sections' : null;
    if (!mode) {
      return { result: { ok: false, error: 'mode must be sections or timeline' }, patches };
    }
    patches.push(hard('compositionMode', mode, `Composition → ${mode}`));
    return { result: { ok: true, pendingConfirm: true, mode }, patches };
  }

  if (name === 'set_timeline' || name === 'transpose_to_timeline') {
    const segments = parseSegments(args.segments);
    if (!segments.length) {
      return { result: { ok: false, error: 'Empty timeline segments' }, patches };
    }
    const label =
      name === 'transpose_to_timeline'
        ? `Transpose → timeline (${segments.length} segments)`
        : `Timeline → ${segments.length} segments`;
    patches.push(hard('timeline', segments, label));
    if (typeof args.notes === 'string' && args.notes.trim()) {
      return {
        result: { ok: true, pendingConfirm: true, segmentCount: segments.length, notes: args.notes },
        patches,
      };
    }
    return { result: { ok: true, pendingConfirm: true, segmentCount: segments.length }, patches };
  }

  if (name === 'update_timeline_segment') {
    const id = typeof args.id === 'string' ? args.id : '';
    const list = pattern.song.timeline ?? [];
    const seg = list.find((s) => s.id === id);
    if (!seg) {
      return { result: { ok: false, error: `Unknown segment ${id}` }, patches };
    }
    const next: Partial<TimelineSegment> = {};
    if (typeof args.startSec === 'number') next.startSec = args.startSec;
    if (typeof args.endSec === 'number') next.endSec = args.endSec;
    if (typeof args.label === 'string') next.label = args.label;
    if (typeof args.direction === 'string') next.direction = args.direction;
    if (typeof args.intensity === 'number') next.intensity = clampIntensity(args.intensity);
    if (!Object.keys(next).length) {
      return { result: { ok: false, error: 'No segment fields to update' }, patches };
    }
    patches.push(
      soft(
        'timeline.segment',
        `song.timeline.${id}`,
        next,
        `Segment ${seg.label} updated`,
        { ...seg },
        { segmentId: id },
      ),
    );
    return { result: { ok: true, id, applied: Object.keys(next) }, patches };
  }

  if (name === 'set_lyrics') {
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text.trim()) {
      return { result: { ok: false, error: 'Empty lyrics' }, patches };
    }
    patches.push(hard('lyrics', text, `Lyrics (${text.split('\n').length} lines)`));
    return { result: { ok: true, pendingConfirm: true }, patches };
  }

  if (name === 'set_lyria_mode') {
    const mode = args.mode === 'full' ? 'full' : args.mode === 'clip' ? 'clip' : null;
    if (!mode) {
      return { result: { ok: false, error: 'mode must be clip or full' }, patches };
    }
    patches.push(hard('lyriaMode', mode, `Mode → ${mode}`));
    return { result: { ok: true, pendingConfirm: true, mode }, patches };
  }

  return { result: { ok: false, error: `Unknown tool ${name}` }, patches };
}

function historyToContents(
  history: AssistantTurnInput['history'],
  userMessage: string,
  pattern: Pattern,
): Content[] {
  const contents: Content[] = [];
  for (const turn of history.slice(-16)) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  const modeNote =
    getCompositionMode(pattern) === 'timeline'
      ? '\nNote: compositionMode is timeline — prefer timeline tools.'
      : '\nNote: compositionMode is sections — prefer set_structure unless user asks for a timeline.';
  contents.push({
    role: 'user',
    parts: [
      {
        text: `${userMessage}\n\n---\nCurrent Pattern JSON:\n${JSON.stringify(pattern, null, 2)}${modeNote}`,
      },
    ],
  });
  return contents;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Assistant turn cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

function usageFromResponse(usageMeta: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
} | undefined): { promptTokens?: number; candidatesTokens?: number; totalTokens?: number } | undefined {
  if (!usageMeta) return undefined;
  const usage: { promptTokens?: number; candidatesTokens?: number; totalTokens?: number } = {};
  if (usageMeta.promptTokenCount != null) usage.promptTokens = usageMeta.promptTokenCount;
  if (usageMeta.candidatesTokenCount != null) {
    usage.candidatesTokens = usageMeta.candidatesTokenCount;
  }
  if (usageMeta.totalTokenCount != null) usage.totalTokens = usageMeta.totalTokenCount;
  return Object.keys(usage).length ? usage : undefined;
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const ai = getClient();
  const model = (input.model?.trim() || resolveFlashModel()).trim();
  const patches: AssistantPatch[] = [];
  let costUsd = 0;

  input.onProgress?.('Thinking…');
  throwIfAborted(input.signal);

  const contents = historyToContents(input.history, input.message, input.pattern);

  let finalText = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    throwIfAborted(input.signal);

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.6,
        tools: [{ functionDeclarations: TOOLS }],
      },
    });

    costUsd += estimateFlashCost(usageFromResponse(response.usageMetadata));

    const modelContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls ?? [];

    if (!functionCalls.length) {
      finalText = (response.text ?? '').trim();
      break;
    }

    if (modelContent) {
      contents.push(modelContent);
    } else {
      contents.push({
        role: 'model',
        parts: functionCalls.map((fc) => {
          const part: Part = {
            functionCall: {
              name: fc.name || 'unknown',
              args: fc.args ?? {},
            },
          };
          return part;
        }),
      });
    }

    const responseParts: Part[] = [];
    for (const call of functionCalls) {
      throwIfAborted(input.signal);
      const name = call.name || 'unknown';
      input.onProgress?.(`Ran ${name}`);
      const args: Record<string, unknown> = call.args ?? {};
      const executed = executeTool(name, args, input.pattern);
      patches.push(...executed.patches);
      const functionResponse: Part['functionResponse'] = {
        name,
        response: executed.result,
      };
      if (call.id) functionResponse.id = call.id;
      responseParts.push({ functionResponse });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  if (!finalText) {
    // One more pass without forcing tools if we exhausted steps with only tool calls
    throwIfAborted(input.signal);
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.6,
      },
    });
    costUsd += estimateFlashCost(usageFromResponse(response.usageMetadata));
    finalText = (response.text ?? '').trim();
  }

  if (!finalText) {
    finalText =
      patches.length > 0
        ? 'Updated the pattern from your idea. Fine-tune the knobs or ask for another change.'
        : 'I could not produce a change. Try describing genre, mood, and tempo.';
  }

  return {
    message: finalText,
    patches,
    costUsd: costUsd || 0.001,
    model,
  };
}

export { KeyMissingError };
