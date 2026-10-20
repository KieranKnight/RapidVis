import { AnimationClip, NumberKeyframeTrack, VectorKeyframeTrack, type KeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { retime } from './retime';

/** Tags a track the way GLTFLoader tags CUBICSPLINE tracks. */
function asCubic<T extends KeyframeTrack>(track: T): T {
  const factory = () => {
    throw new Error('not sampled in these tests');
  };
  const tag = { isInterpolantFactoryMethodGLTFCubicSpline: true };
  return Object.assign(track, { createInterpolant: Object.assign(factory, tag) });
}

function makeClip() {
  return new AnimationClip('shot', -1, [
    new VectorKeyframeTrack('cube.position', [1, 2, 3], [0, 0, 0, 1, 1, 1, 2, 2, 2]),
    new NumberKeyframeTrack('cube.morphTargetInfluences', [2, 4], [0, 1]),
    new VectorKeyframeTrack('shotCam.position', [1, 3], [0, 0, 0, 5, 5, 5]),
  ]);
}

const timesOf = (clip: AnimationClip, index: number) => Array.from(clip.tracks[index].times);

describe('retime', () => {
  it('speeds up around the first key, not frame 0', () => {
    const [clip] = retime([makeClip()], 'cube', 2)!;
    expect(timesOf(clip, 0)).toEqual([1, 1.5, 2]);
  });

  it('slows down when the factor is below 1', () => {
    const [clip] = retime([makeClip()], 'cube', 0.5)!;
    expect(timesOf(clip, 0)).toEqual([1, 3, 5]);
  });

  it("uses one pivot for all of the node's tracks", () => {
    const [clip] = retime([makeClip()], 'cube', 2)!;
    expect(timesOf(clip, 1)).toEqual([1.5, 2.5]); // pivot is 1 (from position), not 2
  });

  it('leaves other nodes and the original clip alone', () => {
    const original = makeClip();
    const [clip] = retime([original], 'cube', 2)!;
    expect(timesOf(clip, 2)).toEqual([1, 3]);
    expect(timesOf(original, 0)).toEqual([1, 2, 3]);
  });

  it('updates the clip duration', () => {
    const [clip] = retime([makeClip()], 'shotCam', 0.25)!;
    expect(clip.duration).toBe(9); // shotCam now ends at 1 + 2 / 0.25
  });

  it('scales cubic-spline tangents by the factor and keeps the values', () => {
    // per key: [inTangent, value, outTangent]
    const track = asCubic(
      new NumberKeyframeTrack('cube.morphTargetInfluences', [0, 1], [-1, 0, 2, 3, 10, 4]),
    );
    const [clip] = retime([new AnimationClip('shot', -1, [track])], 'cube', 2)!;
    expect(Array.from(clip.tracks[0].values)).toEqual([-2, 0, 4, 6, 10, 8]);
  });

  it('returns null when the node has no keys', () => {
    expect(retime([makeClip()], 'ground', 2)).toBeNull();
  });
});
