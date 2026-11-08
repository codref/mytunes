import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { estimateMusicCost } from '../../src/models/budget';
import type { Pattern } from '../../src/models/pattern';
import {
  appendLedger,
  checkBudget,
  getBudgetSnapshot,
  setBudgetLimits,
} from './budgetLedger';
import { getBackendStatus, loadEnvFile } from './env';
import {
  findGenerationByHash,
  listPatterns,
  loadGenerations,
  saveGeneration,
  savePattern,
  deletePattern,
  loadPattern,
} from './generationStore';
import { generateLyriaMusic, KeyMissingError } from './geminiClient';
import {
  compileLocal,
  hashPromptNode,
  refineWithFlash,
  writeLyricsWithFlash,
} from './promptCompiler';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errMessage(error: unknown): string {
  if (error instanceof KeyMissingError) return error.message;
  if (error instanceof Error) {
    const nested = (error as Error & { error?: { message?: string } }).error?.message;
    if (nested) return String(nested);
    return error.message || 'Unknown error';
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

const channels = [
  'mytunes:getKeyStatus',
  'mytunes:compilePrompt',
  'mytunes:refinePrompt',
  'mytunes:writeLyrics',
  'mytunes:generateMusic',
  'mytunes:budget:get',
  'mytunes:budget:setLimits',
  'mytunes:budget:check',
  'mytunes:generations:list',
  'mytunes:patterns:list',
  'mytunes:patterns:save',
  'mytunes:patterns:load',
  'mytunes:patterns:delete',
] as const;

function handle(
  channel: (typeof channels)[number],
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await fn(event, ...args);
      return ipcSafe(result ?? null);
    } catch (error) {
      // Plain Error only — SDK errors are not structured-cloneable over IPC
      throw new Error(errMessage(error));
    }
  });
}

export function registerIpcHandlers(): void {
  loadEnvFile();
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  handle('mytunes:getKeyStatus', () => getBackendStatus());

  handle('mytunes:compilePrompt', (_e, pattern) => {
    const compiledPrompt = compileLocal(pattern as Pattern);
    return { compiledPrompt };
  });

  handle('mytunes:refinePrompt', async (_e, patternRaw) => {
    const pattern = patternRaw as Pattern;
    const gate = checkBudget(0.001);
    if (gate.gate === 'hard') {
      throw new Error('Budget hard limit reached. Raise limits before refining.');
    }
    try {
      const result = await refineWithFlash(pattern);
      const state = appendLedger({
        kind: 'flash',
        model: result.model,
        costUsd: result.costUsd,
        patternId: pattern.id,
        ok: true,
        note: 'refinePrompt',
      });
      return {
        compiledPrompt: result.compiledPrompt,
        costUsd: result.costUsd,
        model: result.model,
        budget: state,
      };
    } catch (error) {
      appendLedger({
        kind: 'failed',
        model: 'flash',
        costUsd: 0,
        patternId: pattern.id,
        ok: false,
        note: errMessage(error),
      });
      throw error;
    }
  });

  handle('mytunes:writeLyrics', async (_e, patternRaw) => {
    const pattern = patternRaw as Pattern;
    const gate = checkBudget(0.001);
    if (gate.gate === 'hard') {
      throw new Error('Budget hard limit reached. Raise limits before writing lyrics.');
    }
    try {
      const result = await writeLyricsWithFlash(pattern);
      const state = appendLedger({
        kind: 'flash',
        model: result.model,
        costUsd: result.costUsd,
        patternId: pattern.id,
        ok: true,
        note: 'writeLyrics',
      });
      return {
        lyrics: result.lyrics,
        costUsd: result.costUsd,
        model: result.model,
        budget: state,
      };
    } catch (error) {
      appendLedger({
        kind: 'failed',
        model: 'flash',
        costUsd: 0,
        patternId: pattern.id,
        ok: false,
        note: errMessage(error),
      });
      throw error;
    }
  });

  handle('mytunes:generateMusic', async (_e, payloadRaw) => {
    const payload = payloadRaw as {
      pattern: Pattern;
      compiledPrompt: string;
      mode: 'clip' | 'full';
      force?: boolean;
    };
    const { pattern, compiledPrompt, mode, force } = payload;
    const cost = estimateMusicCost(mode);
    const promptHash = await hashPromptNode(compiledPrompt, mode);

    const existing = findGenerationByHash(promptHash, mode);
    if (existing && !force) {
      return {
        reused: true,
        generation: existing,
        budget: getBudgetSnapshot(),
      };
    }

    const gate = checkBudget(cost);
    if (gate.gate === 'hard') {
      appendLedger({
        kind: 'blocked',
        model: mode,
        costUsd: 0,
        patternId: pattern.id,
        promptHash,
        ok: false,
        note: 'hard budget',
      });
      throw new Error(
        `Budget hard limit would be exceeded (next ${mode} costs $${cost.toFixed(2)}).`,
      );
    }

    try {
      const lyria = await generateLyriaMusic(compiledPrompt, mode);
      const generation = saveGeneration({
        pattern,
        mode,
        model: lyria.model,
        costUsd: lyria.costUsd,
        promptHash,
        compiledPrompt,
        lyricsText: lyria.lyricsText,
        audioBase64: lyria.audioBase64,
      });
      const budget = appendLedger({
        kind: mode,
        model: lyria.model,
        costUsd: lyria.costUsd,
        patternId: pattern.id,
        promptHash,
        ok: true,
      });
      return {
        reused: false,
        generation,
        budget,
        gate: gate.gate,
      };
    } catch (error) {
      appendLedger({
        kind: 'failed',
        model: mode,
        costUsd: 0,
        patternId: pattern.id,
        promptHash,
        ok: false,
        note: errMessage(error),
      });
      throw error;
    }
  });

  handle('mytunes:budget:get', () => getBudgetSnapshot());
  handle('mytunes:budget:setLimits', (_e, limitsRaw) => {
    const limits = limitsRaw as { sessionLimitUsd: number; dayLimitUsd: number };
    return setBudgetLimits(limits.sessionLimitUsd, limits.dayLimitUsd);
  });
  handle('mytunes:budget:check', (_e, nextCost) => checkBudget(Number(nextCost)));

  handle('mytunes:generations:list', () => loadGenerations());
  handle('mytunes:patterns:list', () => listPatterns());
  handle('mytunes:patterns:save', (_e, pattern) => savePattern(pattern as Pattern));
  handle('mytunes:patterns:load', (_e, id) => loadPattern(String(id)));
  handle('mytunes:patterns:delete', (_e, id) => {
    deletePattern(String(id));
    return { ok: true };
  });
}

export { errMessage };
