// The desktop app's main process: opens the window, and does the file work a web page can't
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addRecent,
  isShotFile,
  readRecent,
  shotArgument,
  shotFileNames,
  type RecentShot,
} from './files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); // dist-electron/
let shotFolder: string | null = null; // where the open shot lives: saves default to here

// --- Recent shots, kept in the app's own settings folder between sessions ---
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
let recent: RecentShot[] = [];

async function loadRecent() {
  try {
    recent = readRecent(await readFile(recentFile(), 'utf-8'));
  } catch {
    recent = []; // no file yet
  }
}

function saveRecent() {
  void writeFile(recentFile(), JSON.stringify(recent, null, 2)).catch(() => {}); // only a convenience
  buildMenu(); // File > Open Recent shows the new list
}

function remember(target: string) {
  recent = addRecent(recent, target);
  saveRecent();
}

function clearRecent() {
  recent = [];
  saveRecent();
}

/** Reads a shot from a folder, or from its .glb or manifest (which brings the other along). */
async function readShot(target: string) {
  const isFolder = (await stat(target)).isDirectory();
  const folder = isFolder ? target : path.dirname(target);
  const names = await readdir(folder);
  const chosen = isFolder ? names.filter(isShotFile) : shotFileNames(path.basename(target), names);
  const files = await Promise.all(
    chosen.map(async (name) => ({ name, data: await readFile(path.join(folder, name)) })),
  );
  shotFolder = folder;
  remember(target);
  return files;
}

/** The native Open dialog, then the shot it picked (none if cancelled). */
async function openWithDialog(window: BrowserWindow) {
  const result = await dialog.showOpenDialog(window, {
    title: 'Open shot',
    properties: ['openFile'],
    filters: [{ name: 'RapidVis shot (.glb or manifest)', extensions: ['glb', 'json'] }],
  });
  return result.canceled ? [] : readShot(result.filePaths[0]);
}

/** Opens a shot from the recent list. Only listed shots: the page can't ask for any path it likes. */
async function openRecent(target: string) {
  if (!recent.some((shot) => shot.path === target))
    throw new Error('That shot is not in the recent list');
  return readShot(target);
}

// The page asks for these through preload.cts. Each answers with files, or none when cancelled.
ipcMain.handle('shot:initial', () => {
  // `RapidVis.exe shot.glb` when packaged; `electron . shot.glb` in development
  const target = shotArgument(process.argv.slice(app.isPackaged ? 1 : 2));
  return target ? readShot(path.resolve(target)) : [];
});

ipcMain.handle('shot:open', (event) =>
  openWithDialog(BrowserWindow.fromWebContents(event.sender)!),
);
ipcMain.handle('recent:list', () => recent);
ipcMain.handle('recent:open', (_event, target: string) => openRecent(target));

ipcMain.on('shot:dropped', (_event, filePath: string) => {
  if (!filePath) return; // '' for files that didn't come from disk
  shotFolder = path.dirname(filePath);
  remember(filePath);
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

// --- The native menu bar: a second home for every action ---
const currentWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

/** Tells the page to do something it already knows how to do (export, save, toggle...). */
const send = (action: string) => () => currentWindow()?.webContents.send('menu', action);

/** Sends a shot read from disk to the page, or shows why it couldn't be read. */
function deliver(reading: Promise<{ name: string; data: Buffer }[]>) {
  reading.then(
    (files) => {
      if (files.length > 0) currentWindow()?.webContents.send('shot:files', files);
    },
    (error: unknown) => dialog.showErrorBox('Could not open the shot', String(error)),
  );
}

/**
 * A menu item showing a shortcut the page handles itself. `registerAccelerator: false` keeps the
 * menu from also catching the keys, so a letter typed in the command bar never fires a menu item.
 */
const item = (label: string, accelerator: string, action: string): MenuItemConstructorOptions => ({
  label,
  accelerator,
  registerAccelerator: false,
  click: send(action),
});

/**
 * The menu bar. On Windows and Linux it would sit inside the window, under the title bar, where it
 * doesn't fit the design, so it's left out: everything in it is in the shot menu, on the timeline or
 * a shortcut. A Mac keeps it, since there it's the system bar at the top of the screen (and a Mac app
 * without one loses copy, paste and Quit).
 */
function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? [
        ...recent.map((shot) => ({
          label: `${shot.name}  —  ${path.dirname(shot.path)}`,
          click: () => deliver(openRecent(shot.path)),
        })),
        { type: 'separator' },
        { label: 'Clear Recent', click: clearRecent },
      ]
    : [{ label: 'No recent shots', enabled: false }];

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Shot…',
          accelerator: 'CmdOrCtrl+O',
          registerAccelerator: false,
          click: () => deliver(openWithDialog(currentWindow())),
        },
        { label: 'Open Recent', submenu: recentItems },
        item('Export…', 'CmdOrCtrl+E', 'export'),
        { type: 'separator' },
        item('Save Changes…', 'CmdOrCtrl+S', 'save'),
        { label: 'Load Changes…', click: send('load') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'CmdOrCtrl+Z', 'undo'),
        item('Redo', 'CmdOrCtrl+Y', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Side Panels', 'Tab', 'scene-panel'),
        item('Changes Panel', 'H', 'changes-panel'),
        item('Overlays', 'O', 'overlays'),
        item('Burn-in', 'B', 'burn-in'),
        item('Compare with Original', 'C', 'compare'),
        item('Hide All Cards', 'T', 'cards'),
        { type: 'separator' },
        { label: 'Light Theme', click: send('theme-light') },
        { label: 'Dark Theme', click: send('theme-dark') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#1c1d21', // no white flash before the page draws
    icon: path.join(here, '../dist/app-icon.png'), // the taskbar's; a packaged app uses build/icon.*
    webPreferences: { preload: path.join(here, 'preload.cjs'), sandbox: true },
  });
  // The page is the whole app: never let it open or wander off to other pages
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  // With no menu bar, keep DevTools a key away while developing (F12, or Ctrl+Shift+I)
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      const devTools =
        input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i');
      if (input.type === 'keyDown' && devTools) window.webContents.toggleDevTools();
    });
  }
  void window.loadFile(path.join(here, '../dist/index.html'));
}

app.whenReady().then(async () => {
  await loadRecent();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(); // macOS: dock click
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
