import { PropertyBinding, type AnimationClip } from 'three';
import type { Command } from './commands/parse';
import { SAMPLED_PROPERTIES } from './curves';

/** The intensity slider: a multiplier on the light's loaded brightness, like the command. */
export const INTENSITY = { min: 0, max: 10, step: 0.1 } as const;

// The properties three.js animates, in the words the commands (and Blender) use
const CHANNEL_NAMES: Record<string, string> = {
  position: 'location',
  quaternion: 'rotation',
  scale: 'scale',
  fov: 'lens',
  intensity: 'intensity',
  color: 'color',
};

/** One animated property of an object, and where its keys are. */
export interface Channel {
  name: string;
  /** The key frames, or 'sampled' for a curve that has a sample on every frame. */
  keys: number[] | 'sampled';
}

/** What an object's animation changes, in a steady order: transforms first, then the rest. */
export function channels(
  clips: readonly AnimationClip[],
  nodeName: string,
  fps: number,
): Channel[] {
  const found = new Map<string, Set<number> | 'sampled'>();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const { nodeName: node, propertyName } = PropertyBinding.parseTrackName(track.name);
      if (node !== nodeName) continue;
      const name = CHANNEL_NAMES[propertyName] ?? propertyName;
      if (SAMPLED_PROPERTIES.has(propertyName)) {
        found.set(name, 'sampled');
        continue;
      }
      const frames = found.get(name);
      const set = frames instanceof Set ? frames : new Set<number>();
      for (const time of track.times) set.add(Math.round(time * fps * 1000) / 1000);
      found.set(name, set);
    }
  }
  const order = Object.values(CHANNEL_NAMES);
  return [...found]
    .map(([name, keys]) => ({
      name,
      keys: keys === 'sampled' ? keys : [...keys].sort((a, b) => a - b),
    }))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

/** "keys 12, 48", shortened for long lists: "keys 1, 5, 9 … 48 (12)". */
export function describeKeys(keys: Channel['keys'], shown = 4): string {
  if (keys === 'sampled') return 'every frame';
  const frames = keys.map((frame) => String(Number(frame.toFixed(2))));
  if (frames.length <= shown) return `keys ${frames.join(', ')}`;
  return `keys ${frames.slice(0, shown - 1).join(', ')} … ${frames.at(-1)} (${frames.length})`;
}

// What the controls type: real commands, so they go through the same checks as typed ones
export const colorCommand = (target: string, hex: string): Command => ({
  verb: 'color',
  target,
  color: hex,
});

export const intensityCommand = (target: string, factor: number): Command => ({
  verb: 'intensity',
  target,
  factor: Math.round(factor * 10) / 10, // the slider's step, without float noise like 1.2000000002
});

export const focalCommand = (target: string, mm: number): Command => ({
  verb: 'focal',
  target,
  mm: Math.round(mm * 10) / 10,
});
