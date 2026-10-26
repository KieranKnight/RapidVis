// The app: makes every part and wires them together. The shot itself lives in shotPlayer.ts,
// the side panels in ui/panels.ts, and which key does what in shortcuts.ts
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/manrope';
import { PerspectiveCamera } from 'three';
import { burnInText, type BurnIn } from './burnin';
import { focalLength } from './cameras';
import { targetError } from './commands/apply';
import { suggest } from './commands/complete';
import { formatCommand } from './commands/format';
import { CommandLog } from './commands/log';
import { editsFile, readEdits } from './commands/serialize';
import { createMovieExport } from './export/shotMovie';
import { loadShot } from './loader';
import { desktop, saveFile, toFiles, type RecentShot, type ShotFile } from './platform';
import { channels } from './properties';
import { nextKey } from './ruler';
import { Selection } from './selection';
import { ShotPlayer } from './shotPlayer';
import { shortcutFor, type Action } from './shortcuts';
import './style.css';
import { saveTheme, sceneColors, showTheme, startingTheme, type Theme } from './theme';
import { Timeline } from './timeline';
import { createBurnInLayer } from './ui/burnInLayer';
import { createCameraSelect } from './ui/cameraSelect';
import { createCommandBar } from './ui/commandBar';
import { errorLine, getElement } from './ui/dom';
import { droppedFiles } from './ui/droppedFiles';
import { createExportDialog } from './ui/exportDialog';
import { createHistoryPanel } from './ui/historyPanel';
import { BURN_IN_ICON, LAYERS_ICON } from './ui/icons';
import { createOutliner } from './ui/outliner';
import { createPanels } from './ui/panels';
import { createPropertiesCard } from './ui/propertiesCard';
import { createShotMenu } from './ui/shotMenu';
import { createTimelineBar } from './ui/timelineBar';
import { createToggleButton } from './ui/toggleButton';
import { createViewport } from './viewport';

// --- Components ---
const app = getElement<HTMLElement>('#app');
const container = getElement<HTMLElement>('#viewport');
const status = getElement<HTMLParagraphElement>('#status');
const viewport = createViewport(container);
const timeline = new Timeline();
const timelineBar = createTimelineBar(getElement<HTMLElement>('#timeline'), timeline);
const viewControls = timelineBar.controls; // the camera, overlays and burn-in, at the pill's right end
const log = new CommandLog();

// --- Theme ---
let theme = startingTheme();
showTheme(theme);
viewport.setColors(sceneColors());

function setTheme(next: Theme) {
  theme = next;
  showTheme(next, true);
  saveTheme(next);
  viewport.setColors(sceneColors()); // after showTheme, so it reads the new tokens
}

// --- View controls, on the timeline ---
let viewedCamera: PerspectiveCamera | null = null; // the shot camera looked through, if any
const cameraSelect = createCameraSelect(viewControls, (camera) => {
  viewedCamera = camera;
  viewport.setViewCamera(camera);
});

const overlaysButton = createToggleButton(
  viewControls,
  'Overlays',
  true,
  (on) => viewport.setOverlays(on),
  { icon: LAYERS_ICON, shortcut: 'O' },
);

const burnInLayer = createBurnInLayer(container);
const burnInButton = createToggleButton(
  viewControls,
  'Burn-in',
  burnInLayer.visible,
  (on) => burnInLayer.setVisible(on),
  { icon: BURN_IN_ICON, shortcut: 'B' },
);

// --- Side panels, and the Scene panel's list ---
const panels = createPanels(app);

const selection = new Selection();
const outliner = createOutliner(getElement<HTMLElement>('#outliner'), selection);
// The selected object's details, in the Scene panel between its list and Changes (added after the list)
const details = document.createElement('section');
details.className = 'scene-details';
details.hidden = true;
getElement<HTMLElement>('#outliner').append(details);
selection.onChange(() => viewport.setHighlight(selection.selected?.object ?? null));

// --- The shot, and its keys on the timeline ---
const player = new ShotPlayer(viewport, timeline, log);

let shownKeys: number[] = []; // what the ruler shows, and what ↑/↓ jump between

/** Key markers: every key, with the selected object's picked out (all of them, if nothing is). */
function updateKeys() {
  const node = selection.selected;
  const allKeys = player.keyFrames(null);
  shownKeys = node ? player.keyFrames(node) : allKeys;
  timelineBar.setKeys(allKeys, shownKeys);
}
selection.onChange(updateKeys);

/** ↑/↓: to the next (or previous) key the ruler shows. */
function jumpToKey(direction: 1 | -1) {
  const key = nextKey(shownKeys, timeline.frame, direction);
  if (key !== null) {
    timeline.pause();
    timeline.setFrame(key);
  }
}

// --- Commands ---
const commandBar = createCommandBar(
  getElement<HTMLElement>('#command-slot'),
  (text) => player.run(text),
  (before) =>
    suggest(
      before,
      player.registry?.nodes ?? [],
      (verb, node) => targetError(verb, node, player.edited) === null,
    ),
);
createHistoryPanel(
  getElement<HTMLElement>('#changes'),
  log,
  (text) => commandBar.setText(text),
  panels.hideChanges,
);

const propertiesCard = createPropertiesCard(details, selection, {
  run(command) {
    const error = player.run(formatCommand(command)); // the same path as typing it
    if (error) status.textContent = `✖ ${error}`;
  },
  settings: (node) => player.edited.settings[node.id] ?? {},
  lens: (node) =>
    node.object instanceof PerspectiveCamera
      ? focalLength(node.object.fov, player.sensorFor(node.gltfName), node.object.aspect)
      : null,
  channels: (node) => channels(player.edited.clips, node.gltfName, timeline.fps),
});

// --- Saving and loading edits ---
/** Saves the applied commands (with the muted ones marked) as <shot>.rvedits.json. */
async function saveEdits() {
  if (!player.registry) {
    status.textContent = 'Open a shot before saving its edits';
    return;
  }
  const json = JSON.stringify(editsFile(player.name, player.source, log.appliedEntries), null, 2);
  const savedTo = await saveFile(
    new Blob([json], { type: 'application/json' }),
    `${player.name}.rvedits.json`,
  );
  if (savedTo) status.textContent = `Saved ${savedTo}`;
}

/** Replaces the history with a saved edits file, and reports anything it couldn't use. */
async function loadEdits(file: File) {
  if (!player.registry) {
    status.textContent = '✖ Open a shot before loading its edits';
    return;
  }
  const result = readEdits(await file.text(), (text) => player.parse(text));
  if ('error' in result) {
    status.textContent = `✖ ${result.error}`;
    return;
  }

  const { shot, entries, skipped } = result.ok;
  log.load(entries); // -> rebuild()
  status.textContent = [
    `Loaded ${entries.length} edits from ${file.name}`,
    ...(shot && shot !== player.name
      ? [`⚠ They were saved from "${shot}", not "${player.name}"`]
      : []),
    ...skipped.map((reason) => `⚠ Skipped ${reason}`),
    // Commands can read fine but still not apply here (a key that isn't in this shot, say)
    ...player.failed.map((error) => `⚠ ${error}`),
  ].join('\n');
}

// --- Burn-in and movie export ---
/** The burn-in for a frame seen through `camera` (null: the free camera). */
function burnInFor(camera: PerspectiveCamera | null, frame: number): BurnIn {
  return burnInText({
    shot: player.name,
    camera: camera ? camera.name : 'Free camera',
    focal: camera ? focalLength(camera.fov, player.sensorFor(camera.name), camera.aspect) : null,
    frame,
    frameEnd: timeline.frameEnd,
    commands: log.active.map(formatCommand),
  });
}

const exportDialog = createExportDialog(
  document.body,
  createMovieExport({ viewport, timeline, shotName: () => player.name, burnIn: burnInFor }),
);
/** Export…: the movie dialog, for the shot's cameras and range. */
function openExport() {
  exportDialog.open({
    cameras: player.cameras,
    fps: timeline.fps,
    frameStart: timeline.frameStart,
    frameEnd: timeline.frameEnd,
  });
}

viewport.start((deltaSeconds) => {
  timeline.tick(deltaSeconds);
  burnInLayer.draw(viewport.pictureRect(), () =>
    player.registry ? burnInFor(viewedCamera, timeline.frame) : null,
  );
});

// --- Opening shots ---
async function openFiles(files: File[]) {
  if (files.length === 0) return;
  status.textContent = 'Loading…';

  try {
    const shot = await loadShot(files);
    selection.select(null);
    player.load(shot); // -> rebuild()
    outliner.setRegistry(player.registry);
    cameraSelect.setCameras(player.cameras);
    document.title = `${shot.name} – RapidVis`;
    app.classList.add('has-shot'); // the empty viewport's logo makes way

    desktop?.shotOpened(files[0]); // so the desktop app saves next to a dropped shot, and lists it
    refreshRecent();
    status.textContent = shot.warnings.map((warning) => `⚠ ${warning}`).join('\n'); // the chip has the rest
  } catch (error) {
    status.textContent = errorLine(error);
  }
}

const fileInput = getElement<HTMLInputElement>('#file-input');
/** Opens files the desktop app read from disk (a cancelled dialog gives none). */
function openFromDisk(reading: Promise<ShotFile[]>) {
  reading.then(
    (files) => openFiles(toFiles(files)),
    (error: unknown) => {
      status.textContent = errorLine(error);
    },
  );
}

/** Open shot…: a native dialog in the desktop app, the browser's file picker otherwise. */
function openShot() {
  if (desktop) openFromDisk(desktop.openShot());
  else fileInput.click();
}

if (desktop) openFromDisk(desktop.initialShot()); // `RapidVis.exe shot.glb`
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files ?? []);
  fileInput.value = ''; // lets you pick the same file again and still trigger 'change'
  void openFiles(files);
});

// Load changes…: a saved .rvedits.json
const editsInput = getElement<HTMLInputElement>('#edits-input');
const loadChanges = () => editsInput.click();
editsInput.addEventListener('change', () => {
  const file = editsInput.files?.[0];
  editsInput.value = ''; // so choosing the same file again still counts as a change
  if (file) void loadEdits(file);
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  container.classList.add('drag-over');
});
window.addEventListener('dragleave', () => container.classList.remove('drag-over'));
window.addEventListener('drop', (event) => {
  event.preventDefault();
  container.classList.remove('drag-over');
  if (event.dataTransfer) void droppedFiles(event.dataTransfer).then(openFiles);
});

// --- The shot menu (top right), and Open recent ---
let recentShots: readonly RecentShot[] = [];
function refreshRecent() {
  if (desktop) void desktop.recentShots().then((list) => (recentShots = list));
}
refreshRecent();

const shotMenu = createShotMenu(getElement<HTMLElement>('#shot-zone'), {
  open: openShot,
  recent: () => (desktop ? recentShots : null), // a browser can't reopen a file by its path
  openRecent: (shot) => {
    if (desktop) openFromDisk(desktop.openRecent(shot.path));
  },
  export: openExport,
  save: () => void saveEdits(),
  load: loadChanges,
  theme: () => theme,
  setTheme,
});

/** The chip's name and "24 fps · 1–48", which follows edits like trim. */
function updateShotChip() {
  shotMenu.setShot(
    player.name,
    `${timeline.fps} fps · ${timeline.frameStart}–${timeline.frameEnd}`,
  );
}

// --- After every edit, the panels show the edited shot ---
player.onRebuild(() => {
  const nodes = player.registry?.nodes ?? [];
  outliner.setHidden(player.edited.hidden);
  outliner.setAnimated(
    nodes.filter((node) => player.keyFrames(node).length > 0).map((node) => node.id),
  );
  updateShotChip();
  updateKeys();
  propertiesCard.refresh();
});

// --- Click to select in the viewport ---
let pointerDownX = 0;
let pointerDownY = 0;
viewport.canvas.addEventListener('pointerdown', (event) => {
  pointerDownX = event.clientX;
  pointerDownY = event.clientY;
});
viewport.canvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0) return; // left button only
  const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
  if (moved > 4) return; // that was a drag (orbiting), not a click
  const object = viewport.pick(event.clientX, event.clientY);
  selection.select(object && player.registry ? player.registry.nodeFor(object) : null);
});

// --- Everything the keyboard and the desktop app's native menu can do ---
const actions: Record<Action, () => void> = {
  open: openShot,
  export: openExport,
  save: () => void saveEdits(),
  load: loadChanges,
  undo: () => log.undo(),
  redo: () => log.redo(),
  'scene-panel': panels.toggleAll,
  'changes-panel': panels.toggleChanges,
  overlays: () => overlaysButton.toggle(),
  'burn-in': () => burnInButton.toggle(),
  compare: () => log.setComparing(!log.isComparing),
  cards: () => app.classList.toggle('cards-hidden'), // T: a clean look at the shot (the timeline stays)
  'theme-light': () => setTheme('light'),
  'theme-dark': () => setTheme('dark'),
  play: () => timeline.toggle(),
  'next-frame': () => timeline.step(1),
  'previous-frame': () => timeline.step(-1),
  'next-key': () => jumpToKey(1),
  'previous-key': () => jumpToKey(-1),
  deselect: () => selection.select(null),
  command: () => commandBar.setText('/'),
};

if (desktop) {
  desktop.onMenu((action) => actions[action]?.()); // it arrives over IPC as a plain string
  desktop.onShot((files) => void openFiles(toFiles(files))); // File > Open or Open Recent
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  // The command bar, open menus and the export dialog keep their own keys
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof Element && target.closest('dialog, .menu')) // e.g. Space mid-export
  ) {
    return;
  }
  const shortcut = shortcutFor(event);
  if (!shortcut) return;
  if (!shortcut.ctrl && target instanceof HTMLButtonElement) return; // a focused button keeps Space, Enter and Tab
  if (shortcut.preventDefault) event.preventDefault();
  actions[shortcut.action]();
});
