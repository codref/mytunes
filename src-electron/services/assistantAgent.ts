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
  TIME_SIGNATURES,
  type BandSlotId,
  type Pattern,
} from '../../src/models/pattern';
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
- Use update_song / update_slot for soft adjustments (genre, mood, BPM, time signature, key, energy, instruments).
- Use set_structure, set_lyrics, or set_lyria_mode when proposing structure, lyrics, or clip/full mode — these need user confirmation in the UI.
- Pick concrete values (e.g. bpm 118, timeSignature "4/4", energy 70, groove "shuffled"), not vague prose in knobs.
- Never name real artists, bands, or songs in knobs, notes, lyrics, or genre — Lyria blocks those prompts.
- When drafting lyrics, respect the song time signature and BPM (line length / stress); give a clear theme/story; Lyria may adapt wording slightly — keep strong hooks and section tags.
- Prefer Clip mode while iterating; keep lyrics short unless the user asks for a full song.
- Never generate audio or claim you called Lyria. The user owns Generate.
- Keep answers concise (a few sentences). Do not dump full JSON unless asked.
- Current Pattern JSON is provided each turn — ground your changes in it.`;

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
        language: { type: Type.STRING },
        instrumental: { type: Type.BOOLEAN },
        durationHint: { type: Type.STRING, description: 'Hint for full-song mode' },
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
    name: 'set_structure',
    description: 'Propose a full song structure (requires user Apply).',
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

function isSlotId(id: string): id is BandSlotId {
  return (BAND_SLOT_IDS as string[]).includes(id);
}

function executeTool(
  name: string,
  args: Record<string, unknown>,
  pattern: Pattern,
): { result: Record<string, unknown>; patches: AssistantPatch[] } {
  const patches: AssistantPatch[] = [];

  if (name === 'read_pattern') {
    return { result: { pattern }, patches };
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
      patches.push(
        soft(
          'song.language',
          'song.language',
          args.language,
          `Language → ${args.language}`,
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

  if (name === 'set_structure') {
    const structure = Array.isArray(args.structure)
      ? args.structure.map((s) => String(s)).filter(Boolean)
      : [];
    if (!structure.length) {
      return { result: { ok: false, error: 'Empty structure' }, patches };
    }
    patches.push(hard('structure', structure, `Structure → ${structure.join(' → ')}`));
    return { result: { ok: true, pendingConfirm: true, structure }, patches };
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
  contents.push({
    role: 'user',
    parts: [
      {
        text: `${userMessage}\n\n---\nCurrent Pattern JSON:\n${JSON.stringify(pattern, null, 2)}`,
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
  const model = resolveFlashModel();
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
