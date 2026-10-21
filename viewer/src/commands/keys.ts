import type { AnimationClip, KeyframeTrack } from 'three';
import { cloneForEdit, isCubicSpline } from './tracks';
import type { EditValue, TransformProperty } from './transformAll';

/** Keys closer than this (in seconds) count as the same key: well under a thousandth of a frame. */
const SAME_TIME = 1e-5;

/** The index of the key at `time`, or -1 if there isn't one. */
export function findKey(track: KeyframeTrack, time: number): number {
  return track.times.findIndex((t) => Math.abs(t - time) < SAME_TIME);
}

/** A copy of `array` with `items` inserted at index `at`. (Typed arrays can't grow.) */
function insertInto(array: Float32Array, at: number, items: ArrayLike<number>): Float32Array {
  const result = new Float32Array(array.length + items.length);
  result.set(array.subarray(0, at));
  result.set(items, at);
  result.set(array.subarray(at), at + items.length);
  return result;
}

/**
 * Samples a cubic-spline track at `time`: its value and its slope (change per second).
 * This is the same Hermite curve the glTF loader plays back.
 */
function sampleCubic(track: KeyframeTrack, time: number): { value: number[]; slope: number[] } {
  const { times, values } = track;
  const size = track.getValueSize() / 3;
  const valueOf = (key: number, part: number) =>
    Array.from(values.subarray((key * 3 + part) * size, (key * 3 + part + 1) * size));

  // Before the first key or after the last one, the curve holds still
  const last = times.length - 1;
  if (time <= times[0]) return { value: valueOf(0, 1), slope: new Array(size).fill(0) };
  if (time >= times[last]) return { value: valueOf(last, 1), slope: new Array(size).fill(0) };

  const k = times.findIndex((t) => t > time) - 1; // the key just before `time`
  const span = times[k + 1] - times[k];
  const s = (time - times[k]) / span; // 0..1 through this segment
  const p0 = valueOf(k, 1);
  const m0 = valueOf(k, 2).map((v) => v * span); // out-tangent, scaled to the segment
  const p1 = valueOf(k + 1, 1);
  const m1 = valueOf(k + 1, 0).map((v) => v * span); // in-tangent, scaled to the segment

  const value = p0.map(
    (_, i) =>
      (2 * s ** 3 - 3 * s ** 2 + 1) * p0[i] +
      (s ** 3 - 2 * s ** 2 + s) * m0[i] +
      (-2 * s ** 3 + 3 * s ** 2) * p1[i] +
      (s ** 3 - s ** 2) * m1[i],
  );
  // The derivative of the line above, divided by `span` to turn "per segment" into "per second"
  const slope = p0.map(
    (_, i) =>
      ((6 * s ** 2 - 6 * s) * p0[i] +
        (3 * s ** 2 - 4 * s + 1) * m0[i] +
        (-6 * s ** 2 + 6 * s) * p1[i] +
        (3 * s ** 2 - 2 * s) * m1[i]) /
      span,
  );
  return { value, slope };
}

/** The track's value at `time`, following its interpolation (linear, slerp, or cubic spline). */
export function valueAt(track: KeyframeTrack, time: number): number[] {
  if (isCubicSpline(track)) return sampleCubic(track, time).value;
  const result = new Float32Array(track.getValueSize());
  // For quaternion tracks this is three's slerp interpolant, so rotations blend correctly
  return Array.from(track.InterpolantFactoryMethodLinear(result).evaluate(time));
}

/**
 * Makes sure the track has a key at `time` and returns its index. A new key sits exactly on the
 * existing curve (with matching tangents), so the motion doesn't change until the key is edited.
 * Changes the track in place, so only use it on a copy (see cloneForEdit).
 */
export function ensureKey(track: KeyframeTrack, time: number): number {
  const existing = findKey(track, time);
  if (existing !== -1) return existing;

  let parts: number[];
  if (isCubicSpline(track)) {
    const { value, slope } = sampleCubic(track, time);
    parts = [...slope, ...value, ...slope]; // [inTangent, value, outTangent]
  } else {
    parts = valueAt(track, time);
  }

  const later = track.times.findIndex((t) => t > time);
  const at = later === -1 ? track.times.length : later;
  track.times = insertInto(track.times, at, [time]);
  track.values = insertInto(track.values, at * parts.length, parts);
  return at;
}

/** Applies `edit` to one key: its value, and its tangents if it has them. */
export function editKey(track: KeyframeTrack, index: number, edit: EditValue) {
  const cubic = isCubicSpline(track);
  const parts = cubic ? 3 : 1;
  const size = track.getValueSize() / parts;
  for (let part = 0; part < parts; part++) {
    edit(track.values, (index * parts + part) * size, cubic && part !== 1);
  }
}

/**
 * Edits the node's `property` key at `time`, adding a key there first if there isn't one.
 * Returns new clips, or null if that property isn't animated.
 */
export function editKeyAt(
  clips: readonly AnimationClip[],
  nodeName: string,
  property: TransformProperty,
  time: number,
  edit: EditValue,
): AnimationClip[] | null {
  const { clips: result, tracks } = cloneForEdit(clips, nodeName, property);
  if (tracks.length === 0) return null;

  for (const track of tracks) editKey(track, ensureKey(track, time), edit);

  for (const clip of result) clip.resetDuration(); // a key after the end makes the clip longer
  return result;
}
