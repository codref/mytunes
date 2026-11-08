import { GoogleGenAI } from '@google/genai';
import { resolveAiBackend, type AiBackend, type AiBackendConfig } from './env';

/** Flash for lyrics / prompt refine (both backends). Vertex: use global location. */
export const FLASH_MODEL = 'gemini-3.5-flash-lite';

/** Vertex + Developer API share Clip id. */
export const LYRIA_CLIP_MODEL = 'lyria-3-clip-preview';

/** Full song: Vertex uses Pro Preview; Gemini Developer API uses Lyria 3.5. */
export const LYRIA_FULL_MODEL_VERTEX = 'lyria-3-pro-preview';
export const LYRIA_FULL_MODEL_GEMINI_API = 'lyria-3.5';

export class KeyMissingError extends Error {
  code = 'KEY_MISSING' as const;
  constructor() {
    super(
      'No Google AI backend configured. Set GOOGLE_CLOUD_PROJECT for Vertex, or GOOGLE_API_KEY for Gemini Developer API, in .env.local.',
    );
    this.name = 'KeyMissingError';
  }
}

let client: GoogleGenAI | null = null;
let clientBackend: AiBackend | null = null;
let activeConfig: AiBackendConfig | null = null;

export function getActiveBackend(): AiBackendConfig | null {
  return activeConfig ?? resolveAiBackend();
}

export function getClient(): GoogleGenAI {
  const cfg = resolveAiBackend();
  if (!cfg) {
    throw new KeyMissingError();
  }

  if (client && clientBackend === cfg.backend) {
    return client;
  }

  activeConfig = cfg;
  clientBackend = cfg.backend;

  if (cfg.backend === 'vertex') {
    if (!cfg.project) throw new KeyMissingError();
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

export async function flashGenerate(prompt: string, systemInstruction?: string): Promise<FlashResult> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents: prompt,
    config: systemInstruction
      ? {
          systemInstruction,
          temperature: 0.7,
        }
      : { temperature: 0.7 },
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
    model: FLASH_MODEL,
    ...(hasUsage ? { usage } : {}),
  };
}

export interface LyriaResult {
  audioBase64: string;
  mimeType: string;
  lyricsText: string;
  model: string;
  costUsd: number;
  backend: AiBackend;
}

/**
 * Vertex Interactions often returns empty steps for Lyria; generateContent
 * returns audio as inlineData (audio/mpeg) plus text captions/lyrics.
 */
function extractFromGenerateContent(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
}): { audioBase64: string; mimeType: string; lyricsText: string } {
  const lyricsParts: string[] = [];
  let audioBase64 = '';
  let mimeType = 'audio/mp3';

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      audioBase64 = part.inlineData.data;
      if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
    } else if (part.text) {
      lyricsParts.push(part.text);
    }
  }

  return {
    audioBase64,
    mimeType,
    lyricsText: lyricsParts.join('\n').trim(),
  };
}

export async function generateLyriaMusic(
  compiledPrompt: string,
  mode: 'clip' | 'full',
): Promise<LyriaResult> {
  const ai = getClient();
  const cfg = getActiveBackend();
  if (!cfg) throw new KeyMissingError();

  const model = mode === 'clip' ? LYRIA_CLIP_MODEL : lyriaFullModelFor(cfg.backend);

  const response = await ai.models.generateContent({
    model,
    contents: compiledPrompt,
    config: {
      responseModalities: ['AUDIO', 'TEXT'],
    },
  });

  const { audioBase64, mimeType, lyricsText } = extractFromGenerateContent(response);

  if (!audioBase64) {
    throw new Error('Lyria returned no audio. The prompt may have been blocked by safety filters.');
  }

  return {
    audioBase64,
    mimeType,
    lyricsText,
    model,
    costUsd: mode === 'clip' ? 0.04 : 0.08,
    backend: cfg.backend,
  };
}

export const LYRIA_SYSTEM_FOR_FLASH = `You help craft prompts for Google Lyria music generation.
Rules:
- Musical direction first (genre, mood, BPM, key, instruments, vocals, structure).
- Use section tags like [Intro] -> [Verse 1] -> [Chorus].
- Put user lyrics under a Lyrics: heading with [Verse]/[Chorus]/[Bridge] tags.
- Say "Instrumental only, no vocals." when instrumental.
- Never request named artist voices or copyrighted lyrics.
- Return ONLY the final Lyria prompt text, no markdown fences.`;
