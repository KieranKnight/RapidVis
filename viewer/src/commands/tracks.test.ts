import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { cloneForEdit } from './tracks';

function makeClip() {
  return new AnimationClip('shot', -1, [
    new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, 1, 1, 1]),
    new QuaternionKeyframeTrack('cube.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new VectorKeyframeTrack('cube_big.position', [0, 1], [0, 0, 0, 1, 1, 1]),
  ]);
}

describe('cloneForEdit', () => {
  it("finds all of a node's tracks, and only that node's (not cube_big)", () => {
    const { tracks } = cloneForEdit([makeClip()], 'cube');
    expect(tracks.map((t) => t.name)).toEqual(['cube.position', 'cube.quaternion']);
  });

  it('can narrow to one property', () => {
    const { tracks } = cloneForEdit([makeClip()], 'cube', 'quaternion');
    expect(tracks.map((t) => t.name)).toEqual(['cube.quaternion']);
  });

  it('returns copies, so editing them leaves the originals alone', () => {
    const original = makeClip();
    const { tracks } = cloneForEdit([original], 'cube', 'position');
    tracks[0].values[0] = 99;
    expect(original.tracks[0].values[0]).toBe(0);
  });
});
