import { describe, expect, it } from 'vitest';
import { curveTracks, parseCurves, type ShotCurves } from './curves';

describe('parseCurves', () => {
  it('reads a curve for each property, one value per frame', () => {
    const raw = {
      shotCam: { lens: [35, 42, 50] },
      key_light: {
        intensity: [80, 40, 0],
        color: [
          [1, 1, 1],
          [1, 0.5, 0.25],
          [0, 0, 0],
        ],
      },
    };
    expect(parseCurves(raw, 3)).toEqual({ curves: raw, warnings: [] });
  });

  it('has nothing to say about a manifest from before curves', () => {
    expect(parseCurves(undefined, 48)).toEqual({ curves: {}, warnings: [] });
  });

  it('drops a broken or wrong-length curve with a warning, and keeps the rest', () => {
    const raw = {
      shotCam: { lens: [35, 50] }, // 2 values for 3 frames
      key_light: {
        intensity: [80, -1, 80],
        color: [
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ],
      },
    };
    const { curves, warnings } = parseCurves(raw, 3);
    expect(curves).toEqual({ shotCam: {}, key_light: { color: raw.key_light.color } });
    expect(warnings).toEqual([
      'Invalid lens curve for "shotCam", using its value in the .glb',
      'Invalid intensity curve for "key_light", using its value in the .glb',
    ]);
  });
});

describe('curveTracks', () => {
  it('makes a track per curve, timed from the first frame', () => {
    const curves: ShotCurves = {
      shotCam: { lens: [35, 50] },
      'key light': {
        color: [
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
    };
    const [fov, color] = curveTracks(curves, 1, 24, (_node, mm) => mm * 2);

    expect(fov.name).toBe('shotCam.fov');
    expect(fov.times).toEqual(new Float32Array([1 / 24, 2 / 24])); // three.js keeps times as 32-bit floats
    expect(Array.from(fov.values)).toEqual([70, 100]); // the lens, turned into a field of view
    expect(color.name).toBe('key_light.color'); // named the way three.js tidies node names
    expect(Array.from(color.values)).toEqual([1, 0, 0, 0, 1, 0]);
  });
});
