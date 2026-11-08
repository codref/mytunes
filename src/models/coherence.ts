import { scoreLyricOverlap } from './compilePrompt';
import type { GenerationRecord } from './generation';
import { cleanReturnedLyrics, parseLyriaTranscript } from './lyriaTranscript';
import type { Pattern } from './pattern';

export type CoherenceSeverity = 'ok' | 'info' | 'warn' | 'bad';

export type CoherenceActionKind =
  | 'adoptLyrics'
  | 'setStructure'
  | 'fixLyrics'
  | 'note';

export interface CoherenceAction {
  kind: CoherenceActionKind;
  label: string;
  /** For setStructure: string[]; for adoptLyrics: lyrics text. */
  value?: unknown;
}

export interface CoherenceFinding {
  id: string;
  severity: CoherenceSeverity;
  title: string;
  detail: string;
  action?: CoherenceAction;
}

export interface CoherenceReport {
  generationId: string | null;
  overlapScore: number | null;
  findings: CoherenceFinding[];
  returnedLyrics: string;
  sourceLyrics: string;
  arrangementNotes: string;
}

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;

function extractSections(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(SECTION_RE);
    if (m?.[1]) out.push(`[${m[1].trim()}]`);
  }
  return out;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripBrackets(tag: string): string {
  return tag.replace(/[[\]]/g, '');
}

function countSyllablesRough(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

function avgSyllablesPerLine(text: string): number | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !SECTION_RE.test(l) && !/^\(.*\)$/.test(l));
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    total += words.reduce((sum, w) => sum + countSyllablesRough(w), 0);
  }
  return total / lines.length;
}

function expectedSyllables(timeSignature: string): { low: number; high: number; label: string } {
  const [numRaw] = (timeSignature || '4/4').split('/');
  const beats = Number(numRaw) || 4;
  // Rough singable density for ~1–2 bars per line.
  const perBar = beats <= 3 ? 5 : beats <= 4 ? 8 : beats <= 6 ? 10 : 12;
  return {
    low: perBar * 0.55,
    high: perBar * 2.4,
    label: `~${Math.round(perBar)}–${Math.round(perBar * 2)} syllables/line for ${timeSignature}`,
  };
}

/**
 * Local coherence check: compare Lyria's returned transcript to the Pattern
 * that was (or is) driving generation — no extra model call.
 */
export function analyzeCoherence(
  pattern: Pattern,
  generation: GenerationRecord | null,
): CoherenceReport {
  const snapshot = generation?.patternSnapshot;
  const sourceLyrics = (snapshot?.lyrics.text ?? pattern.lyrics.text).trim();
  const rawReturn = generation?.lyricsText ?? '';
  const parsedReturn = parseLyriaTranscript(rawReturn);
  const returnedLyrics = parsedReturn.lyrics || cleanReturnedLyrics(rawReturn);
  const arrangementNotes =
    generation?.arrangementNotes?.trim() || parsedReturn.arrangementNotes;
  const song = snapshot?.song ?? pattern.song;

  const findings: CoherenceFinding[] = [];

  if (!generation) {
    findings.push({
      id: 'no-generation',
      severity: 'info',
      title: 'No take loaded',
      detail: 'Generate a clip or full song to compare Lyria’s return against your settings.',
    });
    return {
      generationId: null,
      overlapScore: null,
      findings,
      returnedLyrics: '',
      sourceLyrics,
      arrangementNotes: '',
    };
  }

  if (!returnedLyrics) {
    findings.push({
      id: 'no-transcript',
      severity: 'warn',
      title: 'No lyric transcript returned',
      detail:
        'This take has audio but Lyria did not return readable lyrics text — coherence checks are limited.',
    });
  }

  const overlap =
    generation.lyricsMatchScore ??
    (sourceLyrics && returnedLyrics ? scoreLyricOverlap(sourceLyrics, returnedLyrics) : null);

  if (sourceLyrics && returnedLyrics && overlap != null) {
    if (overlap < 0.35 || generation.lyricsMismatch) {
      findings.push({
        id: 'lyric-drift',
        severity: 'bad',
        title: 'Heavy lyric rewrite',
        detail: `Overlap ${Math.round(overlap * 100)}% with your sheet. Story/hooks may have drifted; consider Check & fix, or adopt the returned sheet if you like this take.`,
        action: {
          kind: 'adoptLyrics',
          label: 'Adopt returned lyrics',
          value: returnedLyrics,
        },
      });
    } else if (overlap < 0.65) {
      findings.push({
        id: 'lyric-soft-drift',
        severity: 'warn',
        title: 'Moderate lyric adaptation',
        detail: `Overlap ${Math.round(overlap * 100)}%. Light adaptation is normal; review the Lyrics diff if hooks matter.`,
        action: {
          kind: 'fixLyrics',
          label: 'Check & fix sheet',
        },
      });
    } else {
      findings.push({
        id: 'lyric-ok',
        severity: 'ok',
        title: 'Lyrics mostly preserved',
        detail: `Overlap ${Math.round(overlap * 100)}% — Lyria stayed close to your sheet.`,
      });
    }
  } else if (!sourceLyrics && returnedLyrics) {
    findings.push({
      id: 'model-invented',
      severity: 'info',
      title: 'Model wrote the lyrics',
      detail: 'No source sheet was sent; Lyria invented words. Adopt them if you want to iterate.',
      action: {
        kind: 'adoptLyrics',
        label: 'Adopt returned lyrics',
        value: returnedLyrics,
      },
    });
  }

  if (returnedLyrics) {
    const expected = song.structure.map(normalizeTag);
    const found = extractSections(returnedLyrics);
    const foundNorm = found.map(normalizeTag);
    const reallyMissing = song.structure.filter((tag) => {
      const body = stripBrackets(normalizeTag(tag));
      return !foundNorm.some((f) => {
        const fb = stripBrackets(f);
        return fb.includes(body) || body.includes(fb);
      });
    });

    if (song.structure.length && reallyMissing.length) {
      findings.push({
        id: 'structure-missing',
        severity: 'warn',
        title: 'Structure tags missing in return',
        detail: `Not clearly present: ${reallyMissing.join(', ')}. Lyria may have collapsed or renamed sections.`,
        action: {
          kind: 'setStructure',
          label: 'Match structure to return',
          value: found.length ? found : song.structure,
        },
      });
    } else if (song.structure.length && found.length) {
      findings.push({
        id: 'structure-ok',
        severity: 'ok',
        title: 'Section tags present',
        detail: `Returned sections: ${found.join(' → ')}.`,
      });
    }

    const extra = found.filter((tag) => {
      const body = stripBrackets(normalizeTag(tag));
      return !expected.some((e) => {
        const eb = stripBrackets(e);
        return eb.includes(body) || body.includes(eb);
      });
    });
    if (extra.length) {
      findings.push({
        id: 'structure-extra',
        severity: 'info',
        title: 'Extra sections in return',
        detail: `Lyria added: ${extra.join(', ')}.`,
        action: {
          kind: 'setStructure',
          label: 'Use returned structure',
          value: found,
        },
      });
    }

    const avg = avgSyllablesPerLine(returnedLyrics);
    const expect = expectedSyllables(song.timeSignature);
    if (avg != null) {
      if (avg < expect.low || avg > expect.high) {
        findings.push({
          id: 'meter-density',
          severity: 'warn',
          title: 'Line density vs meter',
          detail: `Returned lines average ~${avg.toFixed(1)} syllables (${expect.label}). Sheet may not scan cleanly in ${song.timeSignature} @ ${song.bpm} BPM.`,
          action: {
            kind: 'fixLyrics',
            label: 'Check & fix for meter',
          },
        });
      } else {
        findings.push({
          id: 'meter-ok',
          severity: 'ok',
          title: 'Line density looks plausible',
          detail: `~${avg.toFixed(1)} syllables/line vs ${expect.label}.`,
        });
      }
    }

    findings.push({
      id: 'settings-context',
      severity: 'info',
      title: 'Settings used for this take',
      detail: `${song.mood} ${song.genre} · ${song.bpm} BPM · ${song.timeSignature} · ${song.key} · ${song.language}`,
    });
  }

  if (song.instrumental && returnedLyrics) {
    findings.push({
      id: 'instrumental-lyrics',
      severity: 'warn',
      title: 'Instrumental flag vs vocal return',
      detail: 'Pattern is marked instrumental but Lyria returned lyric text.',
    });
  }

  const rank: Record<CoherenceSeverity, number> = { bad: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  if (arrangementNotes) {
    findings.push({
      id: 'arrangement-notes',
      severity: 'info',
      title: 'Lyria left arrangement notes',
      detail:
        'Production commentary was separated from the lyric sheet — see below. Useful for checking mood/genre feel.',
    });
  }

  return {
    generationId: generation.id,
    overlapScore: overlap,
    findings,
    returnedLyrics,
    sourceLyrics,
    arrangementNotes,
  };
}
