import { GoogleGenAI } from '@google/genai';
import { extractCaptionCues, type CaptionCue } from '../../src/models/captionCues';
import { scoreLyricOverlap } from '../../src/models/compilePrompt';
import {
  parseLyriaTranscript,
  parseTranscriptFlashJson,
  shouldUseFlashTranscriptParse,
} from '../../src/models/lyriaTranscript';
import { DEFAULT_FLASH_MODEL } from '../../src/models/settings';
import { resolveAiBackend, type AiBackend, type AiBackendConfig } from './env';
import { getFlashModel } from './settingsStore';

/** Flash for lyrics / prompt refine (both backends). Vertex: use global location. */
export const FLASH_MODEL = DEFAULT_FLASH_MODEL;

/** Vertex + Developer API share Clip id. */
export const LYRIA_CLIP_MODEL = 'lyria-3-clip-preview';

/** Full song: Vertex uses Pro Preview; Gemini Developer API uses Lyria 3.5. */
export const LYRIA_FULL_MODEL_VERTEX = 'lyria-3-pro-preview';
export const LYRIA_FULL_MODEL_GEMINI_API = 'lyria-3.5';

export class KeyMissingError extends Error {
  code = 'KEY_MISSING' as const;
  constructor() {
    super(
      'No Google AI backend configured. Open Settings to add a Gemini API key or Vertex project, or set credentials in .env.local.',
    );
    this.name = 'KeyMissingError';
  }
}

let client: GoogleGenAI | null = null;
let clientBackend: AiBackend | null = null;
let clientFingerprint: string | null = null;
let activeConfig: AiBackendConfig | null = null;

function backendFingerprint(cfg: AiBackendConfig): string {
  return [
    cfg.backend,
    cfg.project ?? '',
    cfg.location ?? '',
    cfg.apiKey ?? '',
    cfg.credentialsPath ?? '',
  ].join('|');
}

export function getActiveBackend(): AiBackendConfig | null {
  return activeConfig ?? resolveAiBackend();
}

/** Drop cached client after Settings change. */
export function resetAiClient(): void {
  client = null;
  clientBackend = null;
  clientFingerprint = null;
  activeConfig = null;
}

export function resolveFlashModel(): string {
  try {
    return getFlashModel() || FLASH_MODEL;
  } catch {
    return FLASH_MODEL;
  }
}

export function getClient(): GoogleGenAI {
  const cfg = resolveAiBackend();
  if (!cfg) {
    throw new KeyMissingError();
  }

  const fingerprint = backendFingerprint(cfg);
  if (client && clientBackend === cfg.backend && clientFingerprint === fingerprint) {
    return client;
  }

  activeConfig = cfg;
  clientBackend = cfg.backend;
  clientFingerprint = fingerprint;

  if (cfg.backend === 'vertex') {
    if (!cfg.project) throw new KeyMissingError();
    // User ADC often needs an explicit quota project for aiplatform.googleapis.com.
    if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim()) {
      process.env.GOOGLE_CLOUD_QUOTA_PROJECT = cfg.project;
    }
    if (!process.env.GCLOUD_PROJECT?.trim()) {
      process.env.GCLOUD_PROJECT = cfg.project;
    }
    if (!process.env.GOOGLE_CLOUD_PROJECT?.trim()) {
      process.env.GOOGLE_CLOUD_PROJECT = cfg.project;
    }
    client = new GoogleGenAI({
      vertexai: true,
      project: cfg.project,
      location: cfg.location || 'global',
      httpOptions: { timeout: 600_000 },
      ...(cfg.credentialsPath
        ? {
            googleAuthOptions: {
              keyFile: cfg.credentialsPath,
            },
          }
        : {}),
    });
  } else {
    if (!cfg.apiKey) throw new KeyMissingError();
    client = new GoogleGenAI({
      apiKey: cfg.apiKey,
      httpOptions: { timeout: 600_000 },
    });
  }

  return client;
}

export function lyriaFullModelFor(backend: AiBackend): string {
  return backend === 'vertex' ? LYRIA_FULL_MODEL_VERTEX : LYRIA_FULL_MODEL_GEMINI_API;
}

export interface FlashResult {
  text: string;
  costUsd: number;
  model: string;
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

/** Very rough Flash pricing fallback when usage present */
function estimateFlashCost(usage?: FlashResult['usage']): number {
  if (!usage) return 0.001;
  const inTok = usage.promptTokens ?? 0;
  const outTok = usage.candidatesTokens ?? 0;
  return (inTok / 1_000_000) * 0.1 + (outTok / 1_000_000) * 0.4;
}

export async function flashGenerate(
  prompt: string,
  systemInstruction?: string,
  opts?: { temperature?: number },
): Promise<FlashResult> {
  const ai = getClient();
  const model = resolveFlashModel();
  const temperature = opts?.temperature ?? 0.7;
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: systemInstruction
      ? {
          systemInstruction,
          temperature,
        }
      : { temperature },
  });

  const text = response.text ?? '';
  const usageMeta = response.usageMetadata;
  const usage: FlashResult['usage'] = {};
  if (usageMeta?.promptTokenCount != null) usage.promptTokens = usageMeta.promptTokenCount;
  if (usageMeta?.candidatesTokenCount != null) {
    usage.candidatesTokens = usageMeta.candidatesTokenCount;
  }
  if (usageMeta?.totalTokenCount != null) usage.totalTokens = usageMeta.totalTokenCount;
  const hasUsage = Object.keys(usage).length > 0;

  return {
    text,
    costUsd: estimateFlashCost(hasUsage ? usage : undefined),
    model,
    ...(hasUsage ? { usage } : {}),
  };
}

export { estimateFlashCost };

export interface LyriaResult {
  audioBase64: string;
  mimeType: string;
  /** Sung lyrics only (timestamps / arrangement prose stripped). */
  lyricsText: string;
  /** Segment / production commentary Lyria appended after the lyric captions. */
  arrangementNotes: string;
  /** Timed lyric cues parsed from raw Lyria text (before stripping). */
  captionCues?: CaptionCue[];
  /** Raw Lyria text parts (for cue extraction / debug). */
  rawText?: string;
  model: string;
  costUsd: number;
  backend: AiBackend;
  lyricsMatchScore?: number;
  lyricsMismatch?: boolean;
  /** Extra Flash cost for transcript split (billed separately in the ledger). */
  flashParseCostUsd?: number;
  flashParseModel?: string;
}

const TRANSCRIPT_SPLIT_SYSTEM = `You split Lyria model output into two fields.
Return ONLY JSON: {"lyrics":"...","arrangementNotes":"..."}.
lyrics = sung/spoken words only (keep section tags like [Verse]/[Chorus] if present; drop timestamps like [0.0:], [:], [0.0:5.8], and [[A0]] markers).
arrangementNotes = production/segment commentary, Caption blobs, Mosic/BPM metadata summaries, and any prose describing instruments/atmosphere — not sung lines.
Do not invent lyrics. If there is no commentary, arrangementNotes may be "".`;

/**
 * Prefer Flash to separate lyric captions from arrangement prose; fall back to heuristics.
 */
export async function splitLyriaTranscriptWithFlash(raw: string): Promise<{
  lyrics: string;
  arrangementNotes: string;
  costUsd: number;
  model: string;
  usedFlash: boolean;
}> {
  const heuristic = parseLyriaTranscript(raw);
  if (!raw.trim() || !shouldUseFlashTranscriptParse(raw)) {
    return { ...heuristic, costUsd: 0, model: '', usedFlash: false };
  }

  const clipped = raw.length > 14000 ? `${raw.slice(0, 14000)}\n…` : raw;
  try {
    const result = await flashGenerate(
      `Split this Lyria return text into sung lyrics vs arrangement commentary.\n\n${clipped}`,
      TRANSCRIPT_SPLIT_SYSTEM,
      { temperature: 0.1 },
    );
    const parsed = parseTranscriptFlashJson(result.text);
    if (parsed && (parsed.lyrics || parsed.arrangementNotes)) {
      // Prefer Flash lyrics when non-empty; keep heuristic notes if Flash omitted them.
      return {
        lyrics: parsed.lyrics || heuristic.lyrics,
        arrangementNotes: parsed.arrangementNotes || heuristic.arrangementNotes,
        costUsd: result.costUsd,
        model: result.model,
        usedFlash: true,
      };
    }
  } catch {
    /* budget / network — keep heuristic */
  }
  return { ...heuristic, costUsd: 0, model: '', usedFlash: false };
}

type LyriaPart = {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
};

type LyriaGenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: LyriaPart[] };
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  parts?: LyriaPart[];
};

/**
 * Vertex Interactions often returns empty steps for Lyria; generateContent
 * returns audio as inlineData (audio/mpeg) plus text captions/lyrics.
 * Lyria also intermittently returns a 200 with no audio — retry once when unblocked.
 */
function collectParts(response: LyriaGenerateResponse): LyriaPart[] {
  const fromCandidate = response.candidates?.[0]?.content?.parts ?? [];
  if (fromCandidate.length) return fromCandidate;
  return response.parts ?? [];
}

function extractFromGenerateContent(response: LyriaGenerateResponse): {
  audioBase64: string;
  mimeType: string;
  lyricsText: string;
  arrangementNotes: string;
  rawText: string;
} {
  const lyricsParts: string[] = [];
  let audioBase64 = '';
  let mimeType = 'audio/mp3';

  for (const part of collectParts(response)) {
    const data = part.inlineData?.data;
    if (data) {
      audioBase64 = data;
      if (part.inlineData?.mimeType) mimeType = part.inlineData.mimeType;
    } else if (part.text) {
      lyricsParts.push(part.text);
    }
  }

  const rawText = lyricsParts.join('\n').trim();
  const parsed = parseLyriaTranscript(rawText);
  return {
    audioBase64,
    mimeType,
    lyricsText: parsed.lyrics,
    arrangementNotes: parsed.arrangementNotes,
    rawText,
  };
}

function describeEmptyLyria(response: LyriaGenerateResponse, lyricsText: string): string {
  const block = response.promptFeedback?.blockReason;
  const blockMsg = response.promptFeedback?.blockReasonMessage;
  const finish = response.candidates?.[0]?.finishReason;
  const bits: string[] = [];
  if (block) bits.push(`blockReason=${block}`);
  if (blockMsg) bits.push(blockMsg);
  if (finish) bits.push(`finishReason=${finish}`);
  if (lyricsText) bits.push(`text=${lyricsText.slice(0, 180)}`);
  if (!bits.length) bits.push('empty response (no candidates / no inline audio)');
  return bits.join(' · ');
}

function isHardBlock(response: LyriaGenerateResponse): boolean {
  const block = (response.promptFeedback?.blockReason ?? '').toUpperCase();
  if (block && block !== 'BLOCK_REASON_UNSPECIFIED') return true;
  const finish = (response.candidates?.[0]?.finishReason ?? '').toUpperCase();
  return (
    finish.includes('SAFETY') ||
    finish.includes('BLOCK') ||
    finish.includes('PROHIBITED') ||
    finish.includes('RECITATION')
  );
}

function extractLyricsBlock(prompt: string): { music: string; lyrics: string | null } {
  const idx = prompt.search(/(?:^|\n)Lyrics:\s*\n/i);
  if (idx < 0) return { music: prompt.trim(), lyrics: null };
  const after = prompt.slice(idx).replace(/^[\s\S]*?Lyrics:\s*\n/i, '');
  const musicBreak = after.search(/\nMusical direction:\s*\n/i);
  const lyrics = (musicBreak >= 0 ? after.slice(0, musicBreak) : after).trim();
  const before = prompt.slice(0, idx).trim();
  const afterMusic =
    musicBreak >= 0
      ? after.slice(musicBreak).replace(/^\nMusical direction:\s*\n/i, '').trim()
      : '';
  const music = [
    before
      .replace(/Use these exact lyrics[\s\S]*?:/i, '')
      .replace(/Source lyrics[\s\S]*?:/i, '')
      .trim(),
    afterMusic,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
  return { music, lyrics: lyrics || null };
}

function rebuildLyricsFirst(music: string, lyrics: string, mode: 'clip' | 'full'): string {
  let lyricBody = lyrics;
  const maxLines = mode === 'clip' ? 40 : 120;
  lyricBody = lyricBody.split('\n').slice(0, maxLines).join('\n');
  let musicBody = music
    .split('\n')
    .filter((line) => {
      const lower = line.toLowerCase();
      return !(lower.includes('copyright') || lower.includes('do not imitate'));
    })
    .join('\n')
    .trim();
  const musicMax = mode === 'clip' ? 700 : 1200;
  if (musicBody.length > musicMax) musicBody = musicBody.slice(0, musicMax).trim();
  return [
    'Song context: follow the source lyrics story and section structure.',
    'Vocal writing: adapt wording only slightly for singability or safety; keep refrains, imagery, and meaning. Do not invent an unrelated lyric sheet.',
    'Source lyrics (adapt minimally if needed):',
    'Lyrics:',
    lyricBody,
    '',
    'Musical direction:',
    musicBody ||
      (mode === 'clip' ? 'Short original song, clear vocals.' : 'Original full song, clear vocals.'),
  ].join('\n');
}

/**
 * Soften prompts; always keep Lyrics: and prefer lyrics-first layout.
 */
export function sanitizeLyriaPrompt(prompt: string, mode: 'clip' | 'full'): string {
  let text = prompt.replace(/\r\n/g, '\n').trim();
  text = text.replace(
    /\b(in the style of|sounds like|inspired by|cover of|remake of)\s+[A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,4}/g,
    'original style',
  );
  const { music, lyrics } = extractLyricsBlock(text);
  if (!lyrics) {
    const maxChars = mode === 'clip' ? 1800 : 4000;
    return text.length > maxChars ? `${text.slice(0, maxChars).trim()}\n…` : text;
  }
  return rebuildLyricsFirst(music, lyrics, mode);
}

/** Shorter music direction, same lyrics, lyrics-first. */
export function simplifyLyriaPrompt(prompt: string, mode: 'clip' | 'full'): string {
  const { music, lyrics } = extractLyricsBlock(sanitizeLyriaPrompt(prompt, mode));
  if (!lyrics) {
    return mode === 'clip'
      ? 'A short original song with clear melody and groove.'
      : 'Create an original 2-minute song with intro, verse, chorus, and outro.';
  }
  const keep: string[] = [];
  for (const line of music.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const lower = line.toLowerCase();
    if (
      /\b(bpm|genre|mood|key:|tempo|vocals|language:|instrument|structure:|arrangement|energy|assign sung|ensemble notes|vocal notes|soundscape|production|timed structure|intensity)/i.test(
        lower,
      ) ||
      /^\[\d+:\d+/.test(line) ||
      /^-\s+\w/.test(line) ||
      lower.startsWith('create') ||
      (mode === 'full' && /minute|duration|length/.test(lower))
    ) {
      keep.push(line);
    }
    if (keep.length >= 12) break;
  }
  return rebuildLyricsFirst(keep.join('\n'), lyrics, mode);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function attachLyricFidelity(
  result: LyriaResult,
  userLyrics: string | null,
): LyriaResult {
  if (!userLyrics?.trim()) return result;
  const score = scoreLyricOverlap(userLyrics, result.lyricsText || '');
  result.lyricsMatchScore = score;
  // Severe drift only — light paraphrase is expected with "adapt minimally".
  result.lyricsMismatch = score < 0.08;
  return result;
}

export async function generateLyriaMusic(
  compiledPrompt: string,
  mode: 'clip' | 'full',
): Promise<LyriaResult> {
  const ai = getClient();
  const cfg = getActiveBackend();
  if (!cfg) throw new KeyMissingError();

  const model = mode === 'clip' ? LYRIA_CLIP_MODEL : lyriaFullModelFor(cfg.backend);
  const userLyrics = extractLyricsBlock(compiledPrompt).lyrics;
  const hadLyrics = Boolean(userLyrics);
  const prompts = [
    sanitizeLyriaPrompt(compiledPrompt, mode),
    simplifyLyriaPrompt(compiledPrompt, mode),
  ];
  const uniquePrompts = [...new Set(prompts.filter(Boolean))];

  let lastDetail = '';
  let blockedWithLyrics = false;
  let bestMismatch: LyriaResult | null = null;

  for (let i = 0; i < uniquePrompts.length; i++) {
    const contents = uniquePrompts[i]!;
    const response = (await ai.models.generateContent({
      model,
      contents,
      config: {
        responseModalities: ['AUDIO', 'TEXT'],
      },
    })) as LyriaGenerateResponse;

    const extracted = extractFromGenerateContent(response);
    const { audioBase64, mimeType, rawText } = extracted;
    if (audioBase64) {
      let lyricsText = extracted.lyricsText;
      let arrangementNotes = extracted.arrangementNotes;
      const captionCues = rawText ? extractCaptionCues(rawText) : [];
      const base: LyriaResult = {
        audioBase64,
        mimeType,
        lyricsText,
        arrangementNotes,
        model,
        costUsd: mode === 'clip' ? 0.04 : 0.08,
        backend: cfg.backend,
        ...(rawText ? { rawText } : {}),
        ...(captionCues.length ? { captionCues } : {}),
      };
      if (rawText && shouldUseFlashTranscriptParse(rawText)) {
        const split = await splitLyriaTranscriptWithFlash(rawText);
        base.lyricsText = split.lyrics;
        base.arrangementNotes = split.arrangementNotes;
        if (split.usedFlash && split.costUsd > 0) {
          base.flashParseCostUsd = split.costUsd;
          if (split.model) base.flashParseModel = split.model;
        }
      }
      const result = attachLyricFidelity(base, userLyrics);
      // If lyrics clearly don't match, try one more lyrics-first simplify before accepting.
      if (result.lyricsMismatch && i < uniquePrompts.length - 1) {
        bestMismatch = result;
        continue;
      }
      return result;
    }

    lastDetail = describeEmptyLyria(response, rawText || extracted.lyricsText);
    if (isHardBlock(response) && hadLyrics) {
      blockedWithLyrics = true;
    }

    if (!isHardBlock(response) && i < uniquePrompts.length - 1) {
      await sleep(800);
      continue;
    }
    if (isHardBlock(response) && i < uniquePrompts.length - 1) {
      continue;
    }
  }

  if (bestMismatch) {
    return bestMismatch;
  }

  if (blockedWithLyrics) {
    throw new Error(
      `Lyria blocked this lyric sheet (${lastDetail}). Soften violent/political lines or famous rhymes, keep long stage directions out of the Lyrics tab, then retry.`,
    );
  }

  const blockHint = /blockReason=OTHER/i.test(lastDetail)
    ? ' Google blocked this prompt for an unspecified reason (OTHER). Shorten the Prompt tab and avoid real artist/song names.'
    : ' Shorten the Prompt tab, remove real artist/song names, or switch to Clip.';

  throw new Error(`Lyria returned no audio. ${lastDetail}.${blockHint}`);
}

export const LYRIA_SYSTEM_FOR_FLASH = `You help craft prompts for Google Lyria music generation.
Rules:
- Include a short Song context / theme (mood, genre, story).
- Prefer lyrics-first: Song context, then Lyrics:, then Musical direction.
- Keep any source Lyrics: block; allow the model to adapt wording slightly for singability/safety while keeping story, structure, and refrains.
- Use section tags like [Intro] -> [Verse 1] -> [Chorus] when composition is section-based.
- When timed structure blocks like [0:00 - 0:12] Label: … Intensity: N/10 are present, keep them authoritative — do not collapse them into a flat Structure line.
- Say "Instrumental only, no vocals." when instrumental.
- Preserve Soundscape: and Production: lines when present.
- Describe style with genre adjectives only — never name real artists, bands, or songs.
- Keep prompts concise. Return ONLY the final Lyria prompt text, no markdown fences.`;
