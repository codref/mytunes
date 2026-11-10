import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  createDefaultSettings,
  migrateSettingsRaw,
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
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const migrated = migrateSettingsRaw(raw);
    cached = {
      ...createDefaultSettings(),
      ...migrated,
      patternDefaults: {
        ...createDefaultSettings().patternDefaults,
        ...((migrated.patternDefaults as AppSettings['patternDefaults']) ?? {}),
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
    ...(update.assistantBackend !== undefined
      ? { assistantBackend: update.assistantBackend }
      : {}),
    ...(update.musicBackend !== undefined ? { musicBackend: update.musicBackend } : {}),
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
    ...(update.lyriaClipModel !== undefined
      ? { lyriaClipModel: update.lyriaClipModel.trim() || current.lyriaClipModel }
      : {}),
    ...(update.lyriaFullModel !== undefined
      ? { lyriaFullModel: update.lyriaFullModel.trim() || current.lyriaFullModel }
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
    assistantBackend: settings.assistantBackend,
    musicBackend: settings.musicBackend,
    hasApiKey: Boolean(settings.apiKey),
    apiKeyMasked: settings.apiKey ? maskKey(settings.apiKey) : null,
    vertexProject: settings.vertexProject,
    vertexLocation: settings.vertexLocation,
    credentialsPath: settings.credentialsPath,
    flashModel: settings.flashModel,
    lyriaClipModel: settings.lyriaClipModel,
    lyriaFullModel: settings.lyriaFullModel,
    patternDefaults: { ...settings.patternDefaults },
  };
}

export function getFlashModel(): string {
  return loadSettings().flashModel;
}

export function getLyriaClipModel(): string {
  return loadSettings().lyriaClipModel;
}

export function getLyriaFullModel(): string {
  return loadSettings().lyriaFullModel;
}

export function getPatternDefaults() {
  return { ...loadSettings().patternDefaults };
}
