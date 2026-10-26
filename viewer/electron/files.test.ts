import { describe, expect, it } from 'vitest';
import {
  addRecent,
  isShotFile,
  MAX_RECENT,
  readRecent,
  shotArgument,
  shotFileNames,
  shotName,
} from './files.mts';

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

describe('shotName', () => {
  it('names a shot after its .glb or manifest, or its folder', () => {
    expect(shotName('C:\\shots\\sh010.glb')).toBe('sh010');
    expect(shotName('C:\\shots\\sh010.manifest.json')).toBe('sh010');
    expect(shotName('C:\\shots\\sh020\\')).toBe('sh020');
  });
});

describe('addRecent', () => {
  it('puts the newest shot first, without repeating one opened again', () => {
    const list = addRecent(addRecent([], 'C:\\a.glb'), 'C:\\b.glb');
    expect(addRecent(list, 'c:\\A.GLB').map((shot) => shot.name)).toEqual(['A', 'b']);
  });

  it(`keeps only the last ${MAX_RECENT}`, () => {
    let list = addRecent([], 'C:\\0.glb');
    for (let i = 1; i < 12; i++) list = addRecent(list, `C:\\${i}.glb`);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].name).toBe('11');
  });
});

describe('readRecent', () => {
  it('reads a saved list, and drops anything that does not look like a shot', () => {
    const json = JSON.stringify([{ path: 'C:\\a.glb', name: 'a' }, { path: 3 }, 'nonsense']);
    expect(readRecent(json)).toEqual([{ path: 'C:\\a.glb', name: 'a' }]);
  });

  it('starts empty from a missing or broken file', () => {
    expect(readRecent('')).toEqual([]);
    expect(readRecent('{"not": "a list"}')).toEqual([]);
  });
});
