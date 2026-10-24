import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import {
  cameraFrustumPoints,
  createGizmo,
  pointLightPoints,
  spotLightPoints,
  sunLightPoints,
  updateCameraGizmo,
} from './gizmos';

function expectPoint(points: number[], index: number, expected: [number, number, number]) {
  const actual = points.slice(index * 3, index * 3 + 3);
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value));
}

describe('gizmo shapes', () => {
  it('always produces whole line segments', () => {
    const shapes = [
      cameraFrustumPoints(50, 16 / 9, 1),
      pointLightPoints(1),
      spotLightPoints(0.5, 1),
      sunLightPoints(1),
    ];
    for (const points of shapes) expect(points.length % 6).toBe(0);
  });

  it('places the camera frame from the FOV and aspect', () => {
    // 90° FOV at distance 1: half-height = tan(45°) = 1; aspect 2 -> half-width = 2
    const points = cameraFrustumPoints(90, 2, 1);
    expectPoint(points, 3, [2, 1, -1]); // segment 1 = apex -> top-right
  });

  it('puts the up triangle above the frame', () => {
    const points = cameraFrustumPoints(90, 2, 1);
    const ys = points.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(1.6);
  });

  it('sizes the spot cone from its half-angle', () => {
    // 45° half-angle at distance 1 -> radius 1. The base ring starts after the 24-segment source ring
    const points = spotLightPoints(Math.PI / 4, 1);
    expectPoint(points, 48, [1, 0, -1]);
  });
});

describe('updateCameraGizmo', () => {
  it("reshapes the frustum to the camera's new lens", () => {
    const camera = new PerspectiveCamera(90, 2);
    const gizmo = createGizmo(camera, 1)!;
    camera.fov = 45;
    updateCameraGizmo(gizmo, camera);
    const points = Array.from(gizmo.geometry.getAttribute('position').array);
    expect(points).toEqual(Array.from(new Float32Array(cameraFrustumPoints(45, 2, 1))));
  });
});
