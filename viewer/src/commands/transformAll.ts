import { Quaternion, type AnimationClip } from 'three';
import type { Vec3 } from '../axes';
import { cloneForEdit, isCubicSpline } from './tracks';

export type TransformProperty = 'position' | 'quaternion' | 'scale';

/**
 * Edits one stored value in place: `values[offset]` onwards holds 3 numbers (position, scale)
 * or 4 (quaternion). `isTangent` says whether it's a cubic-spline tangent rather than a key value.
 * The same edit works on animation keys and on a still object's pose.
 */
export type EditValue = (
  values: Float32Array | number[],
  offset: number,
  isTangent: boolean,
) => void;

/** Adds `by` to positions. Tangents are slopes, and sliding a curve doesn't change its slope. */
export function moveBy(by: Vec3): EditValue {
  return (values, offset, isTangent) => {
    if (isTangent) return;
    for (let i = 0; i < 3; i++) values[offset + i] += by[i];
  };
}

/** Turns rotations by `by`, on the parent's side (like Blender's delta rotation). */
export function rotateBy(by: Quaternion): EditValue {
  const q = new Quaternion();
  // Multiplying is linear, so tangents turn the same way as the values
  return (values, offset) => {
    q.fromArray(values, offset).premultiply(by).toArray(values, offset);
  };
}

/** Multiplies scales by `by`, axis by axis. Linear again, so tangents scale too. */
export function scaleBy(by: Vec3): EditValue {
  return (values, offset) => {
    for (let i = 0; i < 3; i++) values[offset + i] *= by[i];
  };
}

/**
 * Applies `edit` to every key (and tangent) of the node's `property` animation.
 * Returns new clips, or null if that property isn't animated.
 */
export function editTracks(
  clips: readonly AnimationClip[],
  nodeName: string,
  property: TransformProperty,
  edit: EditValue,
): AnimationClip[] | null {
  const { clips: result, tracks } = cloneForEdit(clips, nodeName, property);
  if (tracks.length === 0) return null;

  for (const track of tracks) {
    const parts = isCubicSpline(track) ? 3 : 1; // [inTangent, value, outTangent], or just a value
    const size = track.getValueSize() / parts;
    for (let i = 0; i < track.times.length * parts; i++) {
      edit(track.values, i * size, parts === 3 && i % 3 !== 1);
    }
  }
  return result;
}
