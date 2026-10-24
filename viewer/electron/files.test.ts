import { describe, expect, it } from 'vitest';
import { isShotFile, shotArgument, shotFileNames } from './files.mts';

const folder = [
  'test_shot.glb',
  'test_shot.manifest.json',
  'test_shot.rvedits.json',
  'other.glb',
  'notes.txt',
];

describe('shotFileNames', () => {
  it('brings the manifest along with the .glb', () => {
    expect(shotFileNames('test_shot.glb', folder)).toEqual([
      'test_shot.glb',
      'test_shot.manifest.json',
    ]);
  });

  it('brings the .glb along with the manifest', () => {
    expect(shotFileNames('test_shot.manifest.json', folder)).toEqual([
      'test_shot.glb',
      'test_shot.manifest.json',
    ]);
  });

  it('ignores case, as Windows does', () => {
    expect(shotFileNames('TEST_SHOT.GLB', folder)).toEqual([
      'test_shot.glb',
      'test_shot.manifest.json',
    ]);
  });

  it('opens just the .glb when it has no manifest', () => {
    expect(shotFileNames('other.glb', folder)).toEqual(['other.glb']);
  });
});

describe('isShotFile', () => {
  it('takes .glb and .json files only', () => {
    expect(folder.filter(isShotFile)).toEqual(folder.slice(0, 4));
  });
});

describe('shotArgument', () => {
  it('finds the path among Chromium switches', () => {
    expect(shotArgument(['--inspect', 'C:\\shots\\test_shot.glb'])).toBe(
      'C:\\shots\\test_shot.glb',
    );
  });

  it('is undefined when the app is opened without a shot', () => {
    expect(shotArgument([])).toBeUndefined();
  });
});
