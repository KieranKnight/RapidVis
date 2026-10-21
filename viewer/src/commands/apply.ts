import type { AnimationClip } from 'three';
import { blenderRotationToGltf, blenderScaleToGltf, blenderToGltf, type Vec3 } from '../axes';
import { verticalFov } from '../cameras';
import type { CameraInfo, FrameRange } from '../manifest';
import type { RestPose, SceneNode, SceneRegistry } from '../registry';
import { editKeyAt } from './keys';
import { offset } from './offset';
import type { Command } from './parse';
import { retime } from './retime';
import {
  editTracks,
  moveBy,
  rotateBy,
  scaleBy,
  type EditValue,
  type TransformProperty,
} from './transformAll';

/** Everything commands can change. It grows as commands are added (visibility, lights, ...). */
export interface ShotState extends FrameRange {
  clips: AnimationClip[];
  /** Edited poses of objects that aren't animated, by node id (the mixer never touches these). */
  poses: Readonly<Record<string, Partial<RestPose>>>;
  /** Ids of hidden objects. Hiding an object hides everything parented to it too. */
  hidden: readonly string[];
  /** Light (and later camera) settings, by node id. Each is the latest value typed. */
  settings: Readonly<Record<string, NodeSettings>>;
}

export interface NodeSettings {
  intensity?: number; // multiplier on the loaded brightness
  color?: string; // '#rrggbb'
  focal?: number; // millimetres
}

/** Things commands need to know about the shot, but never change. */
export interface ShotContext {
  registry: SceneRegistry;
  fps: number;
}

export type ApplyResult = { ok: ShotState } | { error: string };

/** The latest earlier command of this kind for this object, so absolute commands can work out the change. */
function latest<V extends Command['verb']>(history: readonly Command[], verb: V, target: string) {
  return history.findLast(
    (c): c is Extract<Command, { verb: V }> =>
      c.verb === verb && 'target' in c && c.target === target,
  );
}

type KeyCommand = Extract<Command, { frame: number }>;

/** The latest earlier key command of the same kind, for the same object and frame. */
function latestKey(history: readonly Command[], command: KeyCommand) {
  return history.findLast(
    (c): c is KeyCommand =>
      c.verb === command.verb &&
      'frame' in c &&
      c.target === command.target &&
      c.frame === command.frame,
  );
}

type TransformCommand = Extract<Command, { by: Vec3 }>;

/**
 * Which property a transform command changes, and the edit that takes it from `before`
 * (the previous command's values, if any) to the command's values. Blender axes in, glTF out.
 */
function transformEdit(
  command: TransformCommand,
  before: readonly number[] | undefined,
): { property: TransformProperty; edit: EditValue } {
  if (command.verb.startsWith('move')) {
    const from = before ?? [0, 0, 0];
    const change = blenderToGltf(command.by.map((value, i) => value - from[i]));
    return { property: 'position', edit: moveBy(change) };
  }
  if (command.verb.startsWith('rotate')) {
    const from = before ?? [0, 0, 0];
    // new rotation x (old rotation undone)
    const change = blenderRotationToGltf(command.by).multiply(blenderRotationToGltf(from).invert());
    return { property: 'quaternion', edit: rotateBy(change) };
  }
  const from = before ?? [1, 1, 1];
  const change = blenderScaleToGltf(command.by.map((value, i) => value / from[i]));
  return { property: 'scale', edit: scaleBy(change) };
}

/** Applies `edit` to a node's property: to its animation if it's animated, otherwise to its still pose. */
function editProperty(
  state: ShotState,
  node: SceneNode,
  property: TransformProperty,
  edit: EditValue,
): ShotState {
  const clips = editTracks(state.clips, node.gltfName, property, edit);
  if (clips) return { ...state, clips };

  const pose = state.poses[node.id] ?? {};
  const values = [...(pose[property] ?? node.rest[property])];
  edit(values, 0, false);
  return { ...state, poses: { ...state.poses, [node.id]: { ...pose, [property]: values } } };
}

/**
 * Where a node's property should sit when it isn't animated: its edited pose, or where it was
 * when the shot loaded. Null when it is animated, because then the mixer is in charge.
 */
export function stillValue(
  state: ShotState,
  node: SceneNode,
  property: TransformProperty,
): readonly number[] | null {
  const trackName = `${node.gltfName}.${property}`;
  const animated = state.clips.some((clip) => clip.tracks.some((t) => t.name === trackName));
  if (animated) return null;
  return state.poses[node.id]?.[property] ?? node.rest[property];
}

/** Merges new values into a node's settings, leaving the others as they were. */
function setting(state: ShotState, id: string, values: NodeSettings): ShotState {
  const merged = { ...state.settings[id], ...values };
  return { ...state, settings: { ...state.settings, [id]: merged } };
}

/**
 * A camera's vertical field of view (degrees) with the edits on top, or null if it has no lens.
 * `camera` is its sensor from the manifest, and `aspect` its frame's width / height.
 */
export function cameraFov(
  state: ShotState,
  node: SceneNode,
  camera: CameraInfo,
  aspect: number,
): number | null {
  const { fov } = node.restSettings;
  if (fov === undefined) return null;
  const focal = state.settings[node.id]?.focal;
  return focal === undefined ? fov : verticalFov(focal, camera, aspect);
}

/** A light's brightness and colour with the edits on top, or null if it isn't a light. */
export function lightLook(
  state: ShotState,
  node: SceneNode,
): { intensity: number; color: string } | null {
  const { intensity, color } = node.restSettings;
  if (intensity === undefined || color === undefined) return null;
  const edits = state.settings[node.id] ?? {};
  return { intensity: intensity * (edits.intensity ?? 1), color: edits.color ?? color };
}

/**
 * Applies one command, returning a new state. The inputs are never changed.
 * `history` is every command applied before this one.
 */
export function applyCommand(
  state: ShotState,
  command: Command,
  context: ShotContext,
  history: readonly Command[],
): ApplyResult {
  if (command.verb === 'trim') {
    return { ok: { ...state, frameStart: command.start, frameEnd: command.end } };
  }

  // Every other command acts on one object
  const found = context.registry.find(command.target);
  if ('error' in found) return { error: found.error };
  const node = found.ok;
  if (command.verb.startsWith('scale-') && (node.type === 'camera' || node.type === 'light')) {
    return { error: `"${node.id}" is a ${node.type}, and those can't be scaled` };
  }

  // All edits are absolute, so each works out the change from where the last one left it
  switch (command.verb) {
    case 'retime': {
      const before = latest(history, 'retime', command.target)?.factor ?? 1;
      const clips = retime(state.clips, node.gltfName, command.factor / before);
      if (!clips) return { error: `"${node.id}" has no animation to retime` };
      return { ok: { ...state, clips } };
    }
    case 'offset': {
      const before = latest(history, 'offset', command.target)?.frames ?? 0;
      const clips = offset(state.clips, node.gltfName, (command.frames - before) / context.fps);
      if (!clips) return { error: `"${node.id}" has no animation to offset` };
      return { ok: { ...state, clips } };
    }
    case 'move-all':
    case 'rotate-all':
    case 'scale-all': {
      const before = latest(history, command.verb, command.target)?.by;
      const { property, edit } = transformEdit(command, before);
      return { ok: editProperty(state, node, property, edit) };
    }
    case 'move-key':
    case 'rotate-key':
    case 'scale-key': {
      const { property, edit } = transformEdit(command, latestKey(history, command)?.by);
      const clips = editKeyAt(
        state.clips,
        node.gltfName,
        property,
        command.frame / context.fps,
        edit,
      );
      if (!clips) {
        const all = command.verb.replace('-key', '-all');
        return { error: `"${node.id}" has no ${property} animation to key. Try ${all}` };
      }
      return { ok: { ...state, clips } };
    }
    case 'hide':
    case 'show': {
      const others = state.hidden.filter((id) => id !== node.id);
      const hidden = command.verb === 'hide' ? [...others, node.id] : others;
      return { ok: { ...state, hidden } };
    }
    case 'intensity':
    case 'color': {
      if (node.type !== 'light') return { error: `"${node.id}" is a ${node.type}, not a light` };
      const value = command.verb === 'intensity' ? command.factor : command.color;
      return { ok: setting(state, node.id, { [command.verb]: value }) };
    }
    case 'focal': {
      if (node.restSettings.fov === undefined) {
        return { error: `"${node.id}" is a ${node.type}, not a perspective camera` };
      }
      return { ok: setting(state, node.id, { focal: command.mm }) };
    }
  }
}

export interface ReplayResult {
  state: ShotState;
  errors: string[]; // commands that no longer apply, and were skipped
}

/** Rebuilds the edited shot from the untouched original by applying every command in order. */
export function replay(
  original: ShotState,
  commands: readonly Command[],
  context: ShotContext,
): ReplayResult {
  let state = original;
  const errors: string[] = [];
  commands.forEach((command, i) => {
    const result = applyCommand(state, command, context, commands.slice(0, i));
    if ('error' in result) errors.push(result.error);
    else state = result.ok;
  });
  return { state, errors };
}
