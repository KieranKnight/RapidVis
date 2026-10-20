import type { AnimationClip, KeyframeTrack } from 'three';
import { cloneForEdit, isCubicSpline } from './tracks';

/**
 * Cubic-spline values are stored per key as [inTangent, value, outTangent].
 * Tangents are "change per second", so playing `factor`x faster makes them `factor`x steeper.
 */
function scaleTangents(track: KeyframeTrack, factor: number) {
  const stride = track.getValueSize() / 3; // Numbers in one inTangent / value / outTangent
  const values = track.values;
  for (let key = 0; key < track.times.length; key++) {
    const start = key * stride * 3;
    for (let i = 0; i < stride; i++) {
      values[start + i] *= factor; // inTangent
      values[start + stride * 2 + i] *= factor; // outTangent
    }
  }
}

/**
 * Plays `nodeName`'s animation `factor`x faster, pivoting on its first key (see plan.md).
 * Returns new clips and never changes the ones passed in. Returns null if the node has no keys.
 */
export function retime(
  clips: readonly AnimationClip[],
  nodeName: string,
  factor: number,
): AnimationClip[] | null {
  const { clips: result, tracks } = cloneForEdit(clips, nodeName);
  if (tracks.length === 0) return null;

  const pivot = Math.min(...tracks.map((track) => track.times[0]));
  for (const track of tracks) {
    const times = track.times;
    for (let i = 0; i < times.length; i++) times[i] = pivot + (times[i] - pivot) / factor;
    if (isCubicSpline(track)) scaleTangents(track, factor);
  }

  for (const clip of result) clip.resetDuration();
  return result;
}
