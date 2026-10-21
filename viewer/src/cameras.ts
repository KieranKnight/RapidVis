import { MathUtils } from 'three';
import type { CameraInfo } from './manifest';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The largest rectangle with the given aspect that fits centred inside the container */
export function fitAspect(containerWidth: number, containerHeight: number, aspect: number): Rect {
  const containerAspect = containerWidth / containerHeight;

  if (containerAspect > aspect) {
    // Container is wider than the shot: bars on the left and right
    const width = Math.round(containerHeight * aspect);
    return { x: Math.round((containerWidth - width) / 2), y: 0, width, height: containerHeight };
  }

  // Container is taller than the shot: bars on the top and bottom
  const height = Math.round(containerWidth / aspect);
  return { x: 0, y: Math.round((containerHeight - height) / 2), width: containerWidth, height };
}

/**
 * A camera's vertical field of view in degrees, from its focal length, worked out the way Blender
 * does. The sensor width spans the frame's width (HORIZONTAL fit, or AUTO on a landscape frame)
 * or its height (AUTO on a portrait frame). Blender's VERTICAL fit uses the sensor height, which
 * the manifest doesn't carry yet, so that case uses the width for now.
 */
export function verticalFov(focal: number, camera: CameraInfo, aspect: number): number {
  const fitsWidth =
    camera.sensorFit === 'HORIZONTAL' || (camera.sensorFit === 'AUTO' && aspect >= 1);
  const sensorHeight = fitsWidth ? camera.sensorWidth / aspect : camera.sensorWidth;
  return MathUtils.radToDeg(2 * Math.atan(sensorHeight / 2 / focal));
}
