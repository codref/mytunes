/**
 * Timed lyric cues for SRT export.
 * Lyria prefixes lines with `[0.0:]`, `[:]`, or `[0.0:5.8]`.
 */

const META_LINE_RE = /^(?:mosic|bpm|duration_secs|good_crop)\s*:/i;
const CAPTION_LINE_RE = /^caption\s*:/i;
const SEGMENT_MARK_RE = /^\[\[[^\]]+\]\]\s*$/;
const TIMESTAMP_MATCH_RE =
  /^\[(?:(\d+(?:\.\d+)?)?)(?::(\d+(?:\.\d+)?)?)?\]\s*/;
const PROSE_HINT_RE =
  /\b(defined by|the segment is anchored|the vocal performance features|the atmosphere is|the instrumentation|this (?:symphonic|dark|crushing|fading)?.{0,40}track in)\b/i;

export interface CaptionCue {
  startSec: number;
  /** Omitted when Lyria only gave a start; filled from next cue or duration at export. */
  endSec?: number;
  text: string;
}

function looksLikeProse(line: string): boolean {
  if (line.length >= 160) return true;
  if (PROSE_HINT_RE.test(line)) return true;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 28;
}

function parseTimestampPrefix(
  line: string,
): { startSec: number | null; endSec: number | null; rest: string } | null {
  const m = line.match(TIMESTAMP_MATCH_RE);
  if (!m) return null;
  const startRaw = m[1];
  const endRaw = m[2];
  const startSec = startRaw != null && startRaw !== '' ? Number(startRaw) : null;
  const endSec = endRaw != null && endRaw !== '' ? Number(endRaw) : null;
  return {
    startSec: Number.isFinite(startSec) ? startSec : null,
    endSec: Number.isFinite(endSec) ? endSec : null,
    rest: line.slice(m[0].length).replace(/\[\[.*?\]\]/g, '').trim(),
  };
}

/**
 * Extract timed lyric cues from raw Lyria return text (before timestamp stripping).
 */
export function extractCaptionCues(rawLyriaText: string): CaptionCue[] {
  const text = (rawLyriaText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const cues: CaptionCue[] = [];
  let lastStart: number | null = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (META_LINE_RE.test(trimmed) || CAPTION_LINE_RE.test(trimmed)) break;
    if (SEGMENT_MARK_RE.test(trimmed)) continue;

    const ts = parseTimestampPrefix(trimmed);
    if (!ts) {
      // Untimed lyric-like line after we already have cues — attach loosely.
      if (cues.length && !looksLikeProse(trimmed) && trimmed.length <= 100) {
        const prev = cues[cues.length - 1]!;
        prev.text = `${prev.text} ${trimmed}`.trim();
      }
      continue;
    }

    const body = ts.rest;
    if (!body || looksLikeProse(body)) continue;

    let startSec = ts.startSec;
    if (startSec == null) {
      // `[:]` — continue from last known start with a small bump, or skip if none.
      if (lastStart == null) continue;
      startSec = lastStart;
    }
    lastStart = startSec;

    const cue: CaptionCue = { startSec, text: body };
    if (ts.endSec != null && ts.endSec > startSec) {
      cue.endSec = ts.endSec;
    }
    cues.push(cue);
  }

  return fillMissingEnds(cues);
}

/** Infer missing endSec from the next cue’s start (last cue left open). */
export function fillMissingEnds(cues: CaptionCue[], durationSec?: number): CaptionCue[] {
  if (!cues.length) return [];
  return cues.map((cue, i) => {
    if (cue.endSec != null && cue.endSec > cue.startSec) {
      return { ...cue };
    }
    const next = cues[i + 1];
    let endSec = next ? next.startSec : durationSec;
    if (endSec == null || endSec <= cue.startSec) {
      endSec = cue.startSec + 2;
    }
    if (durationSec != null && endSec > durationSec) {
      endSec = durationSec;
    }
    // Tiny gap so adjacent cues don't overlap awkwardly in players.
    if (next && endSec >= next.startSec) {
      endSec = Math.max(cue.startSec + 0.05, next.startSec - 0.05);
    }
    return { ...cue, endSec };
  });
}

/**
 * Fallback when no Lyria timestamps exist: evenly space lyric lines across duration.
 */
export function cuesFromPlainLyrics(lyrics: string, durationSec: number): CaptionCue[] {
  const lines = (lyrics || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !SEGMENT_MARK_RE.test(l) && !/^\[(?:verse|chorus|bridge|outro|intro)/i.test(l));

  if (!lines.length || !(durationSec > 0)) return [];

  const slice = durationSec / lines.length;
  return lines.map((text, i) => {
    const startSec = i * slice;
    const endSec = i === lines.length - 1 ? durationSec : (i + 1) * slice;
    return { startSec, endSec, text };
  });
}

function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** Serialize cues to standard SRT. */
export function cuesToSrt(cues: CaptionCue[]): string {
  const closed = fillMissingEnds(cues);
  if (!closed.length) return '';
  return (
    closed
      .map((cue, i) => {
        const end = cue.endSec ?? cue.startSec + 2;
        return `${i + 1}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(end)}\n${cue.text}`;
      })
      .join('\n\n') + '\n'
  );
}

/** Resolve cues for export: timed Lyria cues, else even-split plain lyrics. */
export function resolveExportCues(
  captionCues: CaptionCue[] | undefined,
  lyricsText: string | undefined,
  durationSec: number,
): CaptionCue[] {
  if (captionCues?.length) {
    return fillMissingEnds(captionCues, durationSec);
  }
  return cuesFromPlainLyrics(lyricsText ?? '', durationSec);
}
