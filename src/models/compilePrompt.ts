import type { BandSlot, Pattern } from './pattern';

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
 * Deterministic Pattern → Lyria prompt (no LLM).
 * Follows Google Lyria prompt guide: musical direction first, then Lyrics: block.
 */
export function compilePrompt(pattern: Pattern): string {
  const { song, lyrics, slots } = pattern;
  const lines: string[] = [];

  lines.push(
    `Create a ${song.genre} song. Mood: ${song.mood}. Tempo: ${song.bpm} BPM. Key: ${song.key}. Energy: ${energyLabel(song.energy)}.`,
  );

  if (song.structure.length) {
    lines.push(`Structure: ${song.structure.join(' -> ')}.`);
  }

  if (pattern.lyriaMode === 'full' && song.durationHint?.trim()) {
    lines.push(song.durationHint.trim());
  }

  if (song.instrumental) {
    lines.push('Instrumental only, no vocals.');
  } else {
    lines.push(`Language: ${song.language}.`);
    const vocals = slots.find((s) => s.id === 'vocals');
    if (vocals?.enabled) {
      const style = String(vocals.knobs.style ?? 'expressive');
      const range = String(vocals.knobs.range ?? 'mid');
      const delivery = String(vocals.knobs.delivery ?? 'melodic');
      lines.push(
        `Vocals: ${style} ${range}-range ${delivery} delivery. ${vocals.notes.trim()}`.trim(),
      );
    }
  }

  const instrumentLines = slots
    .filter((s) => s.id !== 'vocals')
    .map(describeSlot)
    .filter((line): line is string => Boolean(line));

  if (instrumentLines.length) {
    lines.push('Instrumentation:');
    for (const line of instrumentLines) {
      lines.push(`- ${line}`);
    }
  }

  lines.push(
    'Be specific about arrangement and dynamics. Do not imitate any specific copyrighted artist voice or lyrics.',
  );

  if (!song.instrumental && lyrics.text.trim()) {
    lines.push('');
    lines.push('Lyrics:');
    lines.push(lyrics.text.trim());
  } else if (!song.instrumental && !lyrics.text.trim()) {
    lines.push(
      `Theme for lyrics: an original ${song.mood} ${song.genre} song in ${song.language}.`,
    );
  }

  return lines.join('\n').trim();
}

export async function hashPrompt(compiledPrompt: string, mode: string): Promise<string> {
  const data = new TextEncoder().encode(`${mode}::${compiledPrompt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
