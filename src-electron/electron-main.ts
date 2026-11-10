import { BrowserWindow, app, protocol } from 'electron';
import path from 'node:path';
import os from 'node:os';
import {
  registerQuasarRuntime,
  resolveElectronAssetsPath,
} from '#q-app/electron/main';
import { loadEnvFile } from './services/env';
import { registerAudioProtocol } from './services/generationStore';
import { registerIpcHandlers } from './services/ipcHandlers';

const platform = process.platform || os.platform();

// Keep userData on a stable lowercase path. Electron/Quasar may otherwise use
// productName "myTunes", which on Linux is a different folder from "mytunes"
// and makes songs/generations look missing.
app.setPath('userData', path.join(app.getPath('appData'), 'mytunes'));

// DevTools Protocol for automated UI capture (screenshots / docs).
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mytunes',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

async function createWindow() {
  const mainWindow = new BrowserWindow({
    icon: resolveElectronAssetsPath('icons/icon.png'),
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    useContentSize: true,
    backgroundColor: '#1a1612',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(import.meta.dirname, 'electron-preload.cjs'),
    },
  });

  if (import.meta.env.QUASAR_DEV) {
    await mainWindow.loadURL(import.meta.env.QUASAR_APP_URL);
  } else {
    await mainWindow.loadFile('index.html');
  }

  if (import.meta.env.QUASAR_DEBUG) {
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }
}

void app.whenReady().then(() => {
  loadEnvFile();
  registerQuasarRuntime();
  registerAudioProtocol();
  registerIpcHandlers();
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});
