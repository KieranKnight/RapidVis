import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { fitAspect, verticalFov } from './cameras';
import type { CameraInfo } from './manifest';

describe('fitAspect', () => {
  it('fills the container when the aspects match', () => {
    expect(fitAspect(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('adds bars left and right when the container is wider', () => {
    expect(fitAspect(2000, 1000, 16 / 9)).toEqual({ x: 111, y: 0, width: 1778, height: 1000 });
  });

  it('adds bars top and bottom when the container is taller', () => {
    expect(fitAspect(1600, 1200, 16 / 9)).toEqual({ x: 0, y: 150, width: 1600, height: 900 });
  });
});

describe('verticalFov', () => {
  const blender: CameraInfo = { sensorWidth: 36, sensorFit: 'AUTO' };

  it("matches Blender's export: 35mm on a 16:9 frame is 0.5632 radians", () => {
    expect(MathUtils.degToRad(verticalFov(35, blender, 16 / 9))).toBeCloseTo(0.5632, 4);
  });

  it('gets narrower as the lens gets longer', () => {
    expect(verticalFov(50, blender, 16 / 9)).toBeLessThan(verticalFov(35, blender, 16 / 9));
  });

  it('on a portrait frame, AUTO fits the sensor to the height and HORIZONTAL to the width', () => {
    const portrait = 9 / 16;
    const fov = (sensorHeight: number) => MathUtils.radToDeg(2 * Math.atan(sensorHeight / 70));
    expect(verticalFov(35, blender, portrait)).toBeCloseTo(fov(36), 6);
    expect(verticalFov(35, { ...blender, sensorFit: 'HORIZONTAL' }, portrait)).toBeCloseTo(
      fov(64),
      6,
    );
  });
});
