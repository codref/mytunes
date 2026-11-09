import { compilePrompt } from '../../src/models/compilePrompt';
import { normalizePattern, type Pattern } from '../../src/models/pattern';
import { flashGenerate, LYRIA_SYSTEM_FOR_FLASH } from './geminiClient';

export function compileLocal(pattern: Pattern): string {
  return compilePrompt(pattern);
}

export async function refineWithFlash(pattern: Pattern): Promise<{
  compiledPrompt: string;
  costUsd: number;
  model: string;
}> {
  const draft = compilePrompt(pattern);
  const result = await flashGenerate(
    `Refine this into an excellent Lyria music prompt.
Keep a clear Song context/theme. Prefer lyrics-first (context → Lyrics: → Musical direction).
Preserve the source Lyrics: block as the story reference; instruct Lyria it may adapt wording slightly for singability/safety but must keep structure, refrains, and meaning — not invent an unrelated song.
Keep arrangement short. Never name real artists.\n\n${draft}`,
    LYRIA_SYSTEM_FOR_FLASH,
  );
  return {
    compiledPrompt: result.text.trim(),
    costUsd: result.costUsd,
    model: result.model,
  };
}

function meterGuidance(timeSignature: string, bpm: number): string {
  const sig = timeSignature.trim() || '4/4';
  const [numRaw, denRaw] = sig.split('/');
  const beats = Number(numRaw);
  const division = Number(denRaw);
  let lineHint =
    'Keep each sung line roughly 1–2 bars long with a clear stress on beat 1; avoid cramming extra syllables into a bar.';
  if (beats === 3 && division === 4) {
    lineHint =
      'Write in triple meter: lines of about 1–2 bars (3–6 beats), with a waltz-like strong–weak–weak feel.';
  } else if (beats === 6 && division === 8) {
    lineHint =
      'Write in compound duple: feel two groups of three eighths; lines of about 1–2 bars with a lilting 1-and-a 2-and-a pulse.';
  } else if (beats === 12 && division === 8) {
    lineHint =
      'Write in compound quadruple: four groups of three; longer flowing lines that land on the main beats.';
  } else if (beats === 5 || beats === 7) {
    lineHint = `Respect the uneven ${sig} pulse; group syllables so phrase ends land on bar lines, not mid-bar dumps.`;
  } else if (beats === 2 && division === 4) {
    lineHint = 'Write short, punchy lines of about 1–2 bars (2–4 beats) with a march-like strong–weak feel.';
  }
  return `Meter: ${sig} at ${bpm} BPM. ${lineHint}`;
}

function songConfigBlock(pattern: Pattern): string {
  const normalized = normalizePattern(pattern);
  const { song, slots } = normalized;
  const lines = [
    'Song settings:',
    `- Language: ${song.language}`,
    `- Genre: ${song.genre}`,
    `- Mood: ${song.mood}`,
    `- Key: ${song.key}`,
    `- Energy: ${song.energy}/100`,
    `- ${meterGuidance(song.timeSignature, song.bpm)}`,
  ];
  if (song.soundscape?.trim()) lines.push(`- Soundscape: ${song.soundscape.trim()}`);
  if (song.productionQuality?.trim()) {
    lines.push(`- Production: ${song.productionQuality.trim()}`);
  }
  if (song.auto?.structure) {
    lines.push(
      '- Structure: choose a fitting section layout with [Verse]/[Chorus]/[Bridge]-style tags.',
    );
  } else {
    const structure = song.structure.length ? song.structure.join(' -> ') : '(none set)';
    lines.push(`- Structure (use these section tags on their own lines): ${structure}`);
  }
  const vocals = slots.find((s) => s.id === 'vocals');
  if (vocals?.enabled && vocals.voices && vocals.voices.length > 1) {
    lines.push(
      `- Voices: ${vocals.voices.map((v) => v.name).join(', ')}. Tag lines with [Voice: Name] for each singer; untagged lines are the lead.`,
    );
  }
  return lines.join('\n');
}

const LYRICS_SYSTEM =
  'You are a songwriter. Output lyrics only, with [Verse]/[Chorus]/[Bridge] style section tags. Respect the given meter and tempo when shaping line length and stress.';

export async function writeLyricsWithFlash(pattern: Pattern): Promise<{
  lyrics: string;
  costUsd: number;
  model: string;
}> {
  const { song } = normalizePattern(pattern);
  const result = await flashGenerate(
    `Write original song lyrics for this configuration.
${songConfigBlock(pattern)}
Scan for singability in ${song.timeSignature}: consistent syllable density per bar within a section, natural stresses on strong beats, and refrains that land cleanly on the downbeat.
Do not copy copyrighted lyrics. Return only the lyrics with section tags.`,
    LYRICS_SYSTEM,
  );
  return {
    lyrics: result.text.trim(),
    costUsd: result.costUsd,
    model: result.model,
  };
}

/** Revise existing lyrics so they scan with current meter/tempo/structure/knobs. */
export async function fixLyricsWithFlash(pattern: Pattern): Promise<{
  lyrics: string;
  costUsd: number;
  model: string;
}> {
  const normalized = normalizePattern(pattern);
  const draft = normalized.lyrics.text.trim();
  if (!draft) {
    throw new Error('Add lyrics first, then use Check & fix.');
  }
  const { song } = normalized;
  const result = await flashGenerate(
    `Check and fix these lyrics so they fit the current song settings.
${songConfigBlock(normalized)}

Goals:
- Preserve the story, hooks, imagery, and language intent; do not invent an unrelated song.
- Align section tags with the Structure list (add/rename/reorder tags only as needed).
- Fix meter/scan: syllable density, line length, and stress should sing in ${song.timeSignature} at ${song.bpm} BPM.
- Match tone to mood (${song.mood}) and genre (${song.genre}); keep language as ${song.language}.
- Tighten awkward phrasing; keep refrains landing on the downbeat when possible.
- Keep parenthetical stage directions if present.

Current lyrics:
${draft}

Return only the revised lyrics with section tags.`,
    LYRICS_SYSTEM,
  );
  return {
    lyrics: result.text.trim(),
    costUsd: result.costUsd,
    model: result.model,
  };
}

export async function hashPromptNode(compiledPrompt: string, mode: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(`${mode}::${compiledPrompt}`).digest('hex');
}
