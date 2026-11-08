import type { LyriaMode } from './pattern';

export type BackendPreference = 'auto' | 'vertex' | 'gemini-api';

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
  backendPreference: BackendPreference;
  apiKey: string | null;
  vertexProject: string | null;
  vertexLocation: string;
  credentialsPath: string | null;
  flashModel: string;
  patternDefaults: PatternDefaults;
}

/** Safe for the renderer — no raw API key. */
export interface AppSettingsPublic {
  backendPreference: BackendPreference;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  vertexProject: string | null;
  vertexLocation: string;
  credentialsPath: string | null;
  flashModel: string;
  patternDefaults: PatternDefaults;
}

/** Partial update from the Settings dialog. */
export interface AppSettingsUpdate {
  backendPreference?: BackendPreference;
  /** Set a new key; omit to keep; pass empty string or null to clear. */
  apiKey?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string;
  credentialsPath?: string | null;
  flashModel?: string;
  patternDefaults?: PatternDefaults;
}

export const DEFAULT_FLASH_MODEL = 'gemini-3.5-flash-lite';

export function createDefaultSettings(): AppSettings {
  return {
    backendPreference: 'auto',
    apiKey: null,
    vertexProject: null,
    vertexLocation: 'global',
    credentialsPath: null,
    flashModel: DEFAULT_FLASH_MODEL,
    patternDefaults: {},
  };
}
