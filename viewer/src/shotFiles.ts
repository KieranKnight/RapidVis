/** Anything with a filename: a browser file, or a plain object in tests */
export interface Named {
  readonly name: string;
}

export type ShotFiles<T extends Named> = { ok: { glb: T; manifest: T | null } } | { error: string };

const GLB = /\.glb$/i;

/**
 * Picks the shot (.glb) and it's manifest out of a pile of files, e.g a dropped folder.
 * The manifest is the first of: <shot>.manifest.json, shot.json, manifest.json
 * or the only .json there is. Names are compared ignoring case
 */
export function pickShotFiles<T extends Named>(files: readonly T[]): ShotFiles<T> {
  const glbs = files.filter((file) => GLB.test(file.name));
  if (glbs.length === 0) return { error: 'Please choose a .glb file' };
  if (glbs.length > 1) {
    const names = glbs.map((file) => file.name).join(', ');
    return { error: `Found ${glbs.length} shots (${names}). Open one at a time` };
  }
  const glb = glbs[0];

  const shot = glb.name.replace(GLB, '').toLowerCase();
  const jsons = files.filter((file) => {
    const name = file.name.toLowerCase();
    return name.endsWith('.json') && !name.endsWith('.rvedits.json'); // saved edits, not a manifest
  });
  const named = (name: string) => jsons.find((file) => file.name.toLowerCase() === name);
  const manifest =
    named(`${shot}.manifest.json`) ??
    named(`${shot}.json`) ??
    named('manifest.json') ??
    (jsons.length === 1 ? jsons[0] : null);

  return { ok: { glb, manifest } };
}
