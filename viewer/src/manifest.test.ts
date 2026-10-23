import { AnimationClip, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { frameRangeFromClips, parseManifest } from './manifest';

// A clip keyed like the fixture cube: frames 1, 24, 48 at 24 fps
const fps = 24;
const clip = new AnimationClip('Animation', -1, [
  new VectorKeyframeTrack(
    'cube.position',
    [1 / fps, 24 / fps, 48 / fps],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
  ),
]);

const validManifest = {
  version: 1,
  source: { dcc: 'blender', version: '5.1', file: 'test_shot.blend' },
  fps: 24,
  frameStart: 1,
  frameEnd: 48,
  nodes: { cube: 'cube' },
  cameras: { shotCam: { sensorWidth: 36, sensorFit: 'AUTO' } },
};

describe('frameRangeFromClips', () => {
  it('converts key times to whole frames', () => {
    expect(frameRangeFromClips([clip], fps)).toEqual({ frameStart: 1, frameEnd: 48 });
  });

  it('falls back to 1-1 when there is no animation', () => {
    expect(frameRangeFromClips([], fps)).toEqual({ frameStart: 1, frameEnd: 1 });
  });
});

describe('parseManifest', () => {
  it('accepts a valid manifest with no warnings', () => {
    const { manifest, warnings } = parseManifest(validManifest, [clip]);
    expect(warnings).toEqual([]);
    expect(manifest.fps).toBe(24);
    expect(manifest.frameEnd).toBe(48);
    expect(manifest.cameras.shotCam.sensorWidth).toBe(36);
  });

  it('uses defaults and one warning when there is no manifest', () => {
    const { manifest, warnings } = parseManifest(null, [clip]);
    expect(warnings).toHaveLength(1);
    expect(manifest.fps).toBe(24);
    expect(manifest.frameStart).toBe(1);
    expect(manifest.frameEnd).toBe(48);
  });

  it('warns and falls back on an invalid fps', () => {
    const { manifest, warnings } = parseManifest({ ...validManifest, fps: -5 }, [clip]);
    expect(manifest.fps).toBe(24);
    expect(warnings).toContain('Invalid fps, using 24');
  });

  it('uses the animation range when frameEnd is before frameStart', () => {
    const { manifest, warnings } = parseManifest(
      { ...validManifest, frameStart: 50, frameEnd: 10 },
      [clip],
    );
    expect(manifest.frameStart).toBe(1);
    expect(manifest.frameEnd).toBe(48);
    expect(warnings).toHaveLength(1);
  });

  it('drops node mappings that are not strings', () => {
    const { manifest } = parseManifest({ ...validManifest, nodes: { cube: 'cube', bad: 42 } }, [
      clip,
    ]);
    expect(manifest.nodes).toEqual({ cube: 'cube' });
  });

  it("reads a camera's sensor height when there is one, and leaves it out when not", () => {
    const cameras = { tall: { sensorWidth: 36, sensorHeight: 24, sensorFit: 'VERTICAL' } };
    expect(parseManifest({ ...validManifest, cameras }, [clip]).manifest.cameras.tall).toEqual(
      cameras.tall,
    );
    const broken = { tall: { ...cameras.tall, sensorHeight: 'big' } };
    expect(
      parseManifest({ ...validManifest, cameras: broken }, [clip]).manifest.cameras.tall,
    ).toEqual({ sensorWidth: 36, sensorFit: 'VERTICAL' });
  });
});
