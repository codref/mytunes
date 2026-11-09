/** Chat / Flash-class models suitable for the studio assistant + refine paths. */

export interface ChatModelInfo {
  /** API model id without `models/` prefix, e.g. gemini-2.5-flash */
  id: string;
  displayName: string;
  description?: string;
}

export interface ChatModelsCache {
  backend: 'vertex' | 'gemini-api' | null;
  fingerprint: string;
  fetchedAt: string;
  models: ChatModelInfo[];
}

export interface ListChatModelsResult {
  models: ChatModelInfo[];
  cached: boolean;
  fetchedAt: string;
  backend: 'vertex' | 'gemini-api' | null;
}

export const CHAT_MODELS_TTL_MS = 6 * 60 * 60 * 1000;

export function normalizeModelId(raw: string): string {
  return raw.replace(/^models\//, '').trim();
}

export function isChatCapableModel(raw: {
  name?: string | null;
  displayName?: string | null;
  supportedActions?: string[] | null;
}): boolean {
  const id = normalizeModelId(raw.name ?? '');
  if (!id) return false;
  const lower = id.toLowerCase();
  if (!lower.includes('gemini')) return false;
  if (/lyria|imagen|veo|embedding|aqa|tts|robotics|gemma|nano-banana|computer-use/.test(lower)) {
    return false;
  }
  const actions = raw.supportedActions ?? [];
  if (actions.length && !actions.includes('generateContent')) return false;
  return true;
}
