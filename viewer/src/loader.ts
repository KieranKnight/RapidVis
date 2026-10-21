import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseManifest, type Manifest } from './manifest';
import { pickShotFiles } from './shotFiles';

export interface LoadedShot {
  name: string;
  gltf: GLTF;
  manifest: Manifest;
  warnings: string[];
}

export async function loadShot(files: File[]): Promise<LoadedShot> {
  const picked = pickShotFiles(files);
  if ('error' in picked) throw new Error(picked.error);
  const { glb: glbFile, manifest: manifestFile } = picked.ok;

  const gltf = await new GLTFLoader().parseAsync(await glbFile.arrayBuffer(), '');
  const rawManifest = manifestFile ? await readJson(manifestFile) : null;
  const { manifest, warnings } = parseManifest(rawManifest, gltf.animations);

  return { name: glbFile.name.replace(/\.glb$/i, ''), gltf, manifest, warnings };
}

async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null; // bad JSON counts as "no valid manifest"
  }
}
