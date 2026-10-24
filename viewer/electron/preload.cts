// Runs in the page before it loads, and hands it a small, fixed set of desktop powers
// (window.rapidvis). The page itself gets no Node or file access. See src/platform.ts.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('rapidvis', {
  initialShot: () => ipcRenderer.invoke('shot:initial'),
  openShot: () => ipcRenderer.invoke('shot:open'),
  saveFile: (fileName: string, data: Uint8Array) => ipcRenderer.invoke('file:save', fileName, data),
  shotOpened: (file: File) => ipcRenderer.send('shot:dropped', webUtils.getPathForFile(file)),
});
