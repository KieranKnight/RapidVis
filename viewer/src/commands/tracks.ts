import { PropertyBinding, type AnimationClip, type KeyframeTrack } from 'three';
import { SAMPLED_PROPERTIES } from '../curves';

/** GLTFLoader tags its CUBICSPLINE factory like this. three's types don't declare `createInterpolant`. */
interface TaggedTrack {
  createInterpolant?: { isInterpolantFactoryMethodGLTFCubicSpline?: boolean };
}

/** Cubic-spline tracks store three things per key: [inTangent, value, outTangent]. */
export function isCubicSpline(track: KeyframeTrack): boolean {
  return (
    (track as TaggedTrack).createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline === true
  );
}

/** Whether a track animates `nodeName` (only its `property`, if one is given). */
function isTrackOf(track: KeyframeTrack, nodeName: string, property?: string): boolean {
  const { nodeName: node, propertyName } = PropertyBinding.parseTrackName(track.name);
  return node === nodeName && (property === undefined || propertyName === property);
}

/** Whether any clip animates `nodeName` (only its `property`, if one is given). */
export function animates(
  clips: readonly AnimationClip[],
  nodeName: string,
  property?: string,
): boolean {
  return clips.some((clip) => clip.tracks.some((track) => isTrackOf(track, nodeName, property)));
}

/**
 * Copies the clips and finds the copied tracks that animate `nodeName`
 * (only its `property` tracks, if one is given). The returned tracks are safe to edit.
 */
export function cloneForEdit(
  clips: readonly AnimationClip[],
  nodeName: string,
  property?: string,
): { clips: AnimationClip[]; tracks: KeyframeTrack[] } {
  const copies = clips.map((clip) => clip.clone());
  const tracks = copies
    .flatMap((clip) => clip.tracks)
    .filter((track) => isTrackOf(track, nodeName, property));
  return { clips: copies, tracks };
}

/**
 * Every key of `nodeName` (or of every node, when it's null), in frames: sorted, no repeats.
 * Rounded to a thousandth of a frame, so float noise does not make two keys out of one.
 */
export function keyFrames(
  clips: readonly AnimationClip[],
  nodeName: string | null,
  fps: number,
): number[] {
  const frames = new Set<number>();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const { nodeName: node, propertyName } = PropertyBinding.parseTrackName(track.name);
      if (nodeName !== null && node !== nodeName) continue;
      if (SAMPLED_PROPERTIES.has(propertyName)) continue; // a sample on every frame, not keys
      for (const time of track.times) frames.add(Math.round(time * fps * 1000) / 1000);
    }
  }
  return [...frames].sort((a, b) => a - b);
}
