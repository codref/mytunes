import { compilePrompt } from '../../src/models/compilePrompt';
import type { Pattern } from '../../src/models/pattern';
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
    `Refine this into an excellent Lyria music prompt. Keep any Lyrics: block intact if present.\n\n${draft}`,
    LYRIA_SYSTEM_FOR_FLASH,
  );
  return {
    compiledPrompt: result.text.trim(),
    costUsd: result.costUsd,
    model: result.model,
  };
}

export async function writeLyricsWithFlash(pattern: Pattern): Promise<{
  lyrics: string;
  costUsd: number;
  model: string;
}> {
  const structure = pattern.song.structure.join(' ');
  const result = await flashGenerate(
    `Write original song lyrics in ${pattern.song.language} for a ${pattern.song.mood} ${pattern.song.genre} song.
Use these section tags on their own lines: ${structure}.
Do not copy copyrighted lyrics. Return only the lyrics with section tags.`,
    'You are a songwriter. Output lyrics only, with [Verse]/[Chorus]/[Bridge] style section tags.',
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
