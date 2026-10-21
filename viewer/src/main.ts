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

import { suggest } from './commands/complete';
import { keyFrames } from './commands/tracks';
import { loadShot } from './loader';
import { DEFAULT_CAMERA, type CameraInfo } from './manifest';
import { SceneRegistry } from './registry';
import { nextKey } from './ruler';
import { Selection } from './selection';
import './style.css';
import { Timeline, frameToSeconds } from './timeline';
import { createCameraSelect } from './ui/cameraSelect';
import { createCommandBar } from './ui/commandBar';
import { droppedFiles } from './ui/droppedFiles';
import { createOutliner } from './ui/outliner';
import { createTimelineBar } from './ui/timelineBar';
import { createToggleButton } from './ui/toggleButton';
import { createViewport } from './viewport';

function getElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

// --- Components ---
const container = getElement<HTMLElement>('#viewport');
const viewport = createViewport(container);
const cameraSelect = createCameraSelect(container, (camera) => viewport.setViewCamera(camera));
const toolbar = document.createElement('div');
toolbar.className = 'viewport-toolbar';
container.append(toolbar);
const overlaysButton = createToggleButton(toolbar, 'Overlays', true, (on) =>
  viewport.setOverlays(on),
);

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

function applyFrame() {
  if (!mixer) return;
  const seconds = frameToSeconds(timeline.frame, timeline.fps);
  for (const action of actions) action.time = seconds;
  mixer.update(0);
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
  edited = replay(original, log.applied, { registry, fps: timeline.fps }).state;
  setClips(edited.clips);
  applyStillPoses();
  applyVisibility();
  applySettings();
  timeline.setRange(edited);
  updateKeys();
}

let shownKeys: number[] = []; // what the ruler shows, and what ↑/↓ jump between

/** Key markers: the selected object's keys, or every key when nothing is selected. */
function updateKeys() {
  const node = selection.selected;
  shownKeys = keyFrames(edited.clips, node ? node.gltfName : null, timeline.fps);
  timelineBar.setKeys(shownKeys);
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

/** Lights and cameras: their loaded settings, with any edits on top. */
function applySettings() {
  if (!registry) return;
  for (const node of registry.nodes) {
    const { object } = node;
    const look = lightLook(edited, node);
    if (look && object instanceof THREE.Light) {
      object.intensity = look.intensity;
      object.color.set(look.color);
    }
    if (object instanceof THREE.PerspectiveCamera) {
      const sensor = sensors.get(node.gltfName) ?? DEFAULT_CAMERA;
      const fov = cameraFov(edited, node, sensor, object.aspect);
      if (fov !== null && fov !== object.fov) {
        object.fov = fov;
        object.updateProjectionMatrix(); // three.js only rebuilds the lens when asked
      }
    }
  }
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
const commandBar = createCommandBar(container, runCommand, (before) =>
  suggest(before, registry?.nodes ?? [], (verb, node) => targetError(verb, node, edited) === null),
);
createHistoryPanel(getElement<HTMLElement>('#outliner'), log, (text) => commandBar.setText(text));

viewport.start((deltaSeconds) => timeline.tick(deltaSeconds));

// --- Loading ---
const status = getElement<HTMLParagraphElement>('#status');

async function openFiles(files: File[]) {
  if (files.length === 0) return;
  status.textContent = 'Loading…';

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
      clips: shot.gltf.animations,
      frameStart: shot.manifest.frameStart,
      frameEnd: shot.manifest.frameEnd,
      poses: {},
      hidden: [],
      settings: {},
    };
    log.clear(); // -> rebuild() from the new original

    cameraSelect.setCameras(
      shot.gltf.cameras.filter(
        (camera): camera is THREE.PerspectiveCamera => camera instanceof THREE.PerspectiveCamera,
      ),
    );

    const { fps, frameStart, frameEnd } = shot.manifest;
    status.textContent = [
      `${shot.name}: ${fps} fps, frames ${frameStart}–${frameEnd}`,
      ...shot.warnings.map((warning) => `⚠ ${warning}`),
    ].join('\n');
  } catch (error) {
    status.textContent = `✖ ${error instanceof Error ? error.message : String(error)}`;
  }
}

const fileInput = getElement<HTMLInputElement>('#file-input');
getElement<HTMLButtonElement>('#open-button').addEventListener('click', () => fileInput.click());
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
    event.target instanceof HTMLSelectElement
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
  } else if (event.key === '/') {
    event.preventDefault(); // the bar gets its own /, which also opens the menu
    commandBar.setText('/');
  }
});
