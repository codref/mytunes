import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { normalizePattern, type Pattern } from '../../src/models/pattern';
import {
  createDefaultSession,
  createSong,
  type AppSession,
  type Song,
} from '../../src/models/song';

function normalizeSong(song: Song): Song {
  if (song.pattern) normalizePattern(song.pattern);
  return song;
}

function songsDir(): string {
  const dir = path.join(app.getPath('userData'), 'songs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function patternsDir(): string {
  return path.join(app.getPath('userData'), 'patterns');
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'session.json');
}

function songFile(id: string): string {
  return path.join(songsDir(), `${id}.json`);
}

let migrated = false;

/** One-time import of legacy patterns/*.json into songs/*.json. */
export function migratePatternsToSongs(): void {
  if (migrated) return;
  migrated = true;
  const dir = patternsDir();
  if (!fs.existsSync(dir)) return;
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  for (const file of files) {
    try {
      const pattern = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Pattern;
      if (!pattern?.id) continue;
      if (fs.existsSync(songFile(pattern.id))) continue;
      const song = createSong(pattern, {
        id: pattern.id,
        name: pattern.name || 'Untitled Song',
      });
      saveSong(song);
    } catch {
      /* skip corrupt */
    }
  }
}

export function listSongs(): Song[] {
  migratePatternsToSongs();
  const dir = songsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const songs: Song[] = [];
  for (const file of files) {
    try {
      songs.push(normalizeSong(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Song));
    } catch {
      /* skip */
    }
  }
  return songs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadSong(id: string): Song | null {
  migratePatternsToSongs();
  const file = songFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeSong(JSON.parse(fs.readFileSync(file, 'utf8')) as Song);
  } catch {
    return null;
  }
}

export function saveSong(song: Song): Song {
  migratePatternsToSongs();
  normalizeSong(song);
  const next: Song = {
    ...song,
    name: song.pattern?.name || song.name,
    updatedAt: new Date().toISOString(),
    pattern: structuredClone(song.pattern),
  };
  fs.writeFileSync(songFile(next.id), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function deleteSong(id: string): { ok: boolean } {
  const file = songFile(id);
  if (!fs.existsSync(file)) return { ok: false };
  fs.unlinkSync(file);
  return { ok: true };
}

export function getSession(): AppSession {
  const file = sessionPath();
  if (!fs.existsSync(file)) return createDefaultSession();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSession>;
    return {
      lastSongId: raw.lastSongId ?? null,
    };
  } catch {
    return createDefaultSession();
  }
}

export function setSession(update: Partial<AppSession>): AppSession {
  const current = getSession();
  const next: AppSession = {
    lastSongId:
      update.lastSongId !== undefined ? update.lastSongId : current.lastSongId,
  };
  fs.writeFileSync(sessionPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Ensure a Song exists for generate/save; creates one from pattern if needed. */
export function ensureSongForPattern(
  pattern: Pattern,
  existingSongId?: string | null,
): Song {
  if (existingSongId) {
    const existing = loadSong(existingSongId);
    if (existing) {
      existing.pattern = structuredClone(pattern);
      existing.name = pattern.name || existing.name;
      return saveSong(existing);
    }
  }
  // Prefer pattern.id if a song already uses it (migrated pattern).
  const byPatternId = loadSong(pattern.id);
  if (byPatternId) {
    byPatternId.pattern = structuredClone(pattern);
    byPatternId.name = pattern.name || byPatternId.name;
    return saveSong(byPatternId);
  }
  const song = createSong(pattern, { id: pattern.id, name: pattern.name });
  return saveSong(song);
}
