import { Euler, MathUtils, Quaternion } from 'three';

export type Vec3 = [number, number, number];

/*
 * Commands are typed in Blender's axes (Z up); glTF and three.js use Y up.
 * The glTF exporter converts (x, y, z) -> (x, z, -y): Blender's up (Z) becomes glTF's up (Y),
 * and Blender's forward (+Y) becomes glTF's -Z. Checked against real Blender exports.
 */

/** A direction or offset, from Blender axes to glTF axes. */
export function blenderToGltf([x, y, z]: readonly number[]): Vec3 {
  return [x, z, -y];
}

/** Scale factors swap axes like positions do, but never flip sign: a scale has no direction. */
export function blenderScaleToGltf([x, y, z]: readonly number[]): Vec3 {
  return [x, z, y];
}

/** A Blender XYZ Euler rotation (degrees), as a quaternion in glTF axes. */
export function blenderRotationToGltf([x, y, z]: readonly number[]): Quaternion {
  // Blender's "XYZ" turns around X first, then Y, then Z. three.js calls that order 'ZYX'.
  const euler = new Euler(
    MathUtils.degToRad(x),
    MathUtils.degToRad(y),
    MathUtils.degToRad(z),
    'ZYX',
  );
  const q = new Quaternion().setFromEuler(euler);

  // A quaternion is an axis and an angle: convert the axis, keep the angle
  const [ax, ay, az] = blenderToGltf([q.x, q.y, q.z]);
  return new Quaternion(ax, ay, az, q.w);
}
