import { describe, expect, it } from 'vitest';
import { burnInText, padFrame, type BurnInInfo } from './burnin';

const info: BurnInInfo = {
  shot: 'sh010',
  camera: 'shotCam',
  focal: 35,
  frame: 12,
  frameEnd: 120,
  commands: [],
};

describe('padFrame', () => {
  it('pads to 4 digits', () => {
    expect(padFrame(12, 120)).toBe('0012');
  });

  it('pads to the width of the last frame when that is longer', () => {
    expect(padFrame(1001, 12000)).toBe('01001');
  });
});

describe('burnInText', () => {
  it('puts the shot, camera and lens, and frame in the corners', () => {
    const text = burnInText(info);
    expect(text.topLeft).toBe('sh010');
    expect(text.topRight).toBe('shotCam · 35mm');
    expect(text.bottomRight).toBe('frame 0012 / 0120');
  });

  it('rounds the lens to a tenth of a mm, and leaves it out when there is none', () => {
    expect(burnInText({ ...info, focal: 50.04 }).topRight).toBe('shotCam · 50mm');
    expect(burnInText({ ...info, focal: 27.55 }).topRight).toBe('shotCam · 27.6mm');
    expect(burnInText({ ...info, camera: 'Free camera', focal: null }).topRight).toBe(
      'Free camera',
    );
  });

  it('says when there are no edits', () => {
    expect(burnInText(info).bottomLeft).toEqual(['No edits']);
  });

  it('lists the latest commands, and counts the older ones', () => {
    const commands = [
      'trim 1 100',
      'hide ground',
      'retime cube 2',
      'offset cube 4',
      'focal shotCam 50',
    ];
    expect(burnInText({ ...info, commands }).bottomLeft).toEqual([
      '+1 earlier',
      'hide ground',
      'retime cube 2',
      'offset cube 4',
      'focal shotCam 50',
    ]);
  });
});
