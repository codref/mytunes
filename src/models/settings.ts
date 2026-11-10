import {
  DEFAULT_LYRIA_CLIP_MODEL,
  DEFAULT_LYRIA_FULL_MODEL_GEMINI_API,
} from './lyriaModels';
import type { LyriaMode } from './pattern';

/** Explicit backend — no Auto. */
export type AiBackendId = 'vertex' | 'gemini-api';

export type AiPurpose = 'assistant' | 'music';

export interface PatternDefaults {
  genre?: string;
  mood?: string;
  bpm?: number;
  timeSignature?: string;
  key?: string;
  energy?: number;
  language?: string;
  lyriaMode?: LyriaMode;
}

/** Persisted on disk (main process only). */
export interface AppSettings {
  /** Flash / assistant / lyrics / refine */
  assistantBackend: AiBackendId;
  /** Lyria clip / full generation */
  musicBackend: AiBackendId;
  apiKey: string | null;
  vertexProject: string | null;
  vertexLocation: string;
  credentialsPath: string | null;
  flashModel: string;
  /** Clip (~30s) Lyria model id */
  lyriaClipModel: string;
  /** Full-song Lyria model id */
  lyriaFullModel: string;
  patternDefaults: PatternDefaults;
}

/** Safe for the renderer — no raw API key. */
export interface AppSettingsPublic {
  assistantBackend: AiBackendId;
  musicBackend: AiBackendId;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  vertexProject: string | null;
  vertexLocation: string;
  credentialsPath: string | null;
  flashModel: string;
  lyriaClipModel: string;
  lyriaFullModel: string;
  patternDefaults: PatternDefaults;
}

/** Partial update from the Settings dialog. */
export interface AppSettingsUpdate {
  assistantBackend?: AiBackendId;
  musicBackend?: AiBackendId;
  /** Set a new key; omit to keep; pass empty string or null to clear. */
  apiKey?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string;
  credentialsPath?: string | null;
  flashModel?: string;
  lyriaClipModel?: string;
  lyriaFullModel?: string;
  patternDefaults?: PatternDefaults;
}

export const DEFAULT_FLASH_MODEL = 'gemini-3.8-flash';

export function createDefaultSettings(): AppSettings {
  return {
    assistantBackend: 'gemini-api',
    musicBackend: 'gemini-api',
    apiKey: null,
    vertexProject: null,
    vertexLocation: 'global',
    credentialsPath: null,
    flashModel: DEFAULT_FLASH_MODEL,
    lyriaClipModel: DEFAULT_LYRIA_CLIP_MODEL,
    lyriaFullModel: DEFAULT_LYRIA_FULL_MODEL_GEMINI_API,
    patternDefaults: {},
  };
}

/** Migrate legacy `backendPreference` into purpose backends. */
export function migrateSettingsRaw(raw: Record<string, unknown>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...(raw as Partial<AppSettings>) };
  const legacy = raw.backendPreference;
  if (
    (out.assistantBackend == null || out.musicBackend == null) &&
    (legacy === 'auto' || legacy === 'vertex' || legacy === 'gemini-api')
  ) {
    const hasProject = Boolean(
      (typeof raw.vertexProject === 'string' && raw.vertexProject.trim()) ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        process.env.GCLOUD_PROJECT?.trim(),
    );
    const pick: AiBackendId =
      legacy === 'vertex'
        ? 'vertex'
        : legacy === 'gemini-api'
          ? 'gemini-api'
          : hasProject
            ? 'vertex'
            : 'gemini-api';
    if (out.assistantBackend == null) out.assistantBackend = pick;
    if (out.musicBackend == null) out.musicBackend = pick;
  }
  return out;
}
