import { describe, expect, it } from 'vitest';
import { evenPixels, movieFileName, movieSize } from './settings';

describe('evenPixels', () => {
  it('rounds to the nearest even number', () => {
    expect(evenPixels(1080)).toBe(1080);
    expect(evenPixels(1919.9)).toBe(1920);
    expect(evenPixels(1081)).toBe(1082);
  });

  it('never gives a size of nothing', () => {
    expect(evenPixels(0)).toBe(2);
  });
});

describe('movieSize', () => {
  it("matches the camera's shape", () => {
    expect(movieSize(1080, 16 / 9)).toEqual({ width: 1920, height: 1080 });
    expect(movieSize(1080, 2.39)).toEqual({ width: 2582, height: 1080 });
  });
});

describe('movieFileName', () => {
  it('names the shot, camera and frames', () => {
    expect(movieFileName('sh010', 'shotCam', 1, 48)).toBe('sh010_shotCam_f1-48.mp4');
  });

  it('replaces characters that are unsafe in file names', () => {
    expect(movieFileName('sh 010', 'cam/main:A', 1001, 1100)).toBe(
      'sh_010_cam_main_A_f1001-1100.mp4',
    );
  });
});
