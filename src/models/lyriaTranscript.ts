/**
 * Lyria often returns timed lyric captions, then a metadata block (Mosic/BPM/…),
 * then long prose describing each segment. Clip mode may use a single `Caption:` blob.
 */

const META_LINE_RE = /^(?:mosic|bpm|duration_secs|good_crop)\s*:/i;
const CAPTION_LINE_RE = /^caption\s*:/i;
const SEGMENT_MARK_RE = /^\[\[[^\]]+\]\]\s*$/;
/** `[0.0:]`, `[:]`, `[0.0:5.8]` prefixes on caption lines. */
const TIMESTAMP_PREFIX_RE =
  /^(?:\[\d+(?:\.\d+)?:\d+(?:\.\d+)?\]|\[\d+(?:\.\d+)?:\]|\[:\])\s*/;
const PROSE_HINT_RE =
  /\b(defined by|the segment is anchored|the vocal performance features|the atmosphere is|the instrumentation|this (?:symphonic|dark|crushing|fading)?.{0,40}track in)\b/i;

export interface ParsedLyriaTranscript {
  /** Sung / spoken lyric lines only. */
  lyrics: string;
  /** Arrangement / production commentary Lyria appended. */
  arrangementNotes: string;
}

function isMetaOrCaptionStart(line: string): boolean {
  const t = line.trim();
  return META_LINE_RE.test(t) || CAPTION_LINE_RE.test(t);
}

function stripTimestamp(line: string): string {
  return line.replace(TIMESTAMP_PREFIX_RE, '').replace(/\[\[.*?\]\]/g, '').trim();
}

function looksLikeProse(line: string): boolean {
  if (line.length >= 160) return true;
  if (PROSE_HINT_RE.test(line)) return true;
  // Dense production jargon without short lyric cadence.
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 28) return true;
  return false;
}

/**
 * Split raw Lyria text parts into lyric sheet vs arrangement commentary.
 */
export function parseLyriaTranscript(raw: string): ParsedLyriaTranscript {
  const text = (raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { lyrics: '', arrangementNotes: '' };

  const lines = text.split('\n');
  let cut = lines.findIndex(isMetaOrCaptionStart);
  // Format A sometimes repeats the timed blocks as prose after meta — cut there.
  // Format B: `Caption:` is the cut.
  if (cut < 0) {
    // Fallback: first very long prose line after we have seen short lyric-like lines.
    let sawLyric = false;
    for (let i = 0; i < lines.length; i += 1) {
      const cleaned = stripTimestamp(lines[i] || '');
      if (!cleaned || SEGMENT_MARK_RE.test((lines[i] || '').trim())) continue;
      if (!looksLikeProse(cleaned) && cleaned.length <= 100) sawLyric = true;
      else if (sawLyric && looksLikeProse(cleaned)) {
        cut = i;
        break;
      }
    }
  }

  const lyricRaw = (cut >= 0 ? lines.slice(0, cut) : lines).join('\n');
  const notesRaw = cut >= 0 ? lines.slice(cut).join('\n').trim() : '';

  const lyricOut: string[] = [];
  const spilledNotes: string[] = [];

  for (const line of lyricRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (lyricOut.length && lyricOut[lyricOut.length - 1] !== '') lyricOut.push('');
      continue;
    }
    if (SEGMENT_MARK_RE.test(trimmed)) continue;
    const body = stripTimestamp(trimmed);
    if (!body) continue;
    if (looksLikeProse(body)) {
      spilledNotes.push(body);
      continue;
    }
    lyricOut.push(body);
  }

  // Collapse excess blank lines.
  const lyrics = lyricOut
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const noteLines: string[] = [];
  for (const line of notesRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (noteLines.length && noteLines[noteLines.length - 1] !== '') noteLines.push('');
      continue;
    }
    if (META_LINE_RE.test(trimmed)) continue;
    if (SEGMENT_MARK_RE.test(trimmed)) continue;
    if (CAPTION_LINE_RE.test(trimmed)) {
      const body = trimmed.replace(CAPTION_LINE_RE, '').trim();
      if (body) noteLines.push(body);
      continue;
    }
    const body = stripTimestamp(trimmed);
    if (body) noteLines.push(body);
  }
  for (const spilled of spilledNotes) noteLines.push(spilled);

  const arrangementNotes = noteLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { lyrics, arrangementNotes };
}

/** Normalize Lyria transcript to sung lyrics only (for diff / adopt / scoring). */
export function cleanReturnedLyrics(text: string): string {
  return parseLyriaTranscript(text).lyrics;
}

/** Heuristic: messy enough that Flash should split lyrics vs commentary. */
export function shouldUseFlashTranscriptParse(raw: string): boolean {
  const text = (raw || '').trim();
  if (text.length < 80) return false;
  if (/^(?:mosic|bpm|duration_secs|good_crop)\s*:/im.test(text)) return true;
  if (/^caption\s*:/im.test(text)) return true;
  if (/\[\[[A-Za-z0-9]+\]\]/.test(text) && /\[\d+(?:\.\d+)?:\]/.test(text)) return true;
  if (PROSE_HINT_RE.test(text)) return true;
  // Long return with many long lines → likely mixed commentary.
  const longLines = text.split('\n').filter((l) => l.trim().length >= 140).length;
  return longLines >= 1 && text.length >= 400;
}

/**
 * Parse Flash JSON `{ "lyrics": "...", "arrangementNotes": "..." }`.
 * Returns null when the model did not produce usable JSON.
 */
export function parseTranscriptFlashJson(text: string): ParsedLyriaTranscript | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as {
      lyrics?: unknown;
      arrangementNotes?: unknown;
      arrangement_notes?: unknown;
    };
    const lyrics = typeof obj.lyrics === 'string' ? obj.lyrics.trim() : '';
    const notesRaw =
      typeof obj.arrangementNotes === 'string'
        ? obj.arrangementNotes
        : typeof obj.arrangement_notes === 'string'
          ? obj.arrangement_notes
          : '';
    const arrangementNotes = notesRaw.trim();
    if (!lyrics && !arrangementNotes) return null;
    return { lyrics, arrangementNotes };
  } catch {
    return null;
  }
}
