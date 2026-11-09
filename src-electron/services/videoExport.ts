import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { app } from 'electron';
import {
  cuesToSrt,
  resolveExportCues,
  type CaptionCue,
} from '../../src/models/captionCues';
import type { GenerationRecord } from '../../src/models/generation';
import { findGenerationById, getGenerationAudioPath } from './generationStore';

const require = createRequire(import.meta.url);

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
/** Soft dual-tone stroke — stereo channels map to sky / cyan. */
const WAVE_COLORS = '0x7dd3fc|0x38bdf8';
const BG_COLOR = '0x0a0a12';

export interface VideoExportResult {
  mp4Path: string;
  srtPath: string;
  durationSec: number;
  cueCount: number;
}

export type VideoExportProgress = (percent: number | null, message: string) => void;

export function exportsDir(): string {
  const dir = path.join(app.getPath('userData'), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveFfmpegPath(): string {
  let bin = require('ffmpeg-static') as string | null;
  if (!bin || typeof bin !== 'string') {
    throw new Error('ffmpeg-static binary is not installed. Re-run npm install.');
  }
  if (bin.includes('app.asar')) {
    bin = bin.replace('app.asar', 'app.asar.unpacked');
  }
  if (!fs.existsSync(bin)) {
    throw new Error(`ffmpeg binary missing at ${bin}`);
  }
  return bin;
}

function safeSlug(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'track';
}

/** Parse `Duration: HH:MM:SS.xx` from ffmpeg -i stderr. */
export async function probeDurationSec(ffmpegBin: string, mediaPath: string): Promise<number> {
  const stderr = await runFfmpegCapture(ffmpegBin, ['-i', mediaPath]);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const total = h * 3600 + min * 60 + sec;
  return Number.isFinite(total) ? total : 0;
}

function runFfmpegCapture(ffmpegBin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.on('close', () => resolve(err));
    child.on('error', () => resolve(err));
  });
}

function runFfmpeg(
  ffmpegBin: string,
  args: string[],
  durationSec: number,
  onProgress?: VideoExportProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errBuf = '';

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      errBuf += text;
      const timeMatch = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (timeMatch && durationSec > 0) {
        const t =
          Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
        const pct = Math.min(99, Math.round((t / durationSec) * 100));
        onProgress?.(pct, 'Rendering waveform…');
      }
    };

    child.stderr?.on('data', handleChunk);
    child.stdout?.on('data', handleChunk);

    child.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        onProgress?.(100, 'Done');
        resolve();
        return;
      }
      const tail = errBuf.trim().split('\n').slice(-8).join('\n');
      reject(new Error(`ffmpeg exited with code ${code}${tail ? `:\n${tail}` : ''}`));
    });
  });
}

/**
 * Export a polished centered-line waveform MP4 + sidecar SRT for a generation.
 */
export async function exportGenerationVideo(
  generationId: string,
  onProgress?: VideoExportProgress,
): Promise<VideoExportResult> {
  const generation = findGenerationById(generationId);
  if (!generation) {
    throw new Error('Generation not found');
  }
  const audioPath = getGenerationAudioPath(generationId);
  if (!audioPath) {
    throw new Error('Audio file missing for this version');
  }

  onProgress?.(null, 'Preparing export…');
  const ffmpegBin = resolveFfmpegPath();
  const durationSec = await probeDurationSec(ffmpegBin, audioPath);

  const cues = resolveExportCues(
    generation.captionCues,
    generation.lyricsText,
    durationSec > 0 ? durationSec : 30,
  );
  const srtBody = cuesToSrt(cues);

  const shortId = generation.id.slice(0, 8);
  const baseName = `${safeSlug(generation.patternName)}-${shortId}`;
  const outDir = exportsDir();
  const mp4Path = path.join(outDir, `${baseName}.mp4`);
  const srtPath = path.join(outDir, `${baseName}.srt`);

  fs.writeFileSync(srtPath, srtBody || '', 'utf8');

  // Dark canvas + centered cline waveform (stereo dual-tone). Title skipped:
  // this ffmpeg-static build has no drawtext filter.
  const filterComplex = [
    `[1:a]showwaves=s=${WIDTH}x${Math.round(HEIGHT * 0.5)}:mode=cline:colors=${WAVE_COLORS}:scale=sqrt:rate=${FPS}:draw=full,format=rgba[wave]`,
    `[0:v][wave]overlay=0:(H-h)/2:format=auto,format=yuv420p[v]`,
  ].join(';');

  onProgress?.(0, 'Rendering waveform…');

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${BG_COLOR}:s=${WIDTH}x${HEIGHT}:r=${FPS}`,
    '-i',
    audioPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '[v]',
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    mp4Path,
  ];

  await runFfmpeg(ffmpegBin, args, durationSec, onProgress);

  if (!fs.existsSync(mp4Path)) {
    throw new Error('Export finished but MP4 was not written');
  }

  return {
    mp4Path,
    srtPath,
    durationSec,
    cueCount: cues.length,
  };
}

/** Re-export for callers that only need cue typing. */
export type { CaptionCue, GenerationRecord };
