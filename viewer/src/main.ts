import * as THREE from 'three';
import {
  applyCommand,
  cameraFov,
  lightLook,
  replay,
  stillValue,
  targetError,
  type ShotState,
} from './commands/apply';
import { CommandLog } from './commands/log';
import { parseCommand } from './commands/parse';
import { createHistoryPanel } from './ui/historyPanel';

import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/manrope';
import { suggest } from './commands/complete';
import { recordMovie } from './export/movie';
import { movieFileName, movieSize } from './export/settings';
import { loadShot } from './loader';
import { SceneRegistry } from './registry';
import { nextKey } from './ruler';
import { Selection } from './selection';
import './style.css';
import { Timeline, frameToSeconds } from './timeline';
import { createCameraSelect } from './ui/cameraSelect';
import { createCommandBar } from './ui/commandBar';
import { droppedFiles } from './ui/droppedFiles';
import { createExportDialog, type RunExport } from './ui/exportDialog';
import { createOutliner } from './ui/outliner';
import { createTimelineBar } from './ui/timelineBar';
import { createToggleButton } from './ui/toggleButton';
import { createViewport } from './viewport';

import { burnInText, type BurnIn } from './burnin';
import { focalLength, verticalFov } from './cameras';
import { formatCommand } from './commands/format';
import { editsFile, readEdits } from './commands/serialize';
import { animates, keyFrames } from './commands/tracks';
import { curveTracks } from './curves';
import { DEFAULT_CAMERA, type CameraInfo, type Manifest } from './manifest';
import { desktop, saveFile, toFiles, type ShotFile } from './platform';
import { channels } from './properties';
import { saveTheme, sceneColors, showTheme, startingTheme } from './theme';
import { createBurnInLayer, drawBurnIn } from './ui/burnInLayer';
import { createPropertiesCard } from './ui/propertiesCard';
import { createThemeToggle } from './ui/themeToggle';

function getElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

// --- Components ---
const app = getElement<HTMLElement>('#app');
const container = getElement<HTMLElement>('#viewport');
const viewport = createViewport(container);
const headerTools = getElement<HTMLElement>('#header-tools'); // the header buttons before Open shot

// --- Theme ---
const theme = startingTheme();
showTheme(theme);
viewport.setColors(sceneColors());
createThemeToggle(headerTools, theme, (next) => {
  showTheme(next, true);
  saveTheme(next);
  viewport.setColors(sceneColors()); // after showTheme, so it reads the new tokens
});

const overlaysButton = createToggleButton(headerTools, 'Overlays', true, (on) =>
  viewport.setOverlays(on),
);

const burnInLayer = createBurnInLayer(container);
const burnInButton = createToggleButton(headerTools, 'Burn-in', burnInLayer.visible, (on) =>
  burnInLayer.setVisible(on),
);

let viewedCamera: THREE.PerspectiveCamera | null = null; // the shot camera looked through, if any
const cameraSelect = createCameraSelect(headerTools, (camera) => {
  viewedCamera = camera;
  viewport.setViewCamera(camera);
});

/** T: hides the cards for a clean look at the shot (the timeline stays, to scrub with). */
function toggleCards() {
  app.classList.toggle('cards-hidden');
}

const timeline = new Timeline();
const timelineBar = createTimelineBar(getElement<HTMLElement>('#timeline'), timeline);

const selection = new Selection();
const outliner = createOutliner(getElement<HTMLElement>('#outliner'), selection);
selection.onChange(() => viewport.setHighlight(selection.selected?.object ?? null));

// --- Shot state ---
let shotRoot: THREE.Object3D | null = null;
let registry: SceneRegistry | null = null;
let mixer: THREE.AnimationMixer | null = null;
let original: ShotState = {
  clips: [],
  frameStart: 1,
  frameEnd: 1,
  poses: {},
  hidden: [],
  settings: {},
};
let edited: ShotState = original; // original + every applied command
let clips: THREE.AnimationClip[] = []; // the clips the mixer is playing
let actions: THREE.AnimationAction[] = [];
const log = new CommandLog();
let sensors = new Map<string, CameraInfo>(); // camera sensor sizes from the manifest, by glTF name
let shotName = 'shot';
let shotSource = { dcc: '', file: '' }; // where the shot came from, saved with its edits
let shotCameras: THREE.PerspectiveCamera[] = [];

function applyFrame() {
  if (!mixer) return;
  const seconds = frameToSeconds(timeline.frame, timeline.fps);
  for (const action of actions) action.time = seconds;
  mixer.update(0);
  applySettings(); // after the mixer, since edits go on top of any lens or light animation
}
timeline.onChange(applyFrame);

/** Swaps in new clips (e.g. after a command) and shows the current frame with them. */
function setClips(newClips: THREE.AnimationClip[]) {
  const currentMixer = mixer;
  if (!currentMixer) return;
  currentMixer.stopAllAction();
  for (const clip of clips) currentMixer.uncacheClip(clip);
  clips = newClips;
  actions = clips.map((clip) => currentMixer.clipAction(clip).play());
  applyFrame();
}

// --- Commands ---
/** The one place edits are made: the original clips + every applied command in the log. */
function rebuild() {
  if (!registry) return;
  edited = replay(original, log.active, { registry, fps: timeline.fps }).state;
  setClips(edited.clips);
  applyStillPoses();
  applyVisibility();
  applySettings();
  timeline.setRange(edited);
  shotInfo.textContent = `${timeline.fps} fps · ${timeline.frameStart}–${timeline.frameEnd}`;
  outliner.setAnimated(
    registry.nodes
      .filter((node) => keyFrames(edited.clips, node.gltfName, timeline.fps).length > 0)
      .map((node) => node.id),
  );
  updateKeys();
}

let shownKeys: number[] = []; // what the ruler shows, and what ↑/↓ jump between

/** Key markers: every key, with the selected object's picked out (all of them, if nothing is). */
function updateKeys() {
  const node = selection.selected;
  const allKeys = keyFrames(edited.clips, null, timeline.fps);
  shownKeys = node ? keyFrames(edited.clips, node.gltfName, timeline.fps) : allKeys;
  timelineBar.setKeys(allKeys, shownKeys);
}
selection.onChange(updateKeys);

const TRANSFORM_PROPERTIES = ['position', 'quaternion', 'scale'] as const;

/** Objects that are not animated: put them where the edits say (or back where they loaded). */
function applyStillPoses() {
  if (!registry) return;
  for (const node of registry.nodes) {
    for (const property of TRANSFORM_PROPERTIES) {
      const value = stillValue(edited, node, property);
      if (value) node.object[property].fromArray(value);
    }
  }
}

/**
 * Lights and cameras on this frame: their animation (or loaded settings), with any edits on top.
 * Runs straight after the mixer, so an animated value on the object is this frame's, unedited.
 */
function applySettings() {
  if (!registry) return;
  for (const node of registry.nodes) {
    const { object } = node;
    const animated = (property: string) => animates(edited.clips, node.gltfName, property);
    if (object instanceof THREE.Light) {
      const look = lightLook(edited, node, {
        intensity: animated('intensity') ? object.intensity : undefined,
        color: animated('color') ? `#${object.color.getHexString()}` : undefined,
      });
      if (look) {
        object.intensity = look.intensity;
        object.color.set(look.color);
      }
    }
    if (object instanceof THREE.PerspectiveCamera) {
      const sensor = sensors.get(node.gltfName) ?? DEFAULT_CAMERA;
      const fov = cameraFov(edited, node, sensor, object.aspect, {
        fov: animated('fov') ? object.fov : undefined,
      });
      if (fov !== null) {
        object.fov = fov;
        object.updateProjectionMatrix(); // three.js only rebuilds the lens when asked
      }
    }
  }
}

/** The glTF's clips, plus one that plays the manifest's lens and light curves (if it has any). */
function withCurves(clips: THREE.AnimationClip[], manifest: Manifest, root: THREE.Object3D) {
  const fovFor = (node: string, lens: number) => {
    const camera = root.getObjectByName(node);
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
    return verticalFov(lens, sensors.get(node) ?? DEFAULT_CAMERA, aspect);
  };
  const tracks = curveTracks(manifest.curves, manifest.frameStart, manifest.fps, fovFor).filter(
    // skip objects the .glb doesn't have (glTF has no area lights, for one)
    (track) => root.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName),
  );
  return tracks.length > 0 ? [...clips, new THREE.AnimationClip('curves', -1, tracks)] : clips;
}

/** Hidden objects (and everything parented to them) disappear; everything else shows. */
function applyVisibility() {
  if (!registry) return;
  for (const node of registry.nodes) node.object.visible = !edited.hidden.includes(node.id);
  outliner.setHidden(edited.hidden);
}
log.onChange(rebuild);

function runCommand(text: string): string | null {
  const currentRegistry = registry;
  if (!currentRegistry) return 'Open a shot first';

  const parsed = parseCommand(text, (query) => currentRegistry.find(query), timeline.frame);
  if ('error' in parsed) return parsed.error;

  // Dry run, so a command that can't apply is reported and never enters the log
  const context = { registry: currentRegistry, fps: timeline.fps };
  const applied = applyCommand(edited, parsed.ok, context, log.applied);
  if ('error' in applied) return applied.error;

  log.push(parsed.ok); // -> rebuild()
  return null;
}
const commandBar = createCommandBar(
  getElement<HTMLElement>('#command-slot'),
  runCommand,
  (before) =>
    suggest(
      before,
      registry?.nodes ?? [],
      (verb, node) => targetError(verb, node, edited) === null,
    ),
);
createHistoryPanel(getElement<HTMLElement>('#outliner'), log, (text) => commandBar.setText(text), {
  save: saveEdits,
  load: (file) => void loadEdits(file),
});

const propertiesCard = createPropertiesCard(getElement<HTMLElement>('#properties'), selection, {
  run(command) {
    const error = runCommand(formatCommand(command)); // the same path as typing it
    if (error) status.textContent = `✖ ${error}`;
  },
  settings: (node) => edited.settings[node.id] ?? {},
  lens: (node) =>
    node.object instanceof THREE.PerspectiveCamera
      ? focalLength(
          node.object.fov,
          sensors.get(node.gltfName) ?? DEFAULT_CAMERA,
          node.object.aspect,
        )
      : null,
  channels: (node) => channels(edited.clips, node.gltfName, timeline.fps),
});
log.onChange(() => propertiesCard.refresh()); // after rebuild(), so it shows the edited values

// --- Saving and loading edits ---
/** Saves the applied commands (with the muted ones marked) as <shot>.rvedits.json. */
async function saveEdits() {
  if (!registry) {
    status.textContent = 'Open a shot before saving its edits';
    return;
  }
  const json = JSON.stringify(editsFile(shotName, shotSource, log.appliedEntries), null, 2);
  const savedTo = await saveFile(
    new Blob([json], { type: 'application/json' }),
    `${shotName}.rvedits.json`,
  );
  if (savedTo) status.textContent = `Saved ${savedTo}`;
}

/** Replaces the history with a saved edits file, and reports anything it couldn't use. */
async function loadEdits(file: File) {
  const currentRegistry = registry;
  if (!currentRegistry) {
    status.textContent = '✖ Open a shot before loading its edits';
    return;
  }
  const parse = (text: string) =>
    parseCommand(text, (query) => currentRegistry.find(query), timeline.frame);
  const result = readEdits(await file.text(), parse);
  if ('error' in result) {
    status.textContent = `✖ ${result.error}`;
    return;
  }

  const { shot, entries, skipped } = result.ok;
  log.load(entries); // -> rebuild()
  // Commands can read fine but still not apply here (a key that isn't in this shot, say)
  const context = { registry: currentRegistry, fps: timeline.fps };
  const failed = replay(original, log.active, context).errors;
  status.textContent = [
    `Loaded ${entries.length} edits from ${file.name}`,
    ...(shot && shot !== shotName ? [`⚠ They were saved from "${shot}", not "${shotName}"`] : []),
    ...skipped.map((reason) => `⚠ Skipped ${reason}`),
    ...failed.map((error) => `⚠ ${error}`),
  ].join('\n');
}

// --- Burn-in ---
/** The burn-in for a frame seen through `camera` (null: the free camera). */
function burnInFor(camera: THREE.PerspectiveCamera | null, frame: number): BurnIn {
  const sensor = camera ? (sensors.get(camera.name) ?? DEFAULT_CAMERA) : null;
  return burnInText({
    shot: shotName,
    camera: camera ? camera.name : 'Free camera',
    focal: camera && sensor ? focalLength(camera.fov, sensor, camera.aspect) : null,
    frame,
    frameEnd: timeline.frameEnd,
    commands: log.active.map(formatCommand),
  });
}

// --- Movie export ---
/** Records the frame range through a camera, edits and all, by stepping the timeline frame by frame. */
const exportMovie: RunExport = async ({ camera, height, burnIn, codec }, onProgress, signal) => {
  const size = movieSize(height, camera.aspect);
  const frameCanvas = document.createElement('canvas'); // the clean render, plus any burn-in
  frameCanvas.width = size.width;
  frameCanvas.height = size.height;
  const context = frameCanvas.getContext('2d');
  if (!context) throw new Error("This browser can't draw on a 2D canvas");
  const clean = viewport.createCleanRenderer(size.width, size.height);
  const { fps, frameStart, frameEnd } = timeline;
  const returnTo = timeline.frame;
  timeline.pause();

  try {
    const movie = await recordMovie({
      canvas: frameCanvas,
      codec,
      fps,
      frameStart,
      frameEnd,
      drawFrame: (frame) => {
        timeline.setFrame(frame); // poses the whole shot for that frame
        clean.draw(camera);
        context.drawImage(clean.canvas, 0, 0);
        if (burnIn) drawBurnIn(context, burnInFor(camera, frame), { x: 0, y: 0, ...size });
      },

      onProgress,
      signal,
    });
    if (!movie) return null;
    return {
      movie,
      fileName: movieFileName(shotName, camera.name || 'camera', frameStart, frameEnd),
    };
  } finally {
    clean.dispose();
    timeline.setFrame(returnTo);
  }
};

const exportDialog = createExportDialog(document.body, exportMovie);
const exportButton = document.createElement('button');
exportButton.type = 'button';
exportButton.className = 'export-button';
exportButton.textContent = 'Export…';
exportButton.addEventListener('click', () =>
  exportDialog.open({
    cameras: shotCameras,
    fps: timeline.fps,
    frameStart: timeline.frameStart,
    frameEnd: timeline.frameEnd,
  }),
);
headerTools.append(exportButton);

viewport.start((deltaSeconds) => {
  timeline.tick(deltaSeconds);
  burnInLayer.draw(viewport.pictureRect(), () =>
    registry ? burnInFor(viewedCamera, timeline.frame) : null,
  );
});

// --- Loading ---
const status = getElement<HTMLParagraphElement>('#status');
const shotNameLabel = getElement<HTMLElement>('#shot-name');
const shotInfo = getElement<HTMLElement>('#shot-info'); // fps and frame range, kept up to date by rebuild()

async function openFiles(files: File[]) {
  if (files.length === 0) return;
  status.textContent = 'Loading…';
  desktop?.shotOpened(files[0]); // so the desktop app saves next to a dropped shot

  try {
    const shot = await loadShot(files);

    if (mixer && shotRoot) {
      mixer.stopAllAction();
      mixer.uncacheRoot(shotRoot);
    }
    shotRoot = shot.gltf.scene;
    viewport.setShot(shotRoot);

    registry = new SceneRegistry(shotRoot, shot.manifest.nodes);
    // The manifest uses Blender's names, so tidy them the way three.js tidied the node names
    sensors = new Map(
      Object.entries(shot.manifest.cameras).map(([name, info]) => [
        THREE.PropertyBinding.sanitizeNodeName(name),
        info,
      ]),
    );

    selection.select(null);
    outliner.setRegistry(registry);

    mixer = new THREE.AnimationMixer(shotRoot);
    clips = []; // the old clips belonged to the old mixer
    timeline.configure(shot.manifest.fps, shot.manifest); // before rebuild(), which needs the fps
    original = {
      clips: withCurves(shot.gltf.animations, shot.manifest, shot.gltf.scene),
      frameStart: shot.manifest.frameStart,
      frameEnd: shot.manifest.frameEnd,
      poses: {},
      hidden: [],
      settings: {},
    };
    log.clear(); // -> rebuild() from the new original

    shotName = shot.name;
    shotNameLabel.textContent = shot.name;
    document.title = `${shot.name} – RapidVis`;
    shotSource = { dcc: shot.manifest.source.dcc, file: shot.manifest.source.file };
    shotCameras = shot.gltf.cameras.filter(
      (camera): camera is THREE.PerspectiveCamera => camera instanceof THREE.PerspectiveCamera,
    );
    cameraSelect.setCameras(shotCameras);

    status.textContent = shot.warnings.map((warning) => `⚠ ${warning}`).join('\n'); // the chip has the rest
  } catch (error) {
    status.textContent = `✖ ${error instanceof Error ? error.message : String(error)}`;
  }
}

const fileInput = getElement<HTMLInputElement>('#file-input');
/** Opens files the desktop app read from disk (a cancelled dialog gives none). */
function openFromDisk(reading: Promise<ShotFile[]>) {
  reading.then(
    (files) => openFiles(toFiles(files)),
    (error: unknown) => {
      status.textContent = `✖ ${error instanceof Error ? error.message : String(error)}`;
    },
  );
}

getElement<HTMLButtonElement>('#open-button').addEventListener('click', () => {
  if (desktop)
    openFromDisk(desktop.openShot()); // a native Open dialog
  else fileInput.click();
});
if (desktop) openFromDisk(desktop.initialShot()); // `RapidVis.exe shot.glb`
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files ?? []);
  fileInput.value = ''; // lets you pick the same file again and still trigger 'change'
  void openFiles(files);
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
  selection.select(object && registry ? registry.nodeFor(object) : null);
});

// --- Keyboard shortcuts ---
window.addEventListener('keydown', (event) => {
  // Buttons, inputs and dropdowns handle their own keys
  if (
    event.target instanceof HTMLButtonElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof Element && event.target.closest('dialog')) // e.g. Space mid-export
  ) {
    return;
  }

  const ctrl = event.ctrlKey || event.metaKey; // metaKey is Cmd on a Mac
  if (ctrl && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) log.redo();
    else log.undo();
  } else if (ctrl && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    log.redo();
  } else if (ctrl && event.key.toLowerCase() === 's') {
    event.preventDefault(); // not the browser's "Save page as"
    saveEdits();
  } else if (event.code === 'Space') {
    event.preventDefault(); // stop the page from scrolling
    timeline.toggle();
  } else if (event.code === 'ArrowRight') {
    timeline.step(1);
  } else if (event.code === 'ArrowLeft') {
    timeline.step(-1);
  } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault(); // stop the page from scrolling
    const key = nextKey(shownKeys, timeline.frame, event.code === 'ArrowUp' ? 1 : -1);
    if (key !== null) {
      timeline.pause();
      timeline.setFrame(key);
    }
  } else if (event.code === 'Escape') {
    selection.select(null);
  } else if (event.code === 'KeyO') {
    overlaysButton.toggle();
  } else if (event.code === 'KeyB') {
    burnInButton.toggle();
  } else if (event.code === 'KeyT') {
    toggleCards();
  } else if (event.key === '/') {
    event.preventDefault(); // the bar gets its own /, which also opens the menu
    commandBar.setText('/');
  }
});
