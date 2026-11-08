import type { LyriaMode } from './pattern';

export interface GenerationRecord {
  id: string;
  createdAt: string;
  patternId: string;
  patternName: string;
  mode: LyriaMode;
  model: string;
  costUsd: number;
  promptHash: string;
  compiledPrompt: string;
  lyricsText?: string;
  audioPath: string;
  audioFileUrl?: string;
}
