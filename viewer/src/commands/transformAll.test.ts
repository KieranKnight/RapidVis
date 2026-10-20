import {
  AnimationClip,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import { editTracks, moveBy, rotateBy, scaleBy } from './transformAll';

/** Tags a track the way GLTFLoader tags CUBICSPLINE tracks. */
function asCubic<T extends KeyframeTrack>(track: T): T {
  const factory = () => {
    throw new Error('not sampled in these tests');
  };
  const tag = { isInterpolantFactoryMethodGLTFCubicSpline: true };
  return Object.assign(track, { createInterpolant: Object.assign(factory, tag) });
}

const valuesOf = (clips: AnimationClip[] | null, index = 0) =>
  Array.from(clips![0].tracks[index].values);

describe('moveBy', () => {
  it('adds to every key', () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, 1, 2, 3]),
    ]);
    const clips = editTracks([clip], 'cube', 'position', moveBy([10, 20, 30]));
    expect(valuesOf(clips)).toEqual([10, 20, 30, 11, 22, 33]);
  });

  it('leaves cubic-spline tangents alone', () => {
    // one key: [inTangent, value, outTangent]
    const track = asCubic(
      new VectorKeyframeTrack('cube.position', [0], [1, 1, 1, 5, 5, 5, 2, 2, 2]),
    );
    const clips = editTracks(
      [new AnimationClip('shot', -1, [track])],
      'cube',
      'position',
      moveBy([1, 0, 0]),
    );
    expect(valuesOf(clips)).toEqual([1, 1, 1, 6, 5, 5, 2, 2, 2]);
  });

  it('works on a plain array too (a still object)', () => {
    const pose = [1, 2, 3];
    moveBy([1, 1, 1])(pose, 0, false);
    expect(pose).toEqual([2, 3, 4]);
  });
});

describe('rotateBy', () => {
  it('turns every key, on the parent side', () => {
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const start = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 4);
    const clip = new AnimationClip('shot', -1, [
      new QuaternionKeyframeTrack('cube.quaternion', [0], start.toArray()),
    ]);
    const clips = editTracks([clip], 'cube', 'quaternion', rotateBy(turn));
    const expected = start.clone().premultiply(turn).toArray();
    valuesOf(clips).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));
  });
});

describe('scaleBy', () => {
  it('multiplies values and tangents, axis by axis', () => {
    const track = asCubic(new VectorKeyframeTrack('cube.scale', [0], [1, 1, 1, 2, 2, 2, 1, 1, 1]));
    const clips = editTracks(
      [new AnimationClip('shot', -1, [track])],
      'cube',
      'scale',
      scaleBy([2, 3, 4]),
    );
    expect(valuesOf(clips)).toEqual([2, 3, 4, 4, 6, 8, 2, 3, 4]);
  });
});

describe('editTracks', () => {
  it("returns null when that property isn't animated", () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('cube.position', [0], [0, 0, 0]),
    ]);
    expect(editTracks([clip], 'cube', 'scale', scaleBy([2, 2, 2]))).toBeNull();
  });

  it('never changes the clips passed in', () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('cube.position', [0], [0, 0, 0]),
    ]);
    editTracks([clip], 'cube', 'position', moveBy([1, 1, 1]));
    expect(Array.from(clip.tracks[0].values)).toEqual([0, 0, 0]);
  });
});
