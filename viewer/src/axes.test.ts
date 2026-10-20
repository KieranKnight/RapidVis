import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { blenderRotationToGltf, blenderScaleToGltf, blenderToGltf } from './axes';

/** Compares number lists with a little tolerance (and without caring about 0 vs -0). */
function expectClose(actual: ArrayLike<number>, expected: number[]) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

/** Rotates a Blender-axes vector with a glTF-axes quaternion, and answers in glTF axes. */
function rotate(degrees: number[], blenderVector: number[]) {
  const v = new Vector3(...blenderToGltf(blenderVector));
  return v.applyQuaternion(blenderRotationToGltf(degrees)).toArray();
}

describe('blenderToGltf', () => {
  it("turns Blender's up (Z) into glTF's up (Y)", () => {
    expectClose(blenderToGltf([0, 0, 1]), [0, 1, 0]);
  });

  it("turns Blender's forward (+Y) into glTF's -Z", () => {
    expectClose(blenderToGltf([0, 1, 0]), [0, 0, -1]);
  });

  it('leaves X alone', () => {
    expectClose(blenderToGltf([1, 0, 0]), [1, 0, 0]);
  });
});

describe('blenderScaleToGltf', () => {
  it('swaps Y and Z without flipping', () => {
    expect(blenderScaleToGltf([1, 2, 3])).toEqual([1, 3, 2]);
  });
});

describe('blenderRotationToGltf', () => {
  it('turning 90° around Blender Z turns X into Y, in either axes', () => {
    expectClose(rotate([0, 0, 90], [1, 0, 0]), blenderToGltf([0, 1, 0]));
  });

  it('applies X first, then Y, then Z (Blender XYZ order)', () => {
    // X 90° leaves the X axis alone, then Z 90° turns it into Y
    expectClose(rotate([90, 0, 90], [1, 0, 0]), blenderToGltf([0, 1, 0]));
    // X 90° turns Y into Z, then Z 90° leaves Z alone
    expectClose(rotate([90, 0, 90], [0, 1, 0]), blenderToGltf([0, 0, 1]));
  });

  it('no rotation is the identity quaternion', () => {
    expectClose(blenderRotationToGltf([0, 0, 0]).toArray(), [0, 0, 0, 1]);
  });
});
