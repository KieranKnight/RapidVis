/** A shot file's extension: .glb, or .json / .manifest.json for its manifest. */
const SHOT_EXTENSION = /(\.manifest)?\.(glb|json)$/i;

/** Is this one of the files a shot is made of (the .glb, or its manifest)? */
export const isShotFile = (name: string) => SHOT_EXTENSION.test(name);

/**
 * Which files to open from a shot's folder, given the one that was picked: the .glb or its
 * manifest bring the other one with them, so the user only ever has to pick one.
 */
export function shotFileNames(picked: string, folder: string[]): string[] {
  const shot = picked.replace(SHOT_EXTENSION, '').toLowerCase();
  const wanted = [`${shot}.glb`, `${shot}.manifest.json`, `${shot}.json`];
  return folder.filter((name) => wanted.includes(name.toLowerCase()));
}

/** The shot path in the app's arguments, skipping switches like --inspect. */
export function shotArgument(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-'));
}

/** A shot opened before, for Open recent: where it is, and the name to show. */
export interface RecentShot {
  path: string;
  name: string;
}

export const MAX_RECENT = 8;

/** A shot's name from its path: the .glb (or manifest) without its extension, or the folder's name. */
export function shotName(target: string): string {
  const last = target.split(/[\\/]/).filter(Boolean).at(-1) ?? target;
  return last.replace(SHOT_EXTENSION, '');
}

/** The recent list with this shot at the top. Opening one again moves it up instead of repeating it. */
export function addRecent(list: readonly RecentShot[], target: string): RecentShot[] {
  const same = (shot: RecentShot) => shot.path.toLowerCase() === target.toLowerCase(); // Windows ignores case
  return [{ path: target, name: shotName(target) }, ...list.filter((shot) => !same(shot))].slice(
    0,
    MAX_RECENT,
  );
}

/** The recent list from its saved JSON, keeping only entries that look right (the file may be old or edited). */
export function readRecent(json: string): RecentShot[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (entry): entry is RecentShot =>
        typeof entry?.path === 'string' && typeof entry?.name === 'string',
    )
    .slice(0, MAX_RECENT);
}
