import type { Pattern } from './pattern';

export interface Song {
  id: string;
  name: string;
  updatedAt: string;
  pattern: Pattern;
  activeGenerationId?: string;
  /**
   * Runtime-only URL for the song cover (`mytunes://cover/{id}`).
   * Not persisted in song.json — presence is inferred from the covers/ file.
   */
  coverFileUrl?: string;
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
