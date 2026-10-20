import type { AnimationClip } from 'three';
import { blenderRotationToGltf, blenderScaleToGltf, blenderToGltf } from '../axes';
import type { FrameRange } from '../manifest';
import type { RestPose, SceneNode, SceneRegistry } from '../registry';
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
    case 'move-all': {
      const before = latest(history, 'move-all', command.target)?.by ?? [0, 0, 0];
      const change = blenderToGltf(command.by.map((value, i) => value - before[i]));
      return { ok: editProperty(state, node, 'position', moveBy(change)) };
    }
    case 'rotate-all': {
      const before = latest(history, 'rotate-all', command.target)?.by ?? [0, 0, 0];
      // new rotation x (old rotation undone)
      const change = blenderRotationToGltf(command.by).multiply(
        blenderRotationToGltf(before).invert(),
      );
      return { ok: editProperty(state, node, 'quaternion', rotateBy(change)) };
    }
    case 'scale-all': {
      if (node.type === 'camera' || node.type === 'light') {
        return { error: `"${node.id}" is a ${node.type}, and those can't be scaled` };
      }
      const before = latest(history, 'scale-all', command.target)?.by ?? [1, 1, 1];
      const change = blenderScaleToGltf(command.by.map((value, i) => value / before[i]));
      return { ok: editProperty(state, node, 'scale', scaleBy(change)) };
    }
    case 'hide':
    case 'show': {
      const others = state.hidden.filter((id) => id !== node.id);
      const hidden = command.verb === 'hide' ? [...others, node.id] : others;
      return { ok: { ...state, hidden } };
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
