import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  createDefaultSettings,
  type AppSettings,
  type AppSettingsPublic,
  type AppSettingsUpdate,
} from '../../src/models/settings';

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

let cached: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (cached) return cached;
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    cached = createDefaultSettings();
    return cached;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>;
    cached = {
      ...createDefaultSettings(),
      ...raw,
      patternDefaults: {
        ...createDefaultSettings().patternDefaults,
        ...(raw.patternDefaults ?? {}),
      },
    };
  } catch {
    cached = createDefaultSettings();
  }
  return cached;
}

export function saveSettings(next: AppSettings): AppSettings {
  cached = next;
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return cached;
}

export function updateSettings(update: AppSettingsUpdate): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...(update.backendPreference !== undefined
      ? { backendPreference: update.backendPreference }
      : {}),
    ...(update.vertexProject !== undefined ? { vertexProject: update.vertexProject || null } : {}),
    ...(update.vertexLocation !== undefined
      ? { vertexLocation: update.vertexLocation.trim() || 'global' }
      : {}),
    ...(update.credentialsPath !== undefined
      ? { credentialsPath: update.credentialsPath || null }
      : {}),
    ...(update.flashModel !== undefined
      ? { flashModel: update.flashModel.trim() || current.flashModel }
      : {}),
    ...(update.patternDefaults !== undefined
      ? { patternDefaults: { ...update.patternDefaults } }
      : {}),
  };

  if (update.apiKey !== undefined) {
    const key = typeof update.apiKey === 'string' ? update.apiKey.trim() : '';
    next.apiKey = key || null;
  }

  return saveSettings(next);
}

export function toPublicSettings(settings: AppSettings = loadSettings()): AppSettingsPublic {
  return {
    backendPreference: settings.backendPreference,
    hasApiKey: Boolean(settings.apiKey),
    apiKeyMasked: settings.apiKey ? maskKey(settings.apiKey) : null,
    vertexProject: settings.vertexProject,
    vertexLocation: settings.vertexLocation,
    credentialsPath: settings.credentialsPath,
    flashModel: settings.flashModel,
    patternDefaults: { ...settings.patternDefaults },
  };
}

export function getFlashModel(): string {
  return loadSettings().flashModel;
}

export function getPatternDefaults() {
  return { ...loadSettings().patternDefaults };
}
