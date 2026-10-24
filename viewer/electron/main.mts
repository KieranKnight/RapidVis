// The desktop app's main process: opens the window, and does the file work a web page can't
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isShotFile, shotArgument, shotFileNames } from './files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); // dist-electron/
let shotFolder: string | null = null; // where the open shot lives: saves default to here

/** Reads a shot from a folder, or from it's .glb or manifest (which brings back the other along) */
async function readShot(target: string) {
  const isFolder = (await stat(target)).isDirectory();
  const folder = isFolder ? target : path.dirname(target);
  const names = await readdir(folder);
  const chosen = isFolder ? names.filter(isShotFile) : shotFileNames(path.basename(target), names);
  shotFolder = folder;
  return Promise.all(
    chosen.map(async (name) => ({ name, data: await readFile(path.join(folder, name)) })),
  );
}

// The page asks for these through preload.cts. Each answers with files, or null when cancelled
ipcMain.handle('shot:initial', () => {
  // `RapidVis.exe shot.glb` when packaged; `electrom . shot.glb` in development
  const target = shotArgument(process.argv.slice(app.isPackaged ? 1 : 2));
  return target ? readShot(path.resolve(target)) : [];
});

ipcMain.handle('shot:open', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
    title: 'Open shot',
    properties: ['openFile'],
    filters: [{ name: 'RapidVis shot (.glb or manifest)', extensions: ['glb', 'json'] }],
  });
  return result.canceled ? [] : readShot(result.filePaths[0]);
});

ipcMain.on('shot:dropped', (_event, filePath: string) => {
  if (filePath) shotFolder = path.dirname(filePath); // '' for file sthat didn't come from disk
});

ipcMain.handle('file:save', async (event, fileName: string, data: Uint8Array) => {
  const extension = path.extname(fileName).slice(1); // "mp4", or "json" for .rvedits.json
  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
    defaultPath: path.join(shotFolder ?? app.getPath('documents'), fileName),
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, data);
  return result.filePath;
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#1c1d21', // no white flash before the page draws
    webPreferences: { preload: path.join(here, 'preload.cjs'), sandbox: true },
  });
  // The page is the whole app: never let it open or wander off to other pages
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadFile(path.join(here, '../dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); // macOS: dock click
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
