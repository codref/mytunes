import fs from 'node:fs';
import path from 'node:path';
import { app, protocol } from 'electron';
import type { GenerationRecord } from '../../src/models/generation';
import type { LyriaMode } from '../../src/models/pattern';
import type { Pattern } from '../../src/models/pattern';

const SCHEMA = 'mytunes';

export function generationsDir(): string {
  const dir = path.join(app.getPath('userData'), 'generations');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return path.join(generationsDir(), 'index.json');
}

function patternsDir(): string {
  const dir = path.join(app.getPath('userData'), 'patterns');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadGenerations(): GenerationRecord[] {
  const file = indexPath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as GenerationRecord[];
  } catch {
    return [];
  }
}

function saveIndex(records: GenerationRecord[]): void {
  fs.writeFileSync(indexPath(), JSON.stringify(records, null, 2), 'utf8');
}

export function findGenerationByHash(
  promptHash: string,
  mode: LyriaMode,
): GenerationRecord | undefined {
  return loadGenerations().find((g) => g.promptHash === promptHash && g.mode === mode);
}

export function saveGeneration(input: {
  pattern: Pattern;
  mode: LyriaMode;
  model: string;
  costUsd: number;
  promptHash: string;
  compiledPrompt: string;
  lyricsText?: string;
  audioBase64: string;
}): GenerationRecord {
  const id = crypto.randomUUID();
  const audioPath = path.join(generationsDir(), `${id}.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(input.audioBase64, 'base64'));

  const record: GenerationRecord = {
    id,
    createdAt: new Date().toISOString(),
    patternId: input.pattern.id,
    patternName: input.pattern.name,
    mode: input.mode,
    model: input.model,
    costUsd: input.costUsd,
    promptHash: input.promptHash,
    compiledPrompt: input.compiledPrompt,
    audioPath,
    audioFileUrl: `${SCHEMA}://generation/${id}`,
  };
  if (input.lyricsText) {
    record.lyricsText = input.lyricsText;
  }

  const list = loadGenerations();
  list.unshift(record);
  saveIndex(list.slice(0, 200));
  return record;
}

export function getGenerationAudioPath(id: string): string | null {
  const rec = loadGenerations().find((g) => g.id === id);
  if (!rec) return null;
  return fs.existsSync(rec.audioPath) ? rec.audioPath : null;
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

export function listPatterns(): Pattern[] {
  const dir = patternsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const patterns: Pattern[] = [];
  for (const file of files) {
    try {
      patterns.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Pattern);
    } catch {
      /* skip */
    }
  }
  return patterns.sort((a, b) => a.name.localeCompare(b.name));
}

export function savePattern(pattern: Pattern): Pattern {
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
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Pattern;
}
