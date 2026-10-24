import { saveFile as download } from './ui/download';

/** A file the desktop app read from disk for the page */
export interface ShotFile {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

/** What the desktop app's preload (electron/preload.cts) adds to the page */
interface DesktopApi {
  initialShot(): Promise<ShotFile[]>;
  openShot(): Promise<ShotFile[]>;
  saveFile(fileName: string, data: Uint8Array): Promise<string | null>;
  shotOpened(file: File): void;
}

declare global {
  interface Window {
    rapidvis?: DesktopApi; // Only in the desktop app...
  }
}

/** The desktop app's powers, or undefined in a browser */
export const desktop = window.rapidvis;
export const toFiles = (files: ShotFile[]) => files.map((file) => new File([file.data], file.name));

/**
 * Saves through a native Save dialog in the desktop app, or downloads in the browser.
 * Returns where the file went, or null if the dialog was cancelled
 */
export async function saveFile(blobl: Blob, fileName: string): Promise<string | null> {
  if (!desktop) {
    download(blobl, fileName);
    return fileName;
  }
  return desktop.saveFile(fileName, new Uint8Array(await blobl.arrayBuffer()));
}
