import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { BackendPreference } from '../../src/models/settings';
import { loadSettings } from './settingsStore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AiBackend = 'vertex' | 'gemini-api';

export interface AiBackendConfig {
  backend: AiBackend;
  project?: string;
  location?: string;
  apiKey?: string;
  credentialsPath?: string;
  label: string;
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

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function settingsOverlay(): {
  preference: BackendPreference;
  apiKey: string | null;
  project: string | null;
  location: string;
  credentialsPath: string | null;
} {
  try {
    const s = loadSettings();
    return {
      preference: s.backendPreference,
      apiKey: s.apiKey,
      project: s.vertexProject,
      location: s.vertexLocation || 'global',
      credentialsPath: s.credentialsPath,
    };
  } catch {
    return {
      preference: 'auto',
      apiKey: null,
      project: null,
      location: 'global',
      credentialsPath: null,
    };
  }
}

/**
 * Resolve which Google AI backend to use.
 * Settings (userData) override env when set; preference steers Vertex vs Gemini API.
 */
export function resolveAiBackend(): AiBackendConfig | null {
  const overlay = settingsOverlay();
  const forcedVertex =
    truthy(process.env.GOOGLE_GENAI_USE_VERTEXAI) ||
    truthy(process.env.GOOGLE_GENAI_USE_ENTERPRISE);
  const forcedGemini = truthy(process.env.GOOGLE_GENAI_USE_GEMINI_API);

  const apiKey = overlay.apiKey || getGoogleApiKey();
  const project = overlay.project || getVertexProject();
  const location = overlay.location || getVertexLocation();
  const credentialsPath =
    overlay.credentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || undefined;

  const preference = overlay.preference;

  const asGemini = (): AiBackendConfig | null => {
    if (!apiKey) return null;
    return {
      backend: 'gemini-api',
      apiKey,
      label: `Gemini API ${maskApiKey(apiKey)}`,
    };
  };

  const asVertex = (): AiBackendConfig | null => {
    if (!project) return null;
    const cfg: AiBackendConfig = {
      backend: 'vertex',
      project,
      location,
      label: `Vertex ${project}/${location}`,
    };
    if (credentialsPath) cfg.credentialsPath = credentialsPath;
    return cfg;
  };

  if (preference === 'gemini-api') {
    return asGemini();
  }
  if (preference === 'vertex') {
    return asVertex() ?? asGemini();
  }

  // auto
  if (forcedGemini && apiKey) return asGemini();
  if ((forcedVertex || project) && project) return asVertex();
  if (apiKey) return asGemini();
  if (project) return asVertex();
  return null;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function getBackendStatus(): {
  present: boolean;
  backend: AiBackend | null;
  masked: string | null;
  project: string | null;
  location: string | null;
} {
  const cfg = resolveAiBackend();
  if (!cfg) {
    return { present: false, backend: null, masked: null, project: null, location: null };
  }
  return {
    present: true,
    backend: cfg.backend,
    masked: cfg.label,
    project: cfg.project ?? null,
    location: cfg.location ?? null,
  };
}
