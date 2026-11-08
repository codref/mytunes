import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { AssistantChatRequest, AssistantConversation, AssistantEvent } from '../../src/models/assistant';
import { estimateMusicCost } from '../../src/models/budget';
import type { Pattern } from '../../src/models/pattern';
import type { AppSettingsUpdate } from '../../src/models/settings';
import type { AppSession, Song } from '../../src/models/song';
import { runAssistantTurn } from './assistantAgent';
import {
  deleteConversation,
  listConversations,
  loadConversation,
  saveConversation,
} from './assistantConversations';
import {
  appendLedger,
  checkBudget,
  getBudgetSnapshot,
  setBudgetLimits,
} from './budgetLedger';
import { getBackendStatus, loadEnvFile } from './env';
import {
  findGenerationByHash,
  findGenerationById,
  listPatterns,
  loadGenerations,
  patchGeneration,
  saveGeneration,
  savePattern,
  deletePattern,
  loadPattern,
} from './generationStore';
import {
  generateLyriaMusic,
  KeyMissingError,
  resetAiClient,
  splitLyriaTranscriptWithFlash,
} from './geminiClient';
import { scoreLyricOverlap } from '../../src/models/compilePrompt';
import {
  compileLocal,
  fixLyricsWithFlash,
  hashPromptNode,
  refineWithFlash,
  writeLyricsWithFlash,
} from './promptCompiler';
import {
  getPatternDefaults,
  toPublicSettings,
  updateSettings,
} from './settingsStore';
import {
  deleteSong,
  ensureSongForPattern,
  getSession,
  listSongs,
  loadSong,
  saveSong,
  setSession,
} from './songStore';

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
  'mytunes:settings:get',
  'mytunes:settings:set',
  'mytunes:settings:patternDefaults',
  'mytunes:compilePrompt',
  'mytunes:refinePrompt',
  'mytunes:writeLyrics',
  'mytunes:fixLyrics',
  'mytunes:splitLyriaTranscript',
  'mytunes:generateMusic',
  'mytunes:budget:get',
  'mytunes:budget:setLimits',
  'mytunes:budget:check',
  'mytunes:generations:list',
  'mytunes:songs:list',
  'mytunes:songs:save',
  'mytunes:songs:load',
  'mytunes:songs:delete',
  'mytunes:session:get',
  'mytunes:session:set',
  'mytunes:patterns:list',
  'mytunes:patterns:save',
  'mytunes:patterns:load',
  'mytunes:patterns:delete',
  'mytunes:assistantChat',
  'mytunes:assistantCancel',
  'mytunes:assistant:list',
  'mytunes:assistant:save',
  'mytunes:assistant:load',
  'mytunes:assistant:delete',
] as const;

const abortControllers = new Map<string, AbortController>();

function emitAssistant(event: IpcMainInvokeEvent, payload: AssistantEvent): void {
  event.sender.send('mytunes:assistant:event', ipcSafe(payload));
}

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
      throw new Error(errMessage(error), { cause: error });
    }
  });
}

export function registerIpcHandlers(): void {
  loadEnvFile();
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  handle('mytunes:getKeyStatus', () => getBackendStatus());

  handle('mytunes:settings:get', () => toPublicSettings());
  handle('mytunes:settings:set', (_e, updateRaw) => {
    const update = updateRaw as AppSettingsUpdate;
    updateSettings(update);
    resetAiClient();
    return toPublicSettings();
  });
  handle('mytunes:settings:patternDefaults', () => getPatternDefaults());

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

  handle('mytunes:fixLyrics', async (_e, patternRaw) => {
    const pattern = patternRaw as Pattern;
    const gate = checkBudget(0.001);
    if (gate.gate === 'hard') {
      throw new Error('Budget hard limit reached. Raise limits before fixing lyrics.');
    }
    try {
      const result = await fixLyricsWithFlash(pattern);
      const state = appendLedger({
        kind: 'flash',
        model: result.model,
        costUsd: result.costUsd,
        patternId: pattern.id,
        ok: true,
        note: 'fixLyrics',
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

  handle('mytunes:splitLyriaTranscript', async (_e, payloadRaw) => {
    const payload = payloadRaw as { generationId?: string; rawText?: string };
    const generationId = payload.generationId ? String(payload.generationId) : '';
    const existing = generationId ? findGenerationById(generationId) : null;
    const rawText = String(payload.rawText ?? existing?.lyricsText ?? '').trim();
    if (!rawText) {
      throw new Error('No Lyria transcript to split.');
    }
    const gate = checkBudget(0.001);
    if (gate.gate === 'hard') {
      throw new Error('Budget hard limit reached. Raise limits before splitting the transcript.');
    }
    try {
      const split = await splitLyriaTranscriptWithFlash(rawText);
      const sourceLyrics = existing?.patternSnapshot?.lyrics?.text?.trim() || '';
      const lyricsMatchScore = sourceLyrics
        ? scoreLyricOverlap(sourceLyrics, split.lyrics)
        : existing?.lyricsMatchScore;
      const lyricsMismatch =
        sourceLyrics && lyricsMatchScore != null ? lyricsMatchScore < 0.08 : existing?.lyricsMismatch;

      let generation = existing;
      if (existing) {
        generation = patchGeneration(existing.id, {
          lyricsText: split.lyrics,
          arrangementNotes: split.arrangementNotes,
          ...(lyricsMatchScore != null ? { lyricsMatchScore } : {}),
          ...(lyricsMismatch != null ? { lyricsMismatch } : {}),
        });
      }

      const budget = appendLedger({
        kind: 'flash',
        model: split.model || 'flash',
        costUsd: split.costUsd,
        ok: true,
        note: split.usedFlash ? 'splitLyriaTranscript' : 'splitLyriaTranscript:heuristic',
        ...(existing?.patternId ? { patternId: existing.patternId } : {}),
      });

      return {
        lyrics: split.lyrics,
        arrangementNotes: split.arrangementNotes,
        usedFlash: split.usedFlash,
        costUsd: split.costUsd,
        model: split.model,
        generation,
        budget,
      };
    } catch (error) {
      appendLedger({
        kind: 'failed',
        model: 'flash',
        costUsd: 0,
        ok: false,
        note: errMessage(error),
        ...(existing?.patternId ? { patternId: existing.patternId } : {}),
      });
      throw error;
    }
  });

  handle('mytunes:generateMusic', async (_e, payloadRaw) => {
    const payload = payloadRaw as {
      pattern: Pattern;
      compiledPrompt: string;
      mode: 'clip' | 'full';
      songId?: string | null;
      force?: boolean;
    };
    const { pattern, compiledPrompt, mode, force } = payload;
    const cost = estimateMusicCost(mode);
    const promptHash = await hashPromptNode(compiledPrompt, mode);

    let song = ensureSongForPattern(pattern, payload.songId);

    const existing = findGenerationByHash(promptHash, mode, song.id);
    if (existing && !force) {
      song.activeGenerationId = existing.id;
      song = saveSong(song);
      setSession({ lastSongId: song.id });
      return {
        reused: true,
        generation: existing,
        song,
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
        songId: song.id,
        pattern,
        mode,
        model: lyria.model,
        costUsd: lyria.costUsd,
        promptHash,
        compiledPrompt,
        audioBase64: lyria.audioBase64,
        ...(lyria.lyricsText ? { lyricsText: lyria.lyricsText } : {}),
        ...(lyria.arrangementNotes ? { arrangementNotes: lyria.arrangementNotes } : {}),
        ...(lyria.lyricsMatchScore != null
          ? { lyricsMatchScore: lyria.lyricsMatchScore }
          : {}),
        ...(lyria.lyricsMismatch != null ? { lyricsMismatch: lyria.lyricsMismatch } : {}),
      });
      song.activeGenerationId = generation.id;
      song.pattern = structuredClone(pattern);
      song.name = pattern.name || song.name;
      song = saveSong(song);
      setSession({ lastSongId: song.id });
      let budget = appendLedger({
        kind: mode,
        model: lyria.model,
        costUsd: lyria.costUsd,
        patternId: pattern.id,
        promptHash,
        ok: true,
      });
      if (lyria.flashParseCostUsd && lyria.flashParseCostUsd > 0) {
        budget = appendLedger({
          kind: 'flash',
          model: lyria.flashParseModel || 'flash',
          costUsd: lyria.flashParseCostUsd,
          patternId: pattern.id,
          promptHash,
          ok: true,
          note: 'splitLyriaTranscript',
        });
      }
      return {
        reused: false,
        generation,
        song,
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

  handle('mytunes:generations:list', (_e, filterRaw) => {
    const filter = (filterRaw ?? {}) as { songId?: string };
    return loadGenerations(filter.songId ? { songId: filter.songId } : undefined);
  });

  handle('mytunes:songs:list', () => listSongs());
  handle('mytunes:songs:save', (_e, songRaw) => {
    const song = saveSong(songRaw as Song);
    setSession({ lastSongId: song.id });
    return song;
  });
  handle('mytunes:songs:load', (_e, id) => {
    const song = loadSong(String(id));
    if (song) setSession({ lastSongId: song.id });
    return song;
  });
  handle('mytunes:songs:delete', (_e, id) => deleteSong(String(id)));
  handle('mytunes:session:get', () => getSession());
  handle('mytunes:session:set', (_e, update) => setSession(update as Partial<AppSession>));

  handle('mytunes:patterns:list', () => listPatterns());
  handle('mytunes:patterns:save', (_e, pattern) => savePattern(pattern as Pattern));
  handle('mytunes:patterns:load', (_e, id) => loadPattern(String(id)));
  handle('mytunes:patterns:delete', (_e, id) => {
    deletePattern(String(id));
    return { ok: true };
  });

  handle('mytunes:assistantChat', async (event, requestRaw) => {
    const request = requestRaw as AssistantChatRequest;
    const gate = checkBudget(0.001);
    if (gate.gate === 'hard') {
      throw new Error('Budget hard limit reached. Raise limits before chatting.');
    }

    const existing = abortControllers.get(request.conversationId);
    existing?.abort();
    const controller = new AbortController();
    abortControllers.set(request.conversationId, controller);

    try {
      const result = await runAssistantTurn({
        conversationId: request.conversationId,
        message: request.message,
        pattern: request.pattern,
        history: request.history,
        signal: controller.signal,
        onProgress: (text) => {
          emitAssistant(event, {
            type: 'progress',
            conversationId: request.conversationId,
            text,
          });
        },
      });

      const budget = appendLedger({
        kind: 'flash',
        model: result.model,
        costUsd: result.costUsd,
        patternId: request.pattern.id,
        ok: true,
        note: 'assistantChat',
      });

      emitAssistant(event, {
        type: 'done',
        conversationId: request.conversationId,
        message: result.message,
        patches: result.patches,
        costUsd: result.costUsd,
        model: result.model,
      });

      return {
        message: result.message,
        patches: result.patches,
        costUsd: result.costUsd,
        model: result.model,
        budget,
      };
    } catch (error) {
      const cancelled =
        (error instanceof Error && error.name === 'AbortError') || controller.signal.aborted;
      if (cancelled) {
        emitAssistant(event, {
          type: 'cancelled',
          conversationId: request.conversationId,
        });
        return {
          message: '(stopped)',
          patches: [],
          costUsd: 0,
          model: 'flash',
          budget: getBudgetSnapshot(),
        };
      }
      appendLedger({
        kind: 'failed',
        model: 'flash',
        costUsd: 0,
        patternId: request.pattern.id,
        ok: false,
        note: errMessage(error),
      });
      emitAssistant(event, {
        type: 'error',
        conversationId: request.conversationId,
        message: errMessage(error),
      });
      throw error;
    } finally {
      if (abortControllers.get(request.conversationId) === controller) {
        abortControllers.delete(request.conversationId);
      }
    }
  });

  handle('mytunes:assistantCancel', (_e, conversationId) => {
    const id = String(conversationId);
    const controller = abortControllers.get(id);
    controller?.abort();
    abortControllers.delete(id);
    return { ok: true };
  });

  handle('mytunes:assistant:list', () => listConversations());
  handle('mytunes:assistant:save', (_e, conversation) =>
    saveConversation(conversation as AssistantConversation),
  );
  handle('mytunes:assistant:load', (_e, id) => loadConversation(String(id)));
  handle('mytunes:assistant:delete', (_e, id) => deleteConversation(String(id)));
}

export { errMessage };
