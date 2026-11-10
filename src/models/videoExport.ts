/** Waveform draw modes supported by ffmpeg showwaves. */
export type WaveformMode = 'cline' | 'line' | 'p2p';

/** How a background image is framed into the export canvas. */
export type ImageFitMode = 'cover' | 'contain' | 'stretch';

export type VideoExportPresetId = 'youtube' | 'linkedin' | 'vertical' | 'custom';

export type BackgroundKind = 'solid' | 'image';

export interface VideoExportOptions {
  width: number;
  height: number;
  fps: number;
  background: BackgroundKind;
  /** Hex without #, e.g. 0a0a12 — used as solid fill or contain letterbox. */
  backgroundColor: string;
  /** Absolute path to still image when background === 'image'. */
  imagePath?: string | null;
  imageFit: ImageFitMode;
  /** Zoom percent 100–200 (Cover/Contain). */
  imageZoom: number;
  /** Pan −50…50 as percent of excess crop/pad. */
  imagePanX: number;
  imagePanY: number;
  showWaveform: boolean;
  waveformMode: WaveformMode;
  /** Waveform band height as fraction of frame (0.1–1). */
  waveformHeight: number;
  /** 0–1 overlay opacity. */
  waveformOpacity: number;
  /** Hex without # for left/right stereo channels. */
  waveformColorLeft: string;
  waveformColorRight: string;
  writeSrt: boolean;
}

export interface VideoExportPreset {
  id: Exclude<VideoExportPresetId, 'custom'>;
  label: string;
  caption: string;
  width: number;
  height: number;
  fps: number;
}

export const VIDEO_EXPORT_PRESETS: VideoExportPreset[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    caption: '1920×1080 · 16:9',
    width: 1920,
    height: 1080,
    fps: 30,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    caption: '1080×1080 · 1:1',
    width: 1080,
    height: 1080,
    fps: 30,
  },
  {
    id: 'vertical',
    label: 'Vertical',
    caption: '1080×1920 · 9:16',
    width: 1080,
    height: 1920,
    fps: 30,
  },
];

export const DEFAULT_VIDEO_EXPORT_OPTIONS: VideoExportOptions = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: 'solid',
  backgroundColor: '0a0a12',
  imagePath: null,
  imageFit: 'cover',
  imageZoom: 100,
  imagePanX: 0,
  imagePanY: 0,
  showWaveform: true,
  waveformMode: 'cline',
  waveformHeight: 0.5,
  waveformOpacity: 1,
  waveformColorLeft: '7dd3fc',
  waveformColorRight: '38bdf8',
  writeSrt: true,
};

/** Force even dimensions (H.264 yuv420p) and sane bounds. */
export function normalizeVideoExportOptions(
  partial?: Partial<VideoExportOptions> | null,
): VideoExportOptions {
  const merged: VideoExportOptions = {
    ...DEFAULT_VIDEO_EXPORT_OPTIONS,
    ...(partial ?? {}),
  };

  const even = (n: number, fallback: number, min: number, max: number): number => {
    const raw = Number.isFinite(n) ? n : fallback;
    const clamped = Math.min(max, Math.max(min, Math.round(raw)));
    return clamped % 2 === 0 ? clamped : clamped + 1;
  };

  merged.width = even(merged.width, 1920, 320, 3840);
  merged.height = even(merged.height, 1080, 320, 3840);
  merged.fps = Math.min(60, Math.max(15, Math.round(merged.fps || 30)));

  merged.backgroundColor = stripHash(merged.backgroundColor) || '0a0a12';
  merged.waveformColorLeft = stripHash(merged.waveformColorLeft) || '7dd3fc';
  merged.waveformColorRight = stripHash(merged.waveformColorRight) || '38bdf8';

  merged.imageZoom = Math.min(200, Math.max(100, Math.round(merged.imageZoom || 100)));
  merged.imagePanX = Math.min(50, Math.max(-50, Number(merged.imagePanX) || 0));
  merged.imagePanY = Math.min(50, Math.max(-50, Number(merged.imagePanY) || 0));
  merged.waveformHeight = Math.min(1, Math.max(0.1, Number(merged.waveformHeight) || 0.5));
  merged.waveformOpacity = Math.min(1, Math.max(0, Number(merged.waveformOpacity) || 1));

  if (merged.background !== 'image') {
    merged.background = 'solid';
  }
  if (!['cover', 'contain', 'stretch'].includes(merged.imageFit)) {
    merged.imageFit = 'cover';
  }
  if (!['cline', 'line', 'p2p'].includes(merged.waveformMode)) {
    merged.waveformMode = 'cline';
  }

  return merged;
}

export function optionsFromPreset(presetId: Exclude<VideoExportPresetId, 'custom'>): Partial<VideoExportOptions> {
  const preset = VIDEO_EXPORT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return {};
  return {
    width: preset.width,
    height: preset.height,
    fps: preset.fps,
  };
}

export function matchPresetId(width: number, height: number, fps: number): VideoExportPresetId {
  const hit = VIDEO_EXPORT_PRESETS.find(
    (p) => p.width === width && p.height === height && p.fps === fps,
  );
  return hit?.id ?? 'custom';
}

function stripHash(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();
}
