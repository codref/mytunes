import type { LyriaMode, Pattern } from './pattern';

export interface GenerationRecord {
  id: string;
  createdAt: string;
  /** Owning song project (preferred). */
  songId?: string;
  patternId: string;
  patternName: string;
  mode: LyriaMode;
  model: string;
  costUsd: number;
  promptHash: string;
  compiledPrompt: string;
  /** Full Pattern clone at generate time — used to restore knobs/lyrics/mode. */
  patternSnapshot?: Pattern;
  /** Sung lyrics extracted from Lyria's return (arrangement prose stripped). */
  lyricsText?: string;
  /** Production / segment commentary Lyria appended after the lyric captions. */
  arrangementNotes?: string;
  /** How closely Lyria's returned transcript matches the user lyric sheet (0–1). */
  lyricsMatchScore?: number;
  /** True when user supplied lyrics and overlap is suspiciously low. */
  lyricsMismatch?: boolean;
  audioPath: string;
  audioFileUrl?: string;
}

/** Best-effort Pattern restore when an old generation has no snapshot. */
export function patternFromGeneration(g: GenerationRecord): Pattern | null {
  if (!g.patternSnapshot) return null;
  // Generations live in a Pinia ref — nested snapshots are Vue proxies.
  // structuredClone() throws DataCloneError on proxies; JSON round-trip is safe.
  return JSON.parse(JSON.stringify(g.patternSnapshot)) as Pattern;
}
