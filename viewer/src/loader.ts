import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseManifest, type Manifest } from './manifest';

export interface LoadedShot {
  name: string;
  gltf: GLTF;
  manifest: Manifest;
  warnings: string[];
}

export async function loadShot(files: File[]): Promise<LoadedShot> {
  const glbFile = files.find((file) => file.name.toLowerCase().endsWith('.glb'));
  if (!glbFile) throw new Error('Please choose a .glb file');
  const manifestFile = files.find((file) => file.name.toLowerCase().endsWith('json'));

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
