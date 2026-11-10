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
import {
  fallbackLyriaModels,
  isLyriaGenerateModel,
  LYRIA_MODELS_TTL_MS,
  toLyriaModelInfo,
  type ListLyriaModelsResult,
  type LyriaModelInfo,
  type LyriaModelsCache,
} from '../../src/models/lyriaModels';
import { DEFAULT_FLASH_MODEL, type AiPurpose } from '../../src/models/settings';
import { getGoogleApiKey } from './env';
import { getActiveBackend, getClient, KeyMissingError } from './geminiClient';
import { loadSettings } from './settingsStore';

function chatCachePath(): string {
  return path.join(app.getPath('userData'), 'chat-models-cache.json');
}

function lyriaCachePath(): string {
  return path.join(app.getPath('userData'), 'lyria-models-cache.json');
}

function fingerprint(purpose: AiPurpose): string {
  const cfg = getActiveBackend(purpose);
  if (!cfg) return `none:${purpose}`;
  return [purpose, cfg.backend, cfg.project ?? '', cfg.location ?? '', cfg.apiKey ? 'key' : ''].join(
    '|',
  );
}

function readJsonCache<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonCache(file: string, cache: unknown): void {
  fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8');
}

function fallbackChatModels(): ChatModelInfo[] {
  return [
    { id: DEFAULT_FLASH_MODEL, displayName: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  ];
}

type ModelPageItem = {
  name?: string | null;
  displayName?: string | null;
  description?: string | null;
  supportedActions?: string[] | null;
};

async function iterateModels(
  ai: GoogleGenAI,
  visit: (model: ModelPageItem) => void,
): Promise<void> {
  const pager = await ai.models.list({ config: { queryBase: true } });
  let page = pager.page ?? [];
  for (;;) {
    for (const model of page) {
      visit(model as ModelPageItem);
    }
    if (!pager.hasNextPage()) break;
    page = await pager.nextPage();
    if (!page.length) break;
  }
}

async function collectChatFromClient(ai: GoogleGenAI): Promise<ChatModelInfo[]> {
  const seen = new Set<string>();
  const out: ChatModelInfo[] = [];
  await iterateModels(ai, (model) => {
    if (!isChatCapableModel(model)) return;
    const id = normalizeModelId(String(model.name ?? ''));
    if (!id || seen.has(id)) return;
    seen.add(id);
    const info: ChatModelInfo = {
      id,
      displayName: String(model.displayName || id),
    };
    if (model.description) {
      info.description = String(model.description).slice(0, 160);
    }
    out.push(info);
  });
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

async function collectLyriaFromClient(ai: GoogleGenAI): Promise<LyriaModelInfo[]> {
  const seen = new Set<string>();
  const out: LyriaModelInfo[] = [];
  await iterateModels(ai, (model) => {
    if (!isLyriaGenerateModel(model)) return;
    const info = toLyriaModelInfo(model);
    if (!info || seen.has(info.id)) return;
    seen.add(info.id);
    out.push(info);
  });
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'clip' ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
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

function geminiApiClient(): GoogleGenAI | null {
  const apiKey = resolveApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1beta', timeout: 60_000 },
  });
}

async function withGeminiApiFallback<T>(
  purpose: AiPurpose,
  label: string,
  collect: (ai: GoogleGenAI) => Promise<T[]>,
): Promise<T[]> {
  const primary = getClient(purpose);
  try {
    const models = await collect(primary);
    if (models.length) return models;
  } catch (e) {
    const cfg = getActiveBackend(purpose);
    const gemini = geminiApiClient();
    if (cfg?.backend === 'vertex' && gemini) {
      console.warn(`[mytunes] Vertex ${label} failed; retrying via Gemini Developer API key`, e);
      const models = await collect(gemini);
      if (models.length) return models;
    }
    throw e;
  }

  // Empty primary list (common for Vertex Lyria) — try Gemini API catalog when available.
  const cfg = getActiveBackend(purpose);
  const gemini = geminiApiClient();
  if (cfg?.backend === 'vertex' && gemini) {
    try {
      const models = await collect(gemini);
      if (models.length) return models;
    } catch (e) {
      console.warn(`[mytunes] Gemini API ${label} fallback failed`, e);
    }
  }
  return [];
}

export async function listChatModels(opts?: {
  force?: boolean;
}): Promise<ListChatModelsResult> {
  const fp = fingerprint('assistant');
  const cfg = getActiveBackend('assistant');
  const backend = cfg?.backend ?? null;
  const cached = readJsonCache<ChatModelsCache>(chatCachePath());
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
    const listed = await withGeminiApiFallback(
      'assistant',
      'models.list (chat)',
      collectChatFromClient,
    );
    const models = listed.length ? listed : fallbackChatModels();
    const fetchedAt = new Date().toISOString();
    writeJsonCache(chatCachePath(), {
      backend,
      fingerprint: fp,
      fetchedAt,
      models,
    } satisfies ChatModelsCache);
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
    const models = fallbackChatModels();
    return { models, cached: false, fetchedAt, backend };
  }
}

export async function listLyriaModels(opts?: {
  force?: boolean;
}): Promise<ListLyriaModelsResult> {
  const fp = fingerprint('music');
  const cfg = getActiveBackend('music');
  const backend = cfg?.backend ?? null;
  const cached = readJsonCache<LyriaModelsCache>(lyriaCachePath());
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const usable =
    cached &&
    cached.fingerprint === fp &&
    Array.isArray(cached.models) &&
    cached.models.length > 0 &&
    age < LYRIA_MODELS_TTL_MS;

  if (!opts?.force && usable && cached) {
    return {
      models: cached.models,
      cached: true,
      fetchedAt: cached.fetchedAt,
      backend: cached.backend,
    };
  }

  try {
    const listed = await withGeminiApiFallback(
      'music',
      'models.list (lyria)',
      collectLyriaFromClient,
    );
    const models = listed.length ? listed : fallbackLyriaModels(backend);
    const fetchedAt = new Date().toISOString();
    writeJsonCache(lyriaCachePath(), {
      backend,
      fingerprint: fp,
      fetchedAt,
      models,
    } satisfies LyriaModelsCache);
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
    console.warn('[mytunes] listLyriaModels API failed; using fallback list', e);
    const fetchedAt = new Date().toISOString();
    const models = fallbackLyriaModels(backend);
    return { models, cached: false, fetchedAt, backend };
  }
}
