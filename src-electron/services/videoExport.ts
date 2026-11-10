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
import {
  normalizeVideoExportOptions,
  type VideoExportOptions,
} from '../../src/models/videoExport';
import { findGenerationById, getGenerationAudioPath } from './generationStore';

const require = createRequire(import.meta.url);

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

function ffmpegColor(hex: string): string {
  const h = hex.replace(/^#/, '').toLowerCase();
  return `0x${h}`;
}

/**
 * Build ffmpeg filter chain that frames a still into WxH with fit/zoom/pan.
 * Input label: [0:v] → output label: [bg]
 */
function buildImageBgFilter(opts: VideoExportOptions): string {
  const { width: W, height: H } = opts;
  const zoom = Math.max(1, opts.imageZoom / 100);
  const padColor = ffmpegColor(opts.backgroundColor);

  if (opts.imageFit === 'stretch') {
    return `[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=${opts.fps},format=rgba[bg]`;
  }

  if (opts.imageFit === 'contain') {
    // Scale to fit * zoom, then pad to canvas; pan shifts pad offsets.
    const panX = opts.imagePanX / 100;
    const panY = opts.imagePanY / 100;
    // pad x/y: center ± pan * leftover. Use expressions evaluated by ffmpeg.
    const xExpr = `(ow-iw)/2*(1+${panX.toFixed(4)})`;
    const yExpr = `(oh-ih)/2*(1+${panY.toFixed(4)})`;
    return [
      `[0:v]scale=${W}*${zoom.toFixed(4)}:${H}*${zoom.toFixed(4)}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${W}:${H}:${xExpr}:${yExpr}:color=${padColor}`,
      `setsar=1,fps=${opts.fps},format=rgba[bg]`,
    ].join(',');
  }

  // Cover: scale to fill * zoom, crop WxH with pan within excess.
  const panX = opts.imagePanX / 100;
  const panY = opts.imagePanY / 100;
  const xExpr = `(iw-ow)/2*(1+${panX.toFixed(4)})`;
  const yExpr = `(ih-oh)/2*(1+${panY.toFixed(4)})`;
  return [
    `[0:v]scale=${W}*${zoom.toFixed(4)}:${H}*${zoom.toFixed(4)}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${W}:${H}:${xExpr}:${yExpr}`,
    `setsar=1,fps=${opts.fps},format=rgba[bg]`,
  ].join(',');
}

function buildFilterComplex(opts: VideoExportOptions, useImage: boolean): string {
  const { width: W, height: H, fps } = opts;
  const parts: string[] = [];

  if (useImage) {
    parts.push(buildImageBgFilter(opts));
  } else {
    // Solid lavfi color is already W×H; just tag it [bg].
    parts.push(`[0:v]format=rgba[bg]`);
  }

  if (!opts.showWaveform) {
    parts.push(`[bg]format=yuv420p[v]`);
    return parts.join(';');
  }

  const waveH = Math.max(2, Math.round(H * opts.waveformHeight));
  const evenWaveH = waveH % 2 === 0 ? waveH : waveH + 1;
  const colors = `${ffmpegColor(opts.waveformColorLeft)}|${ffmpegColor(opts.waveformColorRight)}`;
  const opacity = opts.waveformOpacity;

  const waveFilters = [
    `showwaves=s=${W}x${evenWaveH}:mode=${opts.waveformMode}:colors=${colors}:scale=sqrt:rate=${fps}:draw=full`,
    'format=rgba',
  ];
  if (opacity < 0.999) {
    waveFilters.push(`colorchannelmixer=aa=${opacity.toFixed(3)}`);
  }
  parts.push(`[1:a]${waveFilters.join(',')}[wave]`);
  parts.push(`[bg][wave]overlay=0:(H-h)/2:format=auto,format=yuv420p[v]`);
  return parts.join(';');
}

/**
 * Export a waveform MP4 (+ optional sidecar SRT) for a generation.
 */
export async function exportGenerationVideo(
  generationId: string,
  options?: Partial<VideoExportOptions> | null,
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

  const opts = normalizeVideoExportOptions(options);
  const useImage = opts.background === 'image' && Boolean(opts.imagePath);
  if (useImage && opts.imagePath && !fs.existsSync(opts.imagePath)) {
    throw new Error(`Background image not found: ${opts.imagePath}`);
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

  if (opts.writeSrt) {
    fs.writeFileSync(srtPath, srtBody || '', 'utf8');
  } else if (fs.existsSync(srtPath)) {
    // Leave any prior sibling alone; only write when requested.
  }

  const filterComplex = buildFilterComplex(opts, useImage);
  const bgColor = ffmpegColor(opts.backgroundColor);

  onProgress?.(0, 'Rendering waveform…');

  const args: string[] = ['-y'];

  if (useImage && opts.imagePath) {
    args.push('-loop', '1', '-i', opts.imagePath);
  } else {
    args.push(
      '-f',
      'lavfi',
      '-i',
      `color=c=${bgColor}:s=${opts.width}x${opts.height}:r=${opts.fps}`,
    );
  }

  args.push('-i', audioPath);
  args.push('-filter_complex', filterComplex);
  args.push('-map', '[v]', '-map', '1:a');
  args.push(
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
  );

  await runFfmpeg(ffmpegBin, args, durationSec, onProgress);

  if (!fs.existsSync(mp4Path)) {
    throw new Error('Export finished but MP4 was not written');
  }

  return {
    mp4Path,
    srtPath: opts.writeSrt ? srtPath : '',
    durationSec,
    cueCount: opts.writeSrt ? cues.length : 0,
  };
}

/** Re-export for callers that only need cue typing. */
export type { CaptionCue, GenerationRecord };
