import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { StudioPreset } from '../../src/models/presets';

function presetsDir(): string {
  const dir = path.join(app.getPath('userData'), 'presets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function presetFile(id: string): string {
  return path.join(presetsDir(), `${id}.json`);
}

function readPreset(file: string): StudioPreset | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as StudioPreset;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind !== 'slot' && raw.kind !== 'song') return null;
    if (!raw.id || !raw.name) return null;
    return raw;
  } catch {
    return null;
  }
}

export function listPresets(): StudioPreset[] {
  const dir = presetsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: StudioPreset[] = [];
  for (const file of files) {
    const preset = readPreset(path.join(dir, file));
    if (preset) out.push(preset);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePreset(preset: StudioPreset): StudioPreset {
  const next: StudioPreset = {
    ...preset,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(presetFile(next.id), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function deletePreset(id: string): { ok: boolean } {
  const file = presetFile(id);
  if (!fs.existsSync(file)) return { ok: false };
  fs.unlinkSync(file);
  return { ok: true };
}

/** Find an existing preset to overwrite by kind + name (+ slotId for slots). */
export function findPresetDuplicate(preset: StudioPreset): StudioPreset | null {
  const name = preset.name.trim().toLowerCase();
  for (const existing of listPresets()) {
    if (existing.kind !== preset.kind) continue;
    if (existing.name.trim().toLowerCase() !== name) continue;
    if (existing.kind === 'slot' && preset.kind === 'slot') {
      if (existing.slotId !== preset.slotId) continue;
    }
    return existing;
  }
  return null;
}
