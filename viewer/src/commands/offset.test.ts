import { AnimationClip, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { offset } from './offset';

function makeClip() {
  return new AnimationClip('shot', -1, [
    new VectorKeyframeTrack('cube.position', [1, 2], [0, 0, 0, 1, 1, 1]),
    new VectorKeyframeTrack('shotCam.position', [1, 3], [0, 0, 0, 5, 5, 5]),
  ]);
}

const timesOf = (clip: AnimationClip, index: number) => Array.from(clip.tracks[index].times);

describe('offset', () => {
  it("moves only that node's keys later", () => {
    const [clip] = offset([makeClip()], 'cube', 0.5)!;
    expect(timesOf(clip, 0)).toEqual([1.5, 2.5]);
    expect(timesOf(clip, 1)).toEqual([1, 3]);
  });

  it('moves keys earlier with a negative offset', () => {
    const [clip] = offset([makeClip()], 'cube', -1)!;
    expect(timesOf(clip, 0)).toEqual([0, 1]);
  });

  it('keeps the values and leaves the original clip alone', () => {
    const original = makeClip();
    const [clip] = offset([original], 'cube', 2)!;
    expect(Array.from(clip.tracks[0].values)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(timesOf(original, 0)).toEqual([1, 2]);
  });

  it('updates the clip duration', () => {
    const [clip] = offset([makeClip()], 'cube', 4)!;
    expect(clip.duration).toBe(6);
  });

  it('returns null when the node has no keys', () => {
    expect(offset([makeClip()], 'ground', 1)).toBeNull();
  });
});
