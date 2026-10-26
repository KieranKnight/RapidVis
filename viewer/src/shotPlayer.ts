import * as THREE from 'three';
import { verticalFov } from './cameras';
import {
  applyCommand,
  cameraFov,
  lightLook,
  replay,
  stillValue,
  type ShotContext,
  type ShotState,
} from './commands/apply';
import type { CommandLog } from './commands/log';
import { parseCommand, type ParseResult } from './commands/parse';
import { animates, keyFrames } from './commands/tracks';
import { curveTracks } from './curves';
import type { LoadedShot } from './loader';
import { DEFAULT_CAMERA, type CameraInfo, type Manifest } from './manifest';
import { SceneRegistry, type SceneNode } from './registry';
import { frameToSeconds, type Timeline } from './timeline';
import type { Viewport } from './viewport';

const TRANSFORM_PROPERTIES = ['position', 'quaternion', 'scale'] as const;

/** A shot with nothing edited yet. */
function unedited(clips: THREE.AnimationClip[], frameStart: number, frameEnd: number): ShotState {
  return { clips, frameStart, frameEnd, poses: {}, hidden: [], settings: {} };
}

/**
 * The open shot in three.js: the original from the file, the edited shot that the log's commands
 * make of it, and the mixer that poses it on the timeline's frame. Every edit goes through the log.
 */
export class ShotPlayer {
  name = 'shot';
  source = { dcc: '', file: '' }; // where the shot came from, saved with its edits
  cameras: THREE.PerspectiveCamera[] = [];
  registry: SceneRegistry | null = null;
  /** The original + every applied command. */
  edited: ShotState = unedited([], 1, 1);
  /** Commands in the log that didn't apply on the last rebuild (a key that isn't in this shot, say). */
  failed: string[] = [];

  private readonly viewport: Viewport;
  private readonly timeline: Timeline;
  private readonly log: CommandLog;
  private root: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private original: ShotState = this.edited;
  private clips: THREE.AnimationClip[] = []; // the clips the mixer is playing
  private actions: THREE.AnimationAction[] = [];
  private sensors = new Map<string, CameraInfo>(); // camera sensor sizes from the manifest, by glTF name
  private listeners: Array<() => void> = [];

  constructor(viewport: Viewport, timeline: Timeline, log: CommandLog) {
    this.viewport = viewport;
    this.timeline = timeline;
    this.log = log;
    timeline.onChange(() => this.applyFrame());
    log.onChange(() => this.rebuild());
  }

  /** After every rebuild: the edited shot is posed and ready to show. */
  onRebuild(listener: () => void) {
    this.listeners.push(listener);
  }

  /** Swaps in a newly loaded shot, with an empty log. */
  load(shot: LoadedShot) {
    if (this.mixer && this.root) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.root);
    }
    const root = shot.gltf.scene;
    this.root = root;
    this.viewport.setShot(root);

    this.registry = new SceneRegistry(root, shot.manifest.nodes);
    // The manifest uses Blender's names, so tidy them the way three.js tidied the node names
    this.sensors = new Map(
      Object.entries(shot.manifest.cameras).map(([name, info]) => [
        THREE.PropertyBinding.sanitizeNodeName(name),
        info,
      ]),
    );
    this.name = shot.name;
    this.source = { dcc: shot.manifest.source.dcc, file: shot.manifest.source.file };
    this.cameras = shot.gltf.cameras.filter(
      (camera): camera is THREE.PerspectiveCamera => camera instanceof THREE.PerspectiveCamera,
    );

    this.mixer = new THREE.AnimationMixer(root);
    this.clips = []; // the old clips belonged to the old mixer
    this.timeline.configure(shot.manifest.fps, shot.manifest); // before rebuild(), which needs the fps
    const { frameStart, frameEnd } = shot.manifest;
    const clips = this.withCurves(shot.gltf.animations, shot.manifest, root);
    this.original = unedited(clips, frameStart, frameEnd);
    this.log.clear(); // -> rebuild() from the new original
  }

  /** A camera's sensor from the manifest (or the default one), by its glTF name. */
  sensorFor(name: string): CameraInfo {
    return this.sensors.get(name) ?? DEFAULT_CAMERA;
  }

  /** The edited shot's key frames: every object's (null), or just this one's. */
  keyFrames(node: SceneNode | null): number[] {
    return keyFrames(this.edited.clips, node?.gltfName ?? null, this.timeline.fps);
  }

  /** Reads a command typed (or saved) for this shot: its objects, at the current frame. */
  parse(text: string): ParseResult {
    const registry = this.registry;
    if (!registry) return { error: 'Open a shot first' };
    return parseCommand(text, (query) => registry.find(query), this.timeline.frame);
  }

  /** Runs a typed command. Returns why it can't, or null once it's in the log. */
  run(text: string): string | null {
    const registry = this.registry;
    if (!registry) return 'Open a shot first';

    const parsed = this.parse(text);
    if ('error' in parsed) return parsed.error;
    this.log.setComparing(false); // check it against the edited shot, not the original being compared

    // Dry run, so a command that can't apply is reported and never enters the log
    const applied = applyCommand(this.edited, parsed.ok, this.context(registry), this.log.applied);
    if ('error' in applied) return applied.error;

    this.log.push(parsed.ok); // -> rebuild()
    return null;
  }

  private context(registry: SceneRegistry): ShotContext {
    return { registry, fps: this.timeline.fps };
  }

  /** The one place edits are made: the original clips + every applied command in the log. */
  private rebuild() {
    if (!this.registry) return;
    const result = replay(this.original, this.log.active, this.context(this.registry));
    this.edited = result.state;
    this.failed = result.errors;
    this.setClips(this.edited.clips);
    this.applyStillPoses();
    this.applyVisibility();
    this.applySettings();
    this.timeline.setRange(this.edited);
    for (const listener of this.listeners) listener();
  }

  private applyFrame() {
    if (!this.mixer) return;
    const seconds = frameToSeconds(this.timeline.frame, this.timeline.fps);
    for (const action of this.actions) action.time = seconds;
    this.mixer.update(0);
    this.applySettings(); // after the mixer, since edits go on top of any lens or light animation
  }

  /** Swaps in new clips (e.g. after a command) and shows the current frame with them. */
  private setClips(clips: THREE.AnimationClip[]) {
    const mixer = this.mixer;
    if (!mixer) return;
    mixer.stopAllAction();
    for (const clip of this.clips) mixer.uncacheClip(clip);
    this.clips = clips;
    this.actions = clips.map((clip) => mixer.clipAction(clip).play());
    this.applyFrame();
  }

  /** Objects that are not animated: put them where the edits say (or back where they loaded). */
  private applyStillPoses() {
    for (const node of this.registry?.nodes ?? []) {
      for (const property of TRANSFORM_PROPERTIES) {
        const value = stillValue(this.edited, node, property);
        if (value) node.object[property].fromArray(value);
      }
    }
  }

  /** Hidden objects (and everything parented to them) disappear; everything else shows. */
  private applyVisibility() {
    for (const node of this.registry?.nodes ?? []) {
      node.object.visible = !this.edited.hidden.includes(node.id);
    }
  }

  /**
   * Lights and cameras on this frame: their animation (or loaded settings), with any edits on top.
   * Runs straight after the mixer, so an animated value on the object is this frame's, unedited.
   */
  private applySettings() {
    const edited = this.edited;
    for (const node of this.registry?.nodes ?? []) {
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
        const fov = cameraFov(edited, node, this.sensorFor(node.gltfName), object.aspect, {
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
  private withCurves(clips: THREE.AnimationClip[], manifest: Manifest, root: THREE.Object3D) {
    const fovFor = (node: string, lens: number) => {
      const camera = root.getObjectByName(node);
      const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
      return verticalFov(lens, this.sensorFor(node), aspect);
    };
    const tracks = curveTracks(manifest.curves, manifest.frameStart, manifest.fps, fovFor).filter(
      // skip objects the .glb doesn't have (glTF has no area lights, for one)
      (track) => root.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName),
    );
    return tracks.length > 0 ? [...clips, new THREE.AnimationClip('curves', -1, tracks)] : clips;
  }
}
