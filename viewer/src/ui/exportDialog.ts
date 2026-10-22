import type { PerspectiveCamera } from 'three';

export interface ExportChoice {
  camera: PerspectiveCamera;
  height: number; // lines: 720, 1080 or 2160
}

/** What the dialog is exporting from: the shot's cameras and its frame range. */
export interface ExportShot {
  cameras: PerspectiveCamera[];
  fps: number;
  frameStart: number;
  frameEnd: number;
}

/** Records the movie. Resolves with the file to save, or null if it was cancelled. */
export type RunExport = (
  choice: ExportChoice,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
) => Promise<{ movie: Blob; fileName: string } | null>;

const SIZES = [720, 1080, 2160];

export function createExportDialog(root: HTMLElement, run: RunExport) {
  const dialog = document.createElement('dialog');
  dialog.className = 'export-dialog';

  const heading = document.createElement('h2');
  heading.textContent = 'Export movie';

  const cameraSelect = document.createElement('select');
  const sizeSelect = document.createElement('select');
  sizeSelect.append(...SIZES.map((lines) => new Option(`${lines}p`, String(lines))));
  sizeSelect.value = '1080';

  const summary = document.createElement('p');
  summary.className = 'export-summary';

  const progress = document.createElement('progress');
  progress.hidden = true;

  const message = document.createElement('p');
  message.className = 'export-message';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'export-start';
  exportButton.textContent = 'Export';
  const buttons = document.createElement('div');
  buttons.className = 'export-buttons';
  buttons.append(cancelButton, exportButton);

  dialog.append(
    heading,
    labelled('Camera', cameraSelect),
    labelled('Size', sizeSelect),
    summary,
    progress,
    message,
    buttons,
  );
  root.append(dialog);

  let cameras: PerspectiveCamera[] = [];
  let running: AbortController | null = null; // set while a movie is being recorded

  function setRunning(controller: AbortController | null) {
    running = controller;
    cameraSelect.disabled = sizeSelect.disabled = exportButton.disabled = controller !== null;
    cancelButton.textContent = controller ? 'Cancel' : 'Close';
    progress.hidden = controller === null;
  }

  async function start() {
    const camera = cameras[Number(cameraSelect.value)];
    if (!camera) return;
    const controller = new AbortController();
    setRunning(controller);
    progress.value = 0;
    message.textContent = 'Recording…';

    try {
      const result = await run(
        { camera, height: Number(sizeSelect.value) },
        (done, total) => {
          progress.value = done / total;
          message.textContent = `Recording frame ${done} of ${total}…`;
        },
        controller.signal,
      );
      if (result) {
        saveFile(result.movie, result.fileName);
        message.textContent = `Saved ${result.fileName}`;
      } else {
        message.textContent = 'Cancelled';
      }
    } catch (error) {
      message.textContent = `✖ ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      setRunning(null);
    }
  }

  exportButton.addEventListener('click', () => void start());
  cancelButton.addEventListener('click', () => {
    if (running) running.abort();
    else dialog.close();
  });
  // Escape: cancel the recording if there is one, otherwise close as usual
  dialog.addEventListener('cancel', (event) => {
    if (!running) return;
    event.preventDefault();
    running.abort();
  });

  return {
    open(shot: ExportShot) {
      cameras = shot.cameras;
      cameraSelect.replaceChildren(
        ...cameras.map((camera, i) => new Option(camera.name || `Camera ${i + 1}`, String(i))),
      );
      const frames = shot.frameEnd - shot.frameStart + 1;
      summary.textContent = `Frames ${shot.frameStart}–${shot.frameEnd} (${frames} at ${shot.fps} fps)`;
      message.textContent = cameras.length > 0 ? '' : 'Open a shot with a camera first';
      setRunning(null);
      exportButton.disabled = cameras.length === 0;
      dialog.showModal();
    },
  };
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.append(text, control);
  return label;
}

/** Hands a file to the browser to download. */
function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // give the download time to start
}
