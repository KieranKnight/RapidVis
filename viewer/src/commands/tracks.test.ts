import {
  AnimationClip,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import { animates, cloneForEdit, keyFrames } from './tracks';

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

describe('keyFrames', () => {
  it("lists a node's keys in frames, sorted, without repeats", () => {
    // cube.position and cube.quaternion both have keys at 0s and 1s
    expect(keyFrames([makeClip()], 'cube', 24)).toEqual([0, 24]);
  });

  it('lists every key when no node is given', () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, 1, 1, 1]),
      new VectorKeyframeTrack('shotCam.position', [0.5], [0, 0, 0]),
    ]);
    expect(keyFrames([clip], null, 24)).toEqual([0, 12, 24]);
  });

  it('keeps keys that sit between frames (after a retime)', () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('cube.position', [0.5 / 24], [0, 0, 0]),
    ]);
    expect(keyFrames([clip], 'cube', 24)).toEqual([0.5]);
  });
  it("leaves out the add-on's lens and light curves, which have a sample on every frame", () => {
    const clip = new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('shotCam.position', [0, 1], [0, 0, 0, 1, 1, 1]),
      new NumberKeyframeTrack('shotCam.fov', [0, 0.5, 1], [40, 35, 30]),
    ]);
    expect(keyFrames([clip], 'shotCam', 24)).toEqual([0, 24]);
  });
});

describe('animates', () => {
  it('says whether a node, or one of its properties, has any keys', () => {
    expect(animates([makeClip()], 'cube')).toBe(true);
    expect(animates([makeClip()], 'cube', 'position')).toBe(true);
    expect(animates([makeClip()], 'cube', 'scale')).toBe(false);
    expect(animates([makeClip()], 'ground')).toBe(false);
  });
});
