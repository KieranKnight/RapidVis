/** Is this one of the files a shot is made of (the .glb, or its manifest)? */
export const isShotFile = (name: string) => /\.(glb|json)$/i.test(name);

/**
 * Which files to open from a shot's folder, given the one that was picked: the .glb or its
 * manifest bring the other one with them, so the user only ever has to pick one.
 */
export function shotFileNames(picked: string, folder: string[]): string[] {
  const shot = picked.replace(/(\.manifest)?\.(glb|json)$/i, '').toLowerCase();
  const wanted = [`${shot}.glb`, `${shot}.manifest.json`, `${shot}.json`];
  return folder.filter((name) => wanted.includes(name.toLowerCase()));
}

/** The shot path in the app's arguments, skipping switches like --inspect. */
export function shotArgument(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-'));
}
