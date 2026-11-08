import { contextBridge, ipcRenderer } from 'electron';
import { quasarRuntime } from '#q-app/electron/preload';
import type { MytunesApi } from '../src/models/api';
import type { Pattern } from '../src/models/pattern';

/** Strip Vue reactive proxies so Electron structured clone succeeds. */
function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const mytunes: MytunesApi = {
  getKeyStatus: () => ipcRenderer.invoke('mytunes:getKeyStatus'),
  compilePrompt: (pattern) => ipcRenderer.invoke('mytunes:compilePrompt', cloneForIpc(pattern)),
  refinePrompt: (pattern) => ipcRenderer.invoke('mytunes:refinePrompt', cloneForIpc(pattern)),
  writeLyrics: (pattern) => ipcRenderer.invoke('mytunes:writeLyrics', cloneForIpc(pattern)),
  generateMusic: (payload) => ipcRenderer.invoke('mytunes:generateMusic', cloneForIpc(payload)),
  getBudget: () => ipcRenderer.invoke('mytunes:budget:get'),
  setBudgetLimits: (limits) => ipcRenderer.invoke('mytunes:budget:setLimits', cloneForIpc(limits)),
  checkBudget: (nextCost) => ipcRenderer.invoke('mytunes:budget:check', nextCost),
  listGenerations: () => ipcRenderer.invoke('mytunes:generations:list'),
  listPatterns: () => ipcRenderer.invoke('mytunes:patterns:list'),
  savePattern: (pattern: Pattern) => ipcRenderer.invoke('mytunes:patterns:save', cloneForIpc(pattern)),
  loadPattern: (id) => ipcRenderer.invoke('mytunes:patterns:load', id),
  deletePattern: (id) => ipcRenderer.invoke('mytunes:patterns:delete', id),
};

contextBridge.exposeInMainWorld('quasarRuntime', quasarRuntime);
contextBridge.exposeInMainWorld('mytunes', mytunes);
