import fs from 'node:fs';
import path from 'node:path';
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import type { AssistantChatRequest, AssistantConversation, AssistantEvent } from '../../src/models/assistant';
import { estimateMusicCost } from '../../src/models/budget';
import type { Pattern } from '../../src/models/pattern';
import type { StudioPreset } from '../../src/models/presets';
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
  cloneGenerationToSong,
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
import type { GenerationRecord } from '../../src/models/generation';
import {
  generateLyriaMusic,
  getActiveBackend,
  KeyMissingError,
  resetAiClient,
  resolveLyriaModel,
  splitLyriaTranscriptWithFlash,
} from './geminiClient';
import { listChatModels, listLyriaModels } from './modelCatalog';
import type { VideoExportOptions } from '../../src/models/videoExport';
import { exportGenerationVideo } from './videoExport';
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
  deletePreset,
  findPresetDuplicate,
  listPresets,
  savePreset,
} from './presetStore';
import {
  attachCoverUrl,
  copyCover,
  deleteCover,
  writeCoverJpeg,
} from './coverStore';
import {
  deleteSong,
  ensureSongForPattern,
  getSession,
  listSongs,
  loadSong,
  saveSong,
  setSession,
} from './songStore';
import {
  defaultExportFilename,
  defaultGenerationExportFilename,
  exportTune,
  exportTuneGeneration,
  importTune,
} from './tuneArchive';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Safe coerce for IPC args (avoids Object stringification lint). */
function asIpcString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
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
  'mytunes:models:listChat',
  'mytunes:models:listLyria',
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
  'mytunes:generations:patch',
  'mytunes:generations:fork',
  'mytunes:generations:exportVideo',
  'mytunes:generations:exportTune',
  'mytunes:pickImageFile',
  'mytunes:revealInFolder',
  'mytunes:songs:list',
  'mytunes:songs:save',
  'mytunes:songs:load',
  'mytunes:songs:delete',
  'mytunes:songs:setCover',
  'mytunes:songs:clearCover',
  'mytunes:songs:copyCover',
  'mytunes:songs:exportTune',
  'mytunes:songs:importTune',
  'mytunes:presets:list',
  'mytunes:presets:save',
  'mytunes:presets:delete',
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

function ledgerBackend(
  purpose: 'assistant' | 'music',
): { backend: 'vertex' | 'gemini-api' } | Record<string, never> {
  const backend = getActiveBackend(purpose)?.backend;
  return backend ? { backend } : {};
}

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

  handle('mytunes:models:listChat', async (_e, optsRaw) => {
    const opts = (optsRaw ?? {}) as { force?: boolean };
    return listChatModels({ force: Boolean(opts.force) });
  });

  handle('mytunes:models:listLyria', async (_e, optsRaw) => {
    const opts = (optsRaw ?? {}) as { force?: boolean };
    return listLyriaModels({ force: Boolean(opts.force) });
  });

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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
      });
      throw error;
    }
  });

  handle('mytunes:generateMusic', async (_e, payloadRaw) => {
    const payload = payloadRaw as {
      pattern: Pattern;
      compiledPrompt: string;
      mode: 'clip' | 'full';
      model?: string;
      songId?: string | null;
      force?: boolean;
    };
    const { pattern, compiledPrompt, mode, force } = payload;
    const model = resolveLyriaModel(mode, {
      ...(payload.model ? { modelOverride: payload.model } : {}),
    });
    const cost = estimateMusicCost(mode);
    const promptHash = await hashPromptNode(compiledPrompt, mode, model);

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
        ...ledgerBackend('music'),
      });
      throw new Error(
        `Budget hard limit would be exceeded (next ${mode} costs $${cost.toFixed(2)}).`,
      );
    }

    try {
      const lyria = await generateLyriaMusic(compiledPrompt, mode, { model });
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
        ...(lyria.captionCues?.length ? { captionCues: lyria.captionCues } : {}),
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
        ...ledgerBackend('music'),
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
          ...ledgerBackend('assistant'),
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
        ...ledgerBackend('music'),
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
  handle('mytunes:generations:patch', (_e, id, patchRaw) => {
    const patch = (patchRaw ?? {}) as Partial<Pick<GenerationRecord, 'userNotes'>>;
    return patchGeneration(String(id), patch);
  });
  handle('mytunes:generations:fork', (_e, generationId, name) => {
    const result = cloneGenerationToSong(asIpcString(generationId), asIpcString(name));
    setSession({ lastSongId: result.song.id });
    return result;
  });
  handle('mytunes:generations:exportVideo', async (event, generationId, optionsRaw) => {
    const id = asIpcString(generationId);
    const options =
      optionsRaw && typeof optionsRaw === 'object'
        ? (optionsRaw as Partial<VideoExportOptions>)
        : undefined;
    return exportGenerationVideo(id, options, (percent, message) => {
      event.sender.send('mytunes:exportVideo:progress', {
        generationId: id,
        percent,
        message,
      });
    });
  });

  handle('mytunes:pickImageFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const openOpts = {
      title: 'Choose background image',
      properties: ['openFile' as const],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        },
      ],
    };
    const result = win
      ? await dialog.showOpenDialog(win, openOpts)
      : await dialog.showOpenDialog(openOpts);
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true as const };
    }
    const imagePath = result.filePaths[0];
    const buf = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    return { canceled: false as const, path: imagePath, dataUrl };
  });
  handle('mytunes:generations:exportTune', async (event, generationIdRaw) => {
    const generationId = asIpcString(generationIdRaw);
    if (!generationId) throw new Error('Generation id required');
    const win = BrowserWindow.fromWebContents(event.sender);
    const saveOpts = {
      title: 'Export take as .tune',
      defaultPath: defaultGenerationExportFilename(generationId),
      filters: [{ name: 'myTunes tune archive', extensions: ['tune'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (result.canceled || !result.filePath) {
      return { canceled: true as const };
    }
    let dest = result.filePath;
    if (!dest.toLowerCase().endsWith('.tune')) {
      dest = `${dest}.tune`;
    }
    const exported = await exportTuneGeneration(generationId, dest);
    return { canceled: false as const, ...exported };
  });
  handle('mytunes:revealInFolder', (_e, filePath) => {
    const p = asIpcString(filePath);
    if (!p) throw new Error('No path to reveal');
    shell.showItemInFolder(p);
    return { ok: true as const };
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

  handle('mytunes:songs:setCover', (_e, songIdRaw, jpegBase64) => {
    const songId = asIpcString(songIdRaw);
    const song = loadSong(songId);
    if (!song) throw new Error('Song not found — save the song before setting a cover');
    writeCoverJpeg(songId, asIpcString(jpegBase64));
    return attachCoverUrl(song);
  });

  handle('mytunes:songs:clearCover', (_e, songIdRaw) => {
    const songId = asIpcString(songIdRaw);
    const song = loadSong(songId);
    if (!song) throw new Error('Song not found');
    deleteCover(songId);
    delete song.coverFileUrl;
    return song;
  });

  handle('mytunes:songs:copyCover', (_e, fromRaw, toRaw) => {
    const fromId = asIpcString(fromRaw);
    const toId = asIpcString(toRaw);
    if (!copyCover(fromId, toId)) {
      const song = loadSong(toId);
      return song;
    }
    const song = loadSong(toId);
    return song ? attachCoverUrl(song) : null;
  });

  handle('mytunes:songs:exportTune', async (event, songIdRaw) => {
    const songId = asIpcString(songIdRaw);
    const song = loadSong(songId);
    if (!song) throw new Error('Song not found — save the song before exporting');
    const win = BrowserWindow.fromWebContents(event.sender);
    const saveOpts = {
      title: 'Export .tune archive',
      defaultPath: defaultExportFilename(song),
      filters: [{ name: 'myTunes tune archive', extensions: ['tune'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (result.canceled || !result.filePath) {
      return { canceled: true as const };
    }
    let dest = result.filePath;
    if (!dest.toLowerCase().endsWith('.tune')) {
      dest = `${dest}.tune`;
    }
    const exported = await exportTune(songId, dest);
    return { canceled: false as const, ...exported };
  });

  handle('mytunes:songs:importTune', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const openOpts = {
      title: 'Load .tune archive',
      properties: ['openFile' as const],
      filters: [{ name: 'myTunes tune archive', extensions: ['tune'] }],
    };
    const result = win
      ? await dialog.showOpenDialog(win, openOpts)
      : await dialog.showOpenDialog(openOpts);
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true as const };
    }
    const imported = await importTune(result.filePaths[0]);
    setSession({ lastSongId: imported.song.id });
    return { canceled: false as const, ...imported };
  });

  handle('mytunes:presets:list', () => listPresets());
  handle('mytunes:presets:save', (_e, presetRaw) => {
    const preset = presetRaw as StudioPreset;
    const duplicate = findPresetDuplicate(preset);
    if (duplicate && duplicate.id !== preset.id) {
      return savePreset({ ...preset, id: duplicate.id });
    }
    return savePreset(preset);
  });
  handle('mytunes:presets:delete', (_e, id) => deletePreset(String(id)));

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
        ...(request.model ? { model: request.model } : {}),
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
        ...ledgerBackend('assistant'),
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
        ...ledgerBackend('assistant'),
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
