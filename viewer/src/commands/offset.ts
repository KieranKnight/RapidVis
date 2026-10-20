import type { AnimationClip } from 'three';
import { cloneForEdit } from './tracks';

/**
 * Moves `nodeName`'s keys `seconds` later (earlier if negative).
 * Returns new clips and never changes the ones passed in. Returns null if the node has no keys.
 */
export function offset(
  clips: readonly AnimationClip[],
  nodeName: string,
  seconds: number,
): AnimationClip[] | null {
  const { clips: result, tracks } = cloneForEdit(clips, nodeName);
  if (tracks.length === 0) return null;

  for (const track of tracks) track.shift(seconds);

  for (const clip of result) clip.resetDuration();
  return result;
}
