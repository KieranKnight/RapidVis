import {
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import { editKey, ensureKey, findKey, valueAt } from './keys';
import { moveBy } from './transformAll';

/** Tags a track the way GLTFLoader tags CUBICSPLINE tracks. */
function asCubic<T extends KeyframeTrack>(track: T): T {
  const factory = () => {
    throw new Error('not sampled in these tests');
  };
  const tag = { isInterpolantFactoryMethodGLTFCubicSpline: true };
  return Object.assign(track, { createInterpolant: Object.assign(factory, tag) });
}

/** A smooth 0 -> 10 -> 0 curve over 2 seconds. Per key: [inTangent, value, outTangent]. */
function makeCubic() {
  return asCubic(new NumberKeyframeTrack('cube.x', [0, 1, 2], [0, 0, 5, 0, 10, 0, -5, 0, 0]));
}

const linear = () => new NumberKeyframeTrack('cube.x', [0, 1], [0, 10]);

describe('findKey', () => {
  it('finds a key at that time, or -1', () => {
    expect(findKey(linear(), 1)).toBe(1);
    expect(findKey(linear(), 0.5)).toBe(-1);
  });

  it('ignores tiny floating-point differences', () => {
    expect(findKey(linear(), 1 + 1e-7)).toBe(1);
  });
});

describe('valueAt', () => {
  it('interpolates linear tracks', () => {
    expect(valueAt(linear(), 0.25)).toEqual([2.5]);
  });

  it('slerps quaternion tracks (staying a unit quaternion)', () => {
    const halfTurn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const track = new QuaternionKeyframeTrack(
      'cube.quaternion',
      [0, 1],
      [0, 0, 0, 1, ...halfTurn.toArray()],
    );
    const q = new Quaternion().fromArray(valueAt(track, 0.5));
    expect(q.length()).toBeCloseTo(1, 6);
    expect(q.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 4, 5);
  });

  it('follows the cubic curve, which passes through its keys', () => {
    expect(valueAt(makeCubic(), 1)[0]).toBeCloseTo(10, 6);
    expect(valueAt(makeCubic(), 0.5)[0]).toBeGreaterThan(5); // bulges above a straight line
  });
});

describe('ensureKey', () => {
  it('returns an existing key without adding one', () => {
    const track = linear();
    expect(ensureKey(track, 1)).toBe(1);
    expect(track.times.length).toBe(2);
  });

  it('inserts a linear key on the line, in time order', () => {
    const track = linear();
    expect(ensureKey(track, 0.5)).toBe(1);
    expect(Array.from(track.times)).toEqual([0, 0.5, 1]);
    expect(Array.from(track.values)).toEqual([0, 5, 10]);
  });

  it('inserts a cubic key without changing the shape of the curve', () => {
    const track = makeCubic();
    const before = [0.1, 0.3, 0.45, 0.7, 1.4].map((t) => valueAt(track, t)[0]);
    ensureKey(track, 0.4);
    expect(track.times.length).toBe(4);
    const after = [0.1, 0.3, 0.45, 0.7, 1.4].map((t) => valueAt(track, t)[0]);
    after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 5));
  });

  it('can add keys before the first and after the last', () => {
    const track = linear();
    ensureKey(track, -1);
    ensureKey(track, 3);
    expect(Array.from(track.times)).toEqual([-1, 0, 1, 3]);
    expect(Array.from(track.values)).toEqual([0, 0, 10, 10]);
  });
});

describe('editKey', () => {
  it('moves one key and leaves its neighbours alone', () => {
    const track = new NumberKeyframeTrack('cube.x', [0, 1, 2], [0, 10, 0]);
    editKey(track, 1, (values, offset) => (values[offset] += 5));
    expect(Array.from(track.values)).toEqual([0, 15, 0]);
  });

  it("moves a cubic key's value but not its tangents (with moveBy)", () => {
    // one key of 3 numbers each: [inTangent, value, outTangent]
    const track = asCubic(
      new VectorKeyframeTrack('cube.position', [0], [1, 1, 1, 5, 5, 5, 2, 2, 2]),
    );
    editKey(track, 0, moveBy([1, 0, 0]));
    expect(Array.from(track.values)).toEqual([1, 1, 1, 6, 5, 5, 2, 2, 2]);
  });
});
