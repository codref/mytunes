import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { AiBackendId, AiPurpose } from '../../src/models/settings';
import { loadSettings } from './settingsStore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AiBackend = AiBackendId;

export interface AiBackendConfig {
  backend: AiBackend;
  purpose: AiPurpose;
  project?: string;
  location?: string;
  apiKey?: string;
  credentialsPath?: string;
  label: string;
}

export interface PurposeBackendStatus {
  present: boolean;
  backend: AiBackend | null;
  label: string | null;
}

export interface BackendsStatus {
  /** True if at least one of assistant/music can run */
  present: boolean;
  assistant: PurposeBackendStatus;
  music: PurposeBackendStatus;
  vertexConfigured: boolean;
  geminiConfigured: boolean;
}

/** Resolve repo root in Quasar Electron (src-electron/services → ../..) */
export function resolveProjectRoot(): string {
  const candidates = [
    path.resolve(__dirname, '../..'),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), '..'),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, '.env.local')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
  }
  return process.cwd();
}

export function loadEnvFile(): void {
  const root = resolveProjectRoot();
  const envPath = path.join(root, '.env.local');
  if (fs.existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
  }
}

export function getGoogleApiKey(): string | null {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  return key.trim() ? key.trim() : null;
}

export function getVertexProject(): string | null {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  return project.trim() ? project.trim() : null;
}

export function getVertexLocation(): string {
  return (process.env.GOOGLE_CLOUD_LOCATION || process.env.GCLOUD_LOCATION || 'global').trim();
}

function settingsOverlay(): {
  assistantBackend: AiBackendId;
  musicBackend: AiBackendId;
  apiKey: string | null;
  project: string | null;
  location: string;
  credentialsPath: string | null;
} {
  try {
    const s = loadSettings();
    return {
      assistantBackend: s.assistantBackend,
      musicBackend: s.musicBackend,
      apiKey: s.apiKey,
      project: s.vertexProject,
      location: s.vertexLocation || 'global',
      credentialsPath: s.credentialsPath,
    };
  } catch {
    return {
      assistantBackend: 'gemini-api',
      musicBackend: 'gemini-api',
      apiKey: null,
      project: null,
      location: 'global',
      credentialsPath: null,
    };
  }
}

/**
 * Resolve credentials for a concrete backend id (Vertex or Gemini API).
 */
export function resolveBackendConfig(
  backend: AiBackendId,
  purpose: AiPurpose,
): AiBackendConfig | null {
  const overlay = settingsOverlay();
  const apiKey = overlay.apiKey || getGoogleApiKey();
  const project = overlay.project || getVertexProject();
  const location = overlay.location || getVertexLocation();
  const credentialsPath =
    overlay.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || undefined;

  if (backend === 'gemini-api') {
    if (!apiKey) return null;
    return {
      backend: 'gemini-api',
      purpose,
      apiKey,
      label: `Gemini API ${maskApiKey(apiKey)}`,
    };
  }

  if (!project) return null;
  const cfg: AiBackendConfig = {
    backend: 'vertex',
    purpose,
    project,
    location,
    label: `Vertex ${project}/${location}`,
  };
  if (credentialsPath) cfg.credentialsPath = credentialsPath;
  return cfg;
}

/**
 * Resolve which Google AI backend to use for assistant (Flash) or music (Lyria).
 */
export function resolveAiBackend(purpose: AiPurpose = 'assistant'): AiBackendConfig | null {
  const overlay = settingsOverlay();
  const choice = purpose === 'music' ? overlay.musicBackend : overlay.assistantBackend;
  return resolveBackendConfig(choice, purpose);
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function getBackendStatus(): BackendsStatus {
  const assistant = resolveAiBackend('assistant');
  const music = resolveAiBackend('music');
  const vertexConfigured = Boolean(resolveBackendConfig('vertex', 'assistant'));
  const geminiConfigured = Boolean(resolveBackendConfig('gemini-api', 'assistant'));

  const asStatus = (cfg: AiBackendConfig | null): PurposeBackendStatus =>
    cfg
      ? { present: true, backend: cfg.backend, label: cfg.label }
      : { present: false, backend: null, label: null };

  return {
    present: Boolean(assistant || music),
    assistant: asStatus(assistant),
    music: asStatus(music),
    vertexConfigured,
    geminiConfigured,
  };
}
