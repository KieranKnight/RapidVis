import { PropertyBinding, type AnimationClip, type KeyframeTrack } from 'three';

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
    .filter((track) => {
      const { nodeName: node, propertyName } = PropertyBinding.parseTrackName(track.name);
      return node === nodeName && (property === undefined || propertyName === property);
    });
  return { clips: copies, tracks };
}
