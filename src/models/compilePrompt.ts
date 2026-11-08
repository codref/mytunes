import { normalizePatternSong, type BandSlot, type Pattern, type PatternSong } from './pattern';

function energyLabel(energy: number): string {
  if (energy < 30) return 'low energy, restrained';
  if (energy < 60) return 'moderate energy';
  if (energy < 80) return 'high energy, driving';
  return 'explosive, peak intensity';
}

function describeSlot(slot: BandSlot): string | null {
  if (!slot.enabled) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(slot.knobs)) {
    parts.push(`${key}: ${String(value)}`);
  }
  const notes = slot.notes.trim();
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  const noteText = notes ? ` Notes: ${notes}` : '';
  return `${slot.id}${detail}.${noteText}`;
}

/**
 * Pull parenthetical stage directions out of the lyric sheet so Lyria
 * does not treat them as sung text (parentheses mean backing-vocal echoes in Lyria).
 */
export function splitLyricStageDirections(lyrics: string): {
  sungLyrics: string;
  stageNotes: string[];
} {
  const stageNotes: string[] = [];
  const sung = lyrics
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const onlyDirection = trimmed.match(/^\((.+)\)\s*$/);
      if (onlyDirection?.[1]) {
        stageNotes.push(onlyDirection[1].trim());
        return '';
      }
      return line.replace(/\(([^)]+)\)/g, (_full, inner: string) => {
        const note = inner.trim();
        if (!note) return '';
        if (note.split(/\s+/).length <= 4) return `(${note})`;
        stageNotes.push(note);
        return '';
      });
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { sungLyrics: sung, stageNotes };
}

function arrangementLines(pattern: Pattern, stageNotes: string[]): string[] {
  const { song, slots } = pattern;
  const lines: string[] = [];

  lines.push(
    `${song.genre}. Mood: ${song.mood}. Tempo: ${song.bpm} BPM in ${song.timeSignature}. Key: ${song.key}. Energy: ${energyLabel(song.energy)}.`,
  );

  if (song.structure.length) {
    lines.push(`Structure: ${song.structure.join(' -> ')}.`);
  }

  if (pattern.lyriaMode === 'full' && song.durationHint?.trim()) {
    lines.push(song.durationHint.trim());
  }

  if (song.instrumental) {
    lines.push('Instrumental only, no vocals.');
    return lines;
  }

  lines.push(`Language: ${song.language}.`);
  const vocals = slots.find((s) => s.id === 'vocals');
  if (vocals?.enabled) {
    const style = String(vocals.knobs.style ?? 'expressive');
    const range = String(vocals.knobs.range ?? 'mid');
    const delivery = String(vocals.knobs.delivery ?? 'melodic');
    lines.push(`Vocals: ${style} ${range}-range ${delivery} delivery.`);
    if (vocals.notes.trim()) lines.push(`Vocal notes: ${vocals.notes.trim()}`);
  }

  const instrumentLines = slots
    .filter((s) => s.id !== 'vocals')
    .map(describeSlot)
    .filter((line): line is string => Boolean(line));

  if (instrumentLines.length) {
    lines.push(`Instrumentation: ${instrumentLines.join('; ')}`);
  }

  if (stageNotes.length) {
    const short = stageNotes
      .map((n) => n.replace(/\s+/g, ' ').trim())
      .filter((n) => n.length > 0 && n.length < 80)
      .slice(0, 6);
    if (short.length) {
      lines.push(`Arrangement cues: ${short.join('; ')}.`);
    }
  }

  return lines;
}

/** Short themed context so Lyria knows the story even if it softens wording. */
export function buildSongTheme(song: PatternSong, sungLyrics: string): string[] {
  const lines: string[] = [];
  lines.push(
    `Song context: an original ${song.mood} ${song.genre} piece in ${song.language}, ${song.bpm} BPM in ${song.timeSignature}, ${song.key}.`,
  );

  const hooks = sungLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('['))
    .slice(0, 4);
  const keywords = lyricFingerprints(sungLyrics).slice(0, 10);

  if (keywords.length) {
    lines.push(`Themes and imagery to keep: ${keywords.join(', ')}.`);
  }
  if (hooks.length) {
    lines.push('Hook lines to preserve closely when possible:');
    for (const hook of hooks) {
      lines.push(`- ${hook}`);
    }
  }

  lines.push(
    'Vocal writing: follow the source Lyrics below. You may change wording slightly for singability, flow, or safety, but keep the same story, section structure, refrains, and core images. Do not replace them with an unrelated new song.',
  );
  return lines;
}

function formatLyricsBlock(sungLyrics: string): string {
  const body = sungLyrics
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return `Lyrics:\n${body}`;
}

export type CompilePromptOptions = {
  /** Put Lyrics: before arrangement (better fidelity for custom sheets). */
  lyricsFirst?: boolean;
};

/**
 * Deterministic Pattern → Lyria prompt (no LLM).
 * With custom lyrics: themed song context + source sheet allowing minimal adaptation.
 */
export function compilePrompt(pattern: Pattern, options?: CompilePromptOptions): string {
  const { song, lyrics } = pattern;
  normalizePatternSong(song);
  const hasLyrics = !song.instrumental && Boolean(lyrics.text.trim());
  const lyricsFirst = options?.lyricsFirst ?? hasLyrics;

  if (!hasLyrics) {
    const lines = arrangementLines(pattern, []);
    if (!song.instrumental) {
      lines.push(
        `Song context: an original ${song.mood} ${song.genre} song in ${song.language}.`,
      );
      lines.push(
        `Theme for lyrics: invent fitting original words for this mood and genre (no famous rhymes or real artist references).`,
      );
    }
    return lines.join('\n').trim();
  }

  const { sungLyrics, stageNotes } = splitLyricStageDirections(lyrics.text);
  const sung = sungLyrics || lyrics.text.trim();
  const theme = buildSongTheme(song, sung);
  const music = arrangementLines(pattern, stageNotes);

  if (lyricsFirst) {
    return [
      ...theme,
      '',
      'Source lyrics (adapt minimally if needed):',
      formatLyricsBlock(sung),
      '',
      'Musical direction:',
      ...music,
    ]
      .join('\n')
      .trim();
  }

  return [...theme, ...music, '', 'Source lyrics (adapt minimally if needed):', formatLyricsBlock(sung)]
    .join('\n')
    .trim();
}

/** Significant tokens from a lyric sheet for crude fidelity checks. */
export function lyricFingerprints(text: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'that',
    'with',
    'from',
    'this',
    'your',
    'our',
    'for',
    'you',
    'are',
    'was',
    'were',
    'will',
    'have',
    'has',
    'but',
    'not',
    'into',
    'onto',
    'a',
    'an',
    'of',
    'to',
    'in',
    'on',
    'is',
    'it',
    'we',
    'they',
    'i',
    'my',
    'me',
    'be',
    'as',
    'by',
    'or',
    'at',
    'so',
    'if',
    'no',
    'yes',
  ]);
  const words = text
    .toLowerCase()
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(words)].slice(0, 40);
}

export function scoreLyricOverlap(userLyrics: string, returnedText: string): number {
  const needles = lyricFingerprints(userLyrics);
  if (!needles.length) return 1;
  const hay = returnedText.toLowerCase();
  let hits = 0;
  for (const w of needles) {
    if (hay.includes(w)) hits += 1;
  }
  return hits / needles.length;
}

export async function hashPrompt(compiledPrompt: string, mode: string): Promise<string> {
  const data = new TextEncoder().encode(`${mode}::${compiledPrompt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
