import fs from 'node:fs';
import path from 'node:path';
import { app, protocol } from 'electron';
import type { CaptionCue } from '../../src/models/captionCues';
import type { GenerationRecord } from '../../src/models/generation';
import {
  createDefaultPattern,
  normalizePattern,
  type LyriaMode,
  type Pattern,
} from '../../src/models/pattern';
import { createSong, type Song } from '../../src/models/song';
import { saveSong } from './songStore';

const SCHEMA = 'mytunes';

export function generationsDir(): string {
  const dir = path.join(app.getPath('userData'), 'generations');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return path.join(generationsDir(), 'index.json');
}

export function loadGenerations(filter?: { songId?: string }): GenerationRecord[] {
  const file = indexPath();
  let list: GenerationRecord[] = [];
  if (fs.existsSync(file)) {
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8')) as GenerationRecord[];
    } catch {
      list = [];
    }
  }
  if (filter?.songId) {
    list = list.filter(
      (g) => g.songId === filter.songId || (!g.songId && g.patternId === filter.songId),
    );
  }
  return list.map(normalizeGeneration);
}

function normalizeGeneration(g: GenerationRecord): GenerationRecord {
  if (!g.audioFileUrl) {
    g.audioFileUrl = `${SCHEMA}://generation/${g.id}`;
  }
  return g;
}

function saveIndex(records: GenerationRecord[]): void {
  fs.writeFileSync(indexPath(), JSON.stringify(records, null, 2), 'utf8');
}

export function findGenerationByHash(
  promptHash: string,
  mode: LyriaMode,
  songId?: string,
): GenerationRecord | undefined {
  return loadGenerations(songId ? { songId } : undefined).find(
    (g) => g.promptHash === promptHash && g.mode === mode,
  );
}

export function findGenerationById(id: string): GenerationRecord | undefined {
  return loadGenerations().find((g) => g.id === id);
}

export function patchGeneration(
  id: string,
  patch: Partial<
    Pick<
      GenerationRecord,
      'lyricsText' | 'arrangementNotes' | 'userNotes' | 'lyricsMatchScore' | 'lyricsMismatch'
    >
  >,
): GenerationRecord | null {
  const list = loadGenerations();
  const idx = list.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  const next = { ...list[idx]!, ...patch };
  list[idx] = next;
  saveIndex(list);
  return next;
}

export function saveGeneration(input: {
  songId: string;
  pattern: Pattern;
  mode: LyriaMode;
  model: string;
  costUsd: number;
  promptHash: string;
  compiledPrompt: string;
  lyricsText?: string;
  arrangementNotes?: string;
  captionCues?: CaptionCue[];
  lyricsMatchScore?: number;
  lyricsMismatch?: boolean;
  audioBase64: string;
}): GenerationRecord {
  const id = crypto.randomUUID();
  const audioPath = path.join(generationsDir(), `${id}.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(input.audioBase64, 'base64'));

  const record: GenerationRecord = {
    id,
    createdAt: new Date().toISOString(),
    songId: input.songId,
    patternId: input.pattern.id,
    patternName: input.pattern.name,
    mode: input.mode,
    model: input.model,
    costUsd: input.costUsd,
    promptHash: input.promptHash,
    compiledPrompt: input.compiledPrompt,
    patternSnapshot: structuredClone(input.pattern),
    audioPath,
    audioFileUrl: `${SCHEMA}://generation/${id}`,
  };
  if (input.lyricsText) {
    record.lyricsText = input.lyricsText;
  }
  if (input.arrangementNotes) {
    record.arrangementNotes = input.arrangementNotes;
  }
  if (input.captionCues?.length) {
    record.captionCues = input.captionCues;
  }
  if (input.lyricsMatchScore != null) {
    record.lyricsMatchScore = input.lyricsMatchScore;
  }
  if (input.lyricsMismatch != null) {
    record.lyricsMismatch = input.lyricsMismatch;
  }

  const list = loadGenerations();
  list.unshift(record);
  saveIndex(list.slice(0, 200));
  return record;
}

export function getGenerationAudioPath(id: string): string | null {
  const rec = findGenerationById(id);
  if (!rec) return null;
  return fs.existsSync(rec.audioPath) ? rec.audioPath : null;
}

function patternFromSourceGeneration(source: GenerationRecord, name: string): Pattern {
  if (source.patternSnapshot) {
    const pattern = normalizePattern(
      JSON.parse(JSON.stringify(source.patternSnapshot)) as Pattern,
    );
    pattern.id = crypto.randomUUID();
    pattern.name = name;
    return pattern;
  }
  const partial: Parameters<typeof createDefaultPattern>[0] = {
    id: crypto.randomUUID(),
    name,
    lyriaMode: source.mode,
    compiledPrompt: source.compiledPrompt,
  };
  if (source.lyricsText?.trim()) {
    partial.lyrics = { text: source.lyricsText, source: 'generated' };
  }
  return createDefaultPattern(partial);
}

/** Fork a take into a new song thread with knobs/lyrics + copied audio. */
export function cloneGenerationToSong(
  sourceGenerationId: string,
  name: string,
): { song: Song; generation: GenerationRecord } {
  const source = findGenerationById(sourceGenerationId);
  if (!source) {
    throw new Error('Generation not found');
  }
  const srcAudio = getGenerationAudioPath(source.id);
  if (!srcAudio) {
    throw new Error('Audio file missing for this version');
  }

  const songName = name.trim() || `${source.patternName} (fork)`;
  const pattern = patternFromSourceGeneration(source, songName);
  const newGenId = crypto.randomUUID();
  const audioPath = path.join(generationsDir(), `${newGenId}.mp3`);
  fs.copyFileSync(srcAudio, audioPath);

  const generation: GenerationRecord = {
    id: newGenId,
    createdAt: new Date().toISOString(),
    songId: pattern.id,
    patternId: pattern.id,
    patternName: pattern.name,
    mode: source.mode,
    model: source.model,
    costUsd: source.costUsd,
    promptHash: source.promptHash,
    compiledPrompt: source.compiledPrompt,
    patternSnapshot: structuredClone(pattern),
    audioPath,
    audioFileUrl: `${SCHEMA}://generation/${newGenId}`,
  };
  if (source.lyricsText) generation.lyricsText = source.lyricsText;
  if (source.arrangementNotes) generation.arrangementNotes = source.arrangementNotes;
  if (source.captionCues?.length) generation.captionCues = source.captionCues;
  if (source.lyricsMatchScore != null) generation.lyricsMatchScore = source.lyricsMatchScore;
  if (source.lyricsMismatch != null) generation.lyricsMismatch = source.lyricsMismatch;

  const song = createSong(pattern, {
    id: pattern.id,
    name: pattern.name,
    activeGenerationId: generation.id,
  });
  const savedSong = saveSong(song);

  const list = loadGenerations();
  list.unshift(generation);
  saveIndex(list.slice(0, 200));

  return { song: savedSong, generation: normalizeGeneration(generation) };
}

export function registerAudioProtocol(): void {
  if (protocol.isProtocolRegistered(SCHEMA)) return;
  protocol.registerFileProtocol(SCHEMA, (request, callback) => {
    try {
      const url = new URL(request.url);
      const id = url.pathname.replace(/^\//, '');
      const filePath = getGenerationAudioPath(id);
      if (!filePath) {
        callback({ error: -6 });
        return;
      }
      callback({ path: filePath });
    } catch {
      callback({ error: -2 });
    }
  });
}

/** @deprecated Prefer songStore — kept for migration helpers / old IPC. */
function patternsDir(): string {
  const dir = path.join(app.getPath('userData'), 'patterns');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listPatterns(): Pattern[] {
  const dir = patternsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const patterns: Pattern[] = [];
  for (const file of files) {
    try {
      patterns.push(normalizePattern(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Pattern));
    } catch {
      /* skip */
    }
  }
  return patterns.sort((a, b) => a.name.localeCompare(b.name));
}

export function savePattern(pattern: Pattern): Pattern {
  normalizePattern(pattern);
  const file = path.join(patternsDir(), `${pattern.id}.json`);
  fs.writeFileSync(file, JSON.stringify(pattern, null, 2), 'utf8');
  return pattern;
}

export function deletePattern(id: string): void {
  const file = path.join(patternsDir(), `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function loadPattern(id: string): Pattern | null {
  const file = path.join(patternsDir(), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return normalizePattern(JSON.parse(fs.readFileSync(file, 'utf8')) as Pattern);
}
