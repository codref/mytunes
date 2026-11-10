import { contextBridge, ipcRenderer } from 'electron';
import { quasarRuntime } from '#q-app/electron/preload';
import type { AssistantConversation, AssistantEvent } from '../src/models/assistant';
import type { MytunesApi } from '../src/models/api';
import type { Pattern } from '../src/models/pattern';
import type { StudioPreset } from '../src/models/presets';
import type { AppSettingsUpdate } from '../src/models/settings';
import type { AppSession, Song } from '../src/models/song';
import type { VideoExportOptions } from '../src/models/videoExport';

/** Strip Vue reactive proxies so Electron structured clone succeeds. */
function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const mytunes: MytunesApi = {
  getKeyStatus: () => ipcRenderer.invoke('mytunes:getKeyStatus'),
  getSettings: () => ipcRenderer.invoke('mytunes:settings:get'),
  setSettings: (update: AppSettingsUpdate) =>
    ipcRenderer.invoke('mytunes:settings:set', cloneForIpc(update)),
  getPatternDefaults: () => ipcRenderer.invoke('mytunes:settings:patternDefaults'),
  listChatModels: (opts) =>
    ipcRenderer.invoke('mytunes:models:listChat', opts ? cloneForIpc(opts) : undefined),
  listLyriaModels: (opts) =>
    ipcRenderer.invoke('mytunes:models:listLyria', opts ? cloneForIpc(opts) : undefined),
  compilePrompt: (pattern) => ipcRenderer.invoke('mytunes:compilePrompt', cloneForIpc(pattern)),
  refinePrompt: (pattern) => ipcRenderer.invoke('mytunes:refinePrompt', cloneForIpc(pattern)),
  writeLyrics: (pattern) => ipcRenderer.invoke('mytunes:writeLyrics', cloneForIpc(pattern)),
  fixLyrics: (pattern) => ipcRenderer.invoke('mytunes:fixLyrics', cloneForIpc(pattern)),
  splitLyriaTranscript: (payload) =>
    ipcRenderer.invoke('mytunes:splitLyriaTranscript', cloneForIpc(payload)),
  generateMusic: (payload) => ipcRenderer.invoke('mytunes:generateMusic', cloneForIpc(payload)),
  getBudget: () => ipcRenderer.invoke('mytunes:budget:get'),
  setBudgetLimits: (limits) => ipcRenderer.invoke('mytunes:budget:setLimits', cloneForIpc(limits)),
  checkBudget: (nextCost) => ipcRenderer.invoke('mytunes:budget:check', nextCost),
  listGenerations: (filter) =>
    ipcRenderer.invoke('mytunes:generations:list', filter ? cloneForIpc(filter) : undefined),
  patchGeneration: (id, patch) =>
    ipcRenderer.invoke('mytunes:generations:patch', id, cloneForIpc(patch)),
  forkGeneration: (generationId, name) =>
    ipcRenderer.invoke('mytunes:generations:fork', generationId, name),
  exportVideo: (generationId, options?: Partial<VideoExportOptions>) =>
    ipcRenderer.invoke(
      'mytunes:generations:exportVideo',
      generationId,
      options ? cloneForIpc(options) : undefined,
    ),
  pickImageFile: () => ipcRenderer.invoke('mytunes:pickImageFile'),
  exportTuneGeneration: (generationId) =>
    ipcRenderer.invoke('mytunes:generations:exportTune', generationId),
  onExportVideoProgress: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { generationId: string; percent: number | null; message: string },
    ) => {
      handler(payload);
    };
    ipcRenderer.on('mytunes:exportVideo:progress', listener);
    return () => {
      ipcRenderer.removeListener('mytunes:exportVideo:progress', listener);
    };
  },
  revealInFolder: (filePath) => ipcRenderer.invoke('mytunes:revealInFolder', filePath),
  listSongs: () => ipcRenderer.invoke('mytunes:songs:list'),
  saveSong: (song: Song) => ipcRenderer.invoke('mytunes:songs:save', cloneForIpc(song)),
  loadSong: (id) => ipcRenderer.invoke('mytunes:songs:load', id),
  deleteSong: (id) => ipcRenderer.invoke('mytunes:songs:delete', id),
  setSongCover: (songId, jpegBase64) =>
    ipcRenderer.invoke('mytunes:songs:setCover', songId, jpegBase64),
  clearSongCover: (songId) => ipcRenderer.invoke('mytunes:songs:clearCover', songId),
  copySongCover: (fromSongId, toSongId) =>
    ipcRenderer.invoke('mytunes:songs:copyCover', fromSongId, toSongId),
  exportTune: (songId) => ipcRenderer.invoke('mytunes:songs:exportTune', songId),
  importTune: () => ipcRenderer.invoke('mytunes:songs:importTune'),
  listPresets: () => ipcRenderer.invoke('mytunes:presets:list'),
  savePreset: (preset: StudioPreset) =>
    ipcRenderer.invoke('mytunes:presets:save', cloneForIpc(preset)),
  deletePreset: (id) => ipcRenderer.invoke('mytunes:presets:delete', id),
  getSession: () => ipcRenderer.invoke('mytunes:session:get'),
  setSession: (update: Partial<AppSession>) =>
    ipcRenderer.invoke('mytunes:session:set', cloneForIpc(update)),
  listPatterns: () => ipcRenderer.invoke('mytunes:patterns:list'),
  savePattern: (pattern: Pattern) =>
    ipcRenderer.invoke('mytunes:patterns:save', cloneForIpc(pattern)),
  loadPattern: (id) => ipcRenderer.invoke('mytunes:patterns:load', id),
  deletePattern: (id) => ipcRenderer.invoke('mytunes:patterns:delete', id),
  assistantChat: (request) => ipcRenderer.invoke('mytunes:assistantChat', cloneForIpc(request)),
  assistantCancel: (conversationId) =>
    ipcRenderer.invoke('mytunes:assistantCancel', conversationId),
  onAssistantEvent: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AssistantEvent) => {
      handler(payload);
    };
    ipcRenderer.on('mytunes:assistant:event', listener);
    return () => {
      ipcRenderer.removeListener('mytunes:assistant:event', listener);
    };
  },
  listAssistantConversations: () => ipcRenderer.invoke('mytunes:assistant:list'),
  saveAssistantConversation: (conversation: AssistantConversation) =>
    ipcRenderer.invoke('mytunes:assistant:save', cloneForIpc(conversation)),
  loadAssistantConversation: (id) => ipcRenderer.invoke('mytunes:assistant:load', id),
  deleteAssistantConversation: (id) => ipcRenderer.invoke('mytunes:assistant:delete', id),
};

contextBridge.exposeInMainWorld('quasarRuntime', quasarRuntime);
contextBridge.exposeInMainWorld('mytunes', mytunes);
