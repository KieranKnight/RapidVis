import { describe, expect, it } from 'vitest';
import { pickShotFiles } from './shotFiles';

/** Fake files: pickShotFiles only ever looks at the names. */
const files = (...names: string[]) => names.map((name) => ({ name }));

/** The names it picked, or the error, so each test reads in one line. */
function pick(...names: string[]) {
  const result = pickShotFiles(files(...names));
  if ('error' in result) return result.error;
  return { glb: result.ok.glb.name, manifest: result.ok.manifest?.name ?? null };
}

describe('pickShotFiles', () => {
  it('pairs <shot>.glb with <shot>.manifest.json', () => {
    expect(pick('notes.json', 'sh010.manifest.json', 'sh010.glb')).toEqual({
      glb: 'sh010.glb',
      manifest: 'sh010.manifest.json',
    });
  });

  it('falls back to <shot>.json, then manifest.json', () => {
    expect(pick('sh010.glb', 'other.json', 'sh010.json')).toMatchObject({
      manifest: 'sh010.json',
    });
    expect(pick('sh010.glb', 'other.json', 'manifest.json')).toMatchObject({
      manifest: 'manifest.json',
    });
  });

  it('uses the only .json there is, whatever it is called', () => {
    expect(pick('sh010.glb', 'test_shot,manifest.json')).toMatchObject({
      manifest: 'test_shot,manifest.json',
    });
  });

  it('never takes a saved edits file for the manifest', () => {
    expect(pickShotFiles(files('sh010.glb', 'sh010.rvedits.json'))).toEqual({
      ok: { glb: { name: 'sh010.glb' }, manifest: null },
    });
  });

  it('ignores case', () => {
    expect(pick('SH010.GLB', 'x.json', 'sh010.Manifest.JSON')).toMatchObject({
      manifest: 'sh010.Manifest.JSON',
    });
  });

  it('has no manifest when it cannot tell which .json is the one', () => {
    expect(pick('sh010.glb', 'a.json', 'b.json')).toMatchObject({ manifest: null });
    expect(pick('sh010.glb', 'readme.txt')).toMatchObject({ manifest: null });
  });

  it('needs exactly one .glb', () => {
    expect(pick('sh010.json')).toBe('Please choose a .glb file');
    expect(pick('a.glb', 'b.glb')).toBe('Found 2 shots (a.glb, b.glb). Open one at a time');
  });
});
