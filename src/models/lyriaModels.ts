import { COST_CLIP_USD, COST_FULL_USD } from './budget';
import { normalizeModelId } from './chatModels';
import type { LyriaMode } from './pattern';

export interface LyriaModelInfo {
  /** API model id without `models/` prefix */
  id: string;
  displayName: string;
  description?: string;
  kind: LyriaMode;
  /** Rough per-request USD estimate */
  costUsd: number;
}

export interface LyriaModelsCache {
  backend: 'vertex' | 'gemini-api' | null;
  fingerprint: string;
  fetchedAt: string;
  models: LyriaModelInfo[];
}

export interface ListLyriaModelsResult {
  models: LyriaModelInfo[];
  cached: boolean;
  fetchedAt: string;
  backend: 'vertex' | 'gemini-api' | null;
}

export const LYRIA_MODELS_TTL_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_LYRIA_CLIP_MODEL = 'lyria-3-clip-preview';
export const DEFAULT_LYRIA_FULL_MODEL_VERTEX = 'lyria-3-pro-preview';
export const DEFAULT_LYRIA_FULL_MODEL_GEMINI_API = 'lyria-3.5';

export function defaultLyriaFullModel(backend: 'vertex' | 'gemini-api' | null): string {
  return backend === 'gemini-api'
    ? DEFAULT_LYRIA_FULL_MODEL_GEMINI_API
    : DEFAULT_LYRIA_FULL_MODEL_VERTEX;
}

export function classifyLyriaModel(id: string): LyriaMode | null {
  const lower = normalizeModelId(id).toLowerCase();
  if (!lower.includes('lyria')) return null;
  if (/realtime|bidi/.test(lower)) return null;
  if (lower.includes('clip')) return 'clip';
  return 'full';
}

export function isLyriaGenerateModel(raw: {
  name?: string | null;
  supportedActions?: string[] | null;
}): boolean {
  const id = normalizeModelId(raw.name ?? '');
  if (!classifyLyriaModel(id)) return false;
  const actions = raw.supportedActions ?? [];
  // Vertex list payloads sometimes omit actions; Gemini API includes generateContent.
  if (actions.length && !actions.includes('generateContent')) return false;
  return true;
}

export function toLyriaModelInfo(raw: {
  name?: string | null;
  displayName?: string | null;
  description?: string | null;
}): LyriaModelInfo | null {
  const id = normalizeModelId(raw.name ?? '');
  const kind = classifyLyriaModel(id);
  if (!kind) return null;
  const info: LyriaModelInfo = {
    id,
    displayName: String(raw.displayName || id),
    kind,
    costUsd: kind === 'clip' ? COST_CLIP_USD : COST_FULL_USD,
  };
  if (raw.description) {
    info.description = String(raw.description).slice(0, 160);
  }
  return info;
}

export function fallbackLyriaModels(
  backend: 'vertex' | 'gemini-api' | null,
): LyriaModelInfo[] {
  return [
    {
      id: DEFAULT_LYRIA_CLIP_MODEL,
      displayName: 'Lyria 3 Clip Preview',
      description: '30s clip',
      kind: 'clip',
      costUsd: COST_CLIP_USD,
    },
    {
      id: defaultLyriaFullModel(backend),
      displayName: backend === 'gemini-api' ? 'Lyria 3.5' : 'Lyria 3 Pro Preview',
      description: 'Full-length song',
      kind: 'full',
      costUsd: COST_FULL_USD,
    },
  ];
}
