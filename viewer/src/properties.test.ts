import {
  AnimationClip,
  ColorKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import { channels, describeKeys, intensityCommand } from './properties';

const FPS = 24;

describe('channels', () => {
  const clip = new AnimationClip('shot', -1, [
    new QuaternionKeyframeTrack('cube.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new VectorKeyframeTrack('cube.position', [0, 0.5, 1], [0, 0, 0, 1, 1, 1, 2, 2, 2]),
    new VectorKeyframeTrack('other.position', [0, 2], [0, 0, 0, 1, 1, 1]),
    new ColorKeyframeTrack('cube.color', [0, 1], [1, 1, 1, 0, 0, 0]),
  ]);

  it("lists only this object's properties, in Blender's words and a steady order", () => {
    expect(channels([clip], 'cube', FPS)).toEqual([
      { name: 'location', keys: [0, 12, 24] },
      { name: 'rotation', keys: [0, 24] },
      { name: 'color', keys: 'sampled' },
    ]);
  });

  it('is empty for an object with no animation', () => {
    expect(channels([clip], 'ground', FPS)).toEqual([]);
  });
});

describe('describeKeys', () => {
  it('lists a few keys', () => {
    expect(describeKeys([12, 48])).toBe('keys 12, 48');
  });

  it('shortens a long list, keeping the last key and the count', () => {
    expect(describeKeys([1, 5, 9, 13, 17, 48])).toBe('keys 1, 5, 9 … 48 (6)');
  });

  it('says when a curve has a sample on every frame', () => {
    expect(describeKeys('sampled')).toBe('every frame');
  });
});

describe('intensityCommand', () => {
  it("rounds to the slider's step, so the log reads cleanly", () => {
    expect(intensityCommand('key_light', 1.2000000000000002)).toEqual({
      verb: 'intensity',
      target: 'key_light',
      factor: 1.2,
    });
  });
});
