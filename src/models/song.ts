import type { Pattern } from './pattern';

export interface Song {
  id: string;
  name: string;
  updatedAt: string;
  pattern: Pattern;
  activeGenerationId?: string;
}

export interface AppSession {
  lastSongId: string | null;
}

export function createSong(pattern: Pattern, partial?: Partial<Song>): Song {
  const song: Song = {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? pattern.name ?? 'Untitled Song',
    updatedAt: partial?.updatedAt ?? new Date().toISOString(),
    pattern: structuredClone(pattern),
  };
  if (partial?.activeGenerationId) {
    song.activeGenerationId = partial.activeGenerationId;
  }
  return song;
}

export function createDefaultSession(): AppSession {
  return { lastSongId: null };
}
