import {
  clampIntensity,
  intensityLabel,
  type Pattern,
  type PatternSong,
  type TimelineSegment,
} from './pattern';

/** Seconds of one bar at bpm + time signature. */
export function secondsPerBar(bpm: number, timeSignature: string): number {
  const [numRaw, denRaw] = (timeSignature || '4/4').split('/');
  const beats = Number(numRaw) || 4;
  const division = Number(denRaw) || 4;
  const beatSec = 60 / Math.max(1, bpm);
  // Compound meters (x/8) feel the dotted-quarter as the pulse group of 3.
  if (division === 8 && (beats === 6 || beats === 12)) {
    const groups = beats / 3;
    return groups * 3 * (beatSec * (4 / 8));
  }
  return beats * beatSec * (4 / division);
}

export function formatMmSs(totalSec: number): string {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse "m:ss", "mm:ss", or plain seconds. */
export function parseMmSs(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (seconds >= 60) return null;
  const frac = m[3] ? Number(`0.${m[3]}`) : 0;
  return minutes * 60 + seconds + frac;
}

/** Pull a duration in seconds from hints like "create a 2-minute song" or "90 seconds". */
export function parseDurationHintSeconds(hint: string | undefined, fallback: number): number {
  if (!hint?.trim()) return fallback;
  const text = hint.toLowerCase();
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)/);
  if (minMatch) return Math.round(Number(minMatch[1]) * 60);
  const secMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sec(?:ond)?s?)/);
  if (secMatch) return Math.round(Number(secMatch[1]));
  const bare = text.match(/\b(\d{2,3})\b/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 20 && n <= 240) return n;
  }
  return fallback;
}

export function defaultTimelineDuration(pattern: Pattern): number {
  const fallback = pattern.lyriaMode === 'clip' ? 30 : 120;
  return parseDurationHintSeconds(pattern.song.durationHint, fallback);
}

export function timelineTotalSec(segments: TimelineSegment[], fallback = 0): number {
  if (!segments.length) return fallback;
  return Math.max(...segments.map((s) => s.endSec), fallback);
}

export function sortTimeline(segments: TimelineSegment[]): TimelineSegment[] {
  return [...segments].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}

export function formatTimelineBlock(seg: TimelineSegment): string {
  const intensity = clampIntensity(seg.intensity);
  const label = seg.label.trim() || 'Section';
  const direction = seg.direction.trim();
  const head = `[${formatMmSs(seg.startSec)} - ${formatMmSs(seg.endSec)}] ${label}:`;
  const body = direction || `${label} section.`;
  return `${head} ${body} Intensity: ${intensity}/10 (${intensityLabel(intensity)})`;
}

export function snapToBar(sec: number, bpm: number, timeSignature: string): number {
  const bar = secondsPerBar(bpm, timeSignature);
  if (bar <= 0) return sec;
  return Math.round(sec / bar) * bar;
}

export function beatsPerBar(timeSignature: string): number {
  const [numRaw] = (timeSignature || '4/4').split('/');
  return Number(numRaw) || 4;
}

/** Sync structure tags from timeline labels (bracketed). */
export function structureFromTimeline(segments: TimelineSegment[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of sortTimeline(segments)) {
    const label = seg.label.trim();
    if (!label) continue;
    const tag = label.startsWith('[') ? label : `[${label}]`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function describeSongForTranspose(song: PatternSong): string {
  return [
    `Genre: ${song.genre}`,
    `Mood: ${song.mood}`,
    `BPM: ${song.bpm}`,
    `Meter: ${song.timeSignature}`,
    `Key: ${song.key}`,
    `Energy: ${song.energy}/100`,
    `Language: ${song.language}`,
    `Instrumental: ${song.instrumental}`,
    `Duration hint: ${song.durationHint || '(none)'}`,
    `Structure: ${song.structure.join(' -> ') || '(none)'}`,
    song.soundscape ? `Soundscape: ${song.soundscape}` : '',
    song.productionQuality ? `Production: ${song.productionQuality}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
