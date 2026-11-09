import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { GoogleGenAI } from '@google/genai';
import {
  CHAT_MODELS_TTL_MS,
  isChatCapableModel,
  normalizeModelId,
  type ChatModelInfo,
  type ChatModelsCache,
  type ListChatModelsResult,
} from '../../src/models/chatModels';
import { DEFAULT_FLASH_MODEL } from '../../src/models/settings';
import { getGoogleApiKey } from './env';
import { getActiveBackend, getClient, KeyMissingError } from './geminiClient';
import { loadSettings } from './settingsStore';

function cachePath(): string {
  return path.join(app.getPath('userData'), 'chat-models-cache.json');
}

function fingerprint(): string {
  const cfg = getActiveBackend();
  if (!cfg) return 'none';
  return [cfg.backend, cfg.project ?? '', cfg.location ?? '', cfg.apiKey ? 'key' : ''].join('|');
}

function readCache(): ChatModelsCache | null {
  try {
    const file = cachePath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ChatModelsCache;
  } catch {
    return null;
  }
}

function writeCache(cache: ChatModelsCache): void {
  fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 2), 'utf8');
}

function fallbackModels(): ChatModelInfo[] {
  // Used only when models.list fails — keep current Flash/Pro ids here.
  return [
    { id: DEFAULT_FLASH_MODEL, displayName: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  ];
}

async function collectFromClient(ai: GoogleGenAI): Promise<ChatModelInfo[]> {
  const pager = await ai.models.list({ config: { queryBase: true } });
  const seen = new Set<string>();
  const out: ChatModelInfo[] = [];

  let page = pager.page ?? [];
  for (;;) {
    for (const model of page) {
      if (!isChatCapableModel(model)) continue;
      const id = normalizeModelId(String(model.name ?? ''));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const info: ChatModelInfo = {
        id,
        displayName: String(model.displayName || id),
      };
      if (model.description) {
        info.description = String(model.description).slice(0, 160);
      }
      out.push(info);
    }
    if (!pager.hasNextPage()) break;
    page = await pager.nextPage();
    if (!page.length) break;
  }

  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

function resolveApiKey(): string | null {
  try {
    const fromSettings = loadSettings().apiKey?.trim();
    if (fromSettings) return fromSettings;
  } catch {
    /* ignore */
  }
  return getGoogleApiKey();
}

async function fetchFromApi(): Promise<ChatModelInfo[]> {
  const primary = getClient();
  try {
    const models = await collectFromClient(primary);
    if (models.length) return models;
  } catch (e) {
    const cfg = getActiveBackend();
    const apiKey = resolveApiKey();
    // Vertex ADC often 403s on models.list without quota project; fall back to Gemini API list.
    if (cfg?.backend === 'vertex' && apiKey) {
      console.warn(
        '[mytunes] Vertex models.list failed; retrying via Gemini Developer API key',
        e,
      );
      const gemini = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 60_000 },
      });
      const models = await collectFromClient(gemini);
      if (models.length) return models;
    }
    throw e;
  }
  return fallbackModels();
}

export async function listChatModels(opts?: {
  force?: boolean;
}): Promise<ListChatModelsResult> {
  const fp = fingerprint();
  const cfg = getActiveBackend();
  const backend = cfg?.backend ?? null;
  const cached = readCache();
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const usable =
    cached &&
    cached.fingerprint === fp &&
    Array.isArray(cached.models) &&
    cached.models.length > 0 &&
    age < CHAT_MODELS_TTL_MS;

  if (!opts?.force && usable && cached) {
    return {
      models: cached.models,
      cached: true,
      fetchedAt: cached.fetchedAt,
      backend: cached.backend,
    };
  }

  try {
    const models = await fetchFromApi();
    const fetchedAt = new Date().toISOString();
    writeCache({ backend, fingerprint: fp, fetchedAt, models });
    return { models, cached: false, fetchedAt, backend };
  } catch (e) {
    if (usable && cached) {
      return {
        models: cached.models,
        cached: true,
        fetchedAt: cached.fetchedAt,
        backend: cached.backend,
      };
    }
    if (e instanceof KeyMissingError) throw e;
    console.warn('[mytunes] listChatModels API failed; using fallback list', e);
    const fetchedAt = new Date().toISOString();
    const models = fallbackModels();
    return { models, cached: false, fetchedAt, backend };
  }
}
