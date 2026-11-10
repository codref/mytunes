import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type { GenerationRecord } from '../../src/models/generation';
import { normalizePattern, type Pattern } from '../../src/models/pattern';
import { createSong, type Song } from '../../src/models/song';
import {
  findGenerationById,
  generationsDir,
  getGenerationAudioPath,
  loadGenerations,
} from './generationStore';
import { resolveLicenseText } from './licenseTexts';
import { loadSong, saveSong } from './songStore';

export const TUNE_FORMAT_VERSION = 1;

export interface TuneManifest {
  tuneFormatVersion: number;
  exportedAt: string;
  app: string;
  songId: string;
  title: string;
  licensePrimary: string;
  licenseSecondary: string;
}

export interface ExportTuneResult {
  path: string;
  generationCount: number;
}

export interface ImportTuneResult {
  song: Song;
  generationCount: number;
}

const SCHEMA = 'mytunes';

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-');
  return cleaned.slice(0, 80) || 'song';
}

function rightsFromSong(song: Song): { primary: string; secondary: string } {
  const rights = song.pattern?.song?.rights;
  return {
    primary: rights?.licensePrimary?.trim() || 'CC-BY-SA-4.0',
    secondary: rights?.licenseSecondary?.trim() || '',
  };
}

function hasCreditText(rights: Pattern['song']['rights'] | undefined): boolean {
  if (!rights) return false;
  return Boolean(
    rights.composers?.trim() ||
      rights.lyricists?.trim() ||
      rights.copyrightHolder?.trim() ||
      rights.notice?.trim(),
  );
}

/** Overlay parent song credits when the take snapshot has none filled in. */
function mergeRightsFromParent(
  pattern: Pattern,
  parentRights: Pattern['song']['rights'] | undefined,
): void {
  if (!parentRights || !hasCreditText(parentRights)) return;
  if (!pattern.song.rights || !hasCreditText(pattern.song.rights)) {
    pattern.song.rights = structuredClone(parentRights);
  }
}

async function writeTuneArchive(
  song: Song,
  gens: GenerationRecord[],
  destPath: string,
): Promise<ExportTuneResult> {
  normalizePattern(song.pattern);
  const { primary, secondary } = rightsFromSong(song);

  const manifest: TuneManifest = {
    tuneFormatVersion: TUNE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'myTunes',
    songId: song.id,
    title: song.name,
    licensePrimary: primary,
    licenseSecondary: secondary,
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('song.json', JSON.stringify(song, null, 2));
  zip.file(
    'prompt/compiled.txt',
    (song.pattern.compiledPrompt ?? '').trim() + '\n',
  );
  zip.file('legal/license-primary.txt', resolveLicenseText(primary));
  if (secondary) {
    zip.file('legal/license-secondary.txt', resolveLicenseText(secondary));
  }

  const portableGens = gens.map((g) => {
    const { audioPath: _audioPath, audioFileUrl: _url, ...rest } = g;
    return rest;
  });
  zip.file('generations/index.json', JSON.stringify(portableGens, null, 2));

  for (const g of gens) {
    const audio = getGenerationAudioPath(g.id);
    if (!audio) continue;
    zip.file(`generations/${g.id}.mp3`, fs.readFileSync(audio));
  }

  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);

  return { path: destPath, generationCount: gens.length };
}

/** Pack a library song + its takes into a .tune ZIP at destPath. */
export async function exportTune(songId: string, destPath: string): Promise<ExportTuneResult> {
  const song = loadSong(songId);
  if (!song) {
    throw new Error('Song not found');
  }
  return writeTuneArchive(song, loadGenerations({ songId }), destPath);
}

/**
 * Pack a single history take as a .tune: patternSnapshot as source + that take's audio.
 * Rights fall back to the parent song when the snapshot lacks them.
 */
export async function exportTuneGeneration(
  generationId: string,
  destPath: string,
): Promise<ExportTuneResult> {
  const gen = findGenerationById(generationId);
  if (!gen) {
    throw new Error('Generation not found');
  }

  const parent = gen.songId ? loadSong(gen.songId) : null;
  let pattern: Pattern;
  if (gen.patternSnapshot) {
    pattern = JSON.parse(JSON.stringify(gen.patternSnapshot)) as Pattern;
  } else if (parent?.pattern) {
    pattern = JSON.parse(JSON.stringify(parent.pattern)) as Pattern;
    pattern.compiledPrompt = gen.compiledPrompt;
    pattern.lyriaMode = gen.mode;
  } else {
    throw new Error('This take has no pattern snapshot to export');
  }

  // Prefer saved song Rights over an empty snapshot (takes often predate credit fill-in).
  mergeRightsFromParent(pattern, parent?.pattern?.song?.rights);
  normalizePattern(pattern);

  if (!pattern.compiledPrompt?.trim()) {
    pattern.compiledPrompt = gen.compiledPrompt;
  }

  const song = createSong(pattern, {
    id: pattern.id,
    name: pattern.name || gen.patternName || parent?.name || 'Untitled Song',
    activeGenerationId: gen.id,
  });

  return writeTuneArchive(song, [gen], destPath);
}

function parseJson<T>(raw: string | undefined, label: string): T {
  if (!raw?.trim()) {
    throw new Error(`Invalid .tune archive: missing ${label}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid .tune archive: corrupt ${label}`);
  }
}

/**
 * Import a .tune ZIP: always mint new song + generation ids, never overwrite.
 */
export async function importTune(srcPath: string): Promise<ImportTuneResult> {
  if (!fs.existsSync(srcPath)) {
    throw new Error('File not found');
  }
  const data = fs.readFileSync(srcPath);
  const zip = await JSZip.loadAsync(data);

  const manifestRaw = await zip.file('manifest.json')?.async('string');
  const songRaw = await zip.file('song.json')?.async('string');
  const manifest = parseJson<TuneManifest>(manifestRaw, 'manifest.json');
  if (manifest.tuneFormatVersion !== TUNE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported .tune format version ${String(manifest.tuneFormatVersion)} (expected ${TUNE_FORMAT_VERSION})`,
    );
  }
  const imported = parseJson<Song>(songRaw, 'song.json');
  if (!imported?.pattern) {
    throw new Error('Invalid .tune archive: song.json missing pattern');
  }

  const newSongId = crypto.randomUUID();
  const pattern = normalizePattern(
    JSON.parse(JSON.stringify(imported.pattern)) as Song['pattern'],
  );
  pattern.id = newSongId;

  const gensRaw = await zip.file('generations/index.json')?.async('string');
  let archivedGens: Array<Omit<GenerationRecord, 'audioPath' | 'audioFileUrl'> & {
    audioPath?: string;
    audioFileUrl?: string;
  }> = [];
  if (gensRaw?.trim()) {
    try {
      archivedGens = JSON.parse(gensRaw) as typeof archivedGens;
      if (!Array.isArray(archivedGens)) archivedGens = [];
    } catch {
      archivedGens = [];
    }
  }

  const idMap = new Map<string, string>();
  for (const g of archivedGens) {
    if (g?.id) idMap.set(g.id, crypto.randomUUID());
  }

  const remappedActive = imported.activeGenerationId
    ? idMap.get(imported.activeGenerationId)
    : undefined;

  const song = createSong(pattern, {
    id: newSongId,
    name: pattern.name || imported.name || manifest.title || 'Imported Song',
    ...(remappedActive ? { activeGenerationId: remappedActive } : {}),
  });
  const savedSong = saveSong(song);

  const dir = generationsDir();
  const existing = loadGenerations();
  const added: GenerationRecord[] = [];

  for (const g of archivedGens) {
    if (!g?.id) continue;
    const newId = idMap.get(g.id);
    if (!newId) continue;

    const audioEntry =
      zip.file(`generations/${g.id}.mp3`) ?? zip.file(`generations/${newId}.mp3`);
    const audioPath = path.join(dir, `${newId}.mp3`);
    if (audioEntry) {
      const bytes = await audioEntry.async('nodebuffer');
      fs.writeFileSync(audioPath, bytes);
    }

    const snapshot = g.patternSnapshot
      ? normalizePattern(JSON.parse(JSON.stringify(g.patternSnapshot)) as Song['pattern'])
      : structuredClone(pattern);
    snapshot.id = newSongId;
    snapshot.name = pattern.name;

    const record: GenerationRecord = {
      id: newId,
      createdAt: g.createdAt || new Date().toISOString(),
      songId: newSongId,
      patternId: newSongId,
      patternName: pattern.name,
      mode: g.mode === 'full' ? 'full' : 'clip',
      model: g.model || 'unknown',
      costUsd: typeof g.costUsd === 'number' ? g.costUsd : 0,
      promptHash: g.promptHash || '',
      compiledPrompt: g.compiledPrompt || pattern.compiledPrompt || '',
      patternSnapshot: snapshot,
      audioPath,
      audioFileUrl: `${SCHEMA}://generation/${newId}`,
    };
    if (g.lyricsText) record.lyricsText = g.lyricsText;
    if (g.arrangementNotes) record.arrangementNotes = g.arrangementNotes;
    if (g.captionCues?.length) record.captionCues = g.captionCues;
    if (g.userNotes) record.userNotes = g.userNotes;
    if (g.lyricsMatchScore != null) record.lyricsMatchScore = g.lyricsMatchScore;
    if (g.lyricsMismatch != null) record.lyricsMismatch = g.lyricsMismatch;

    if (!fs.existsSync(audioPath)) {
      // Keep record even without audio so knobs/prompt history survive.
      record.audioPath = audioPath;
    }
    added.push(record);
  }

  if (added.length) {
    const next = [...added, ...existing].slice(0, 200);
    fs.writeFileSync(
      path.join(dir, 'index.json'),
      JSON.stringify(next, null, 2),
      'utf8',
    );
  }

  return { song: savedSong, generationCount: added.length };
}

export function defaultExportFilename(song: Song): string {
  return `${sanitizeFilename(song.name)}.tune`;
}

export function defaultGenerationExportFilename(generationId: string): string {
  const gen = findGenerationById(generationId);
  const base = sanitizeFilename(gen?.patternName || 'take');
  const mode = gen?.mode === 'full' ? 'full' : 'clip';
  const stamp = gen?.createdAt
    ? gen.createdAt.slice(0, 19).replace(/:/g, '-').replace('T', '_')
    : generationId.slice(0, 8);
  return `${base}-${mode}-${stamp}.tune`;
}
