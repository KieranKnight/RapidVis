import type { AnimationClip } from 'three';

export type SensorFit = 'AUTO' | 'HORIZONTAL' | 'VERTICAL';

export interface CameraInfo {
  sensorWidth: number; // millimetres
  sensorFit: SensorFit;
}

export interface Manifest {
  version: number;
  source: { dcc: string; version: string; file: string };
  fps: number;
  frameStart: number;
  frameEnd: number;
  nodes: Record<string, string>; // glTF node name -> DCC object name
  cameras: Record<string, CameraInfo>;
}

export interface FrameRange {
  frameStart: number;
  frameEnd: number;
}

export interface ManifestResult {
  manifest: Manifest;
  warnings: string[];
}

const DEFAULT_FPS = 24;
/** Blender's default camera sensor, used when the manifest doesn't say. */
export const DEFAULT_CAMERA: CameraInfo = { sensorWidth: 36, sensorFit: 'AUTO' };
const SENSOR_FITS: SensorFit[] = ['AUTO', 'HORIZONTAL', 'VERTICAL'];

export function frameRangeFromClips(clips: AnimationClip[], fps: number): FrameRange {
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (track.times.length === 0) continue;
      minTime = Math.min(minTime, track.times[0]);
      maxTime = Math.max(maxTime, track.times[track.times.length - 1]);
    }
  }

  if (minTime === Infinity) return { frameStart: 1, frameEnd: 1 };
  return {
    frameStart: Math.round(minTime * fps),
    frameEnd: Math.round(maxTime * fps),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parseCameras(raw: unknown): Record<string, CameraInfo> {
  const cameras: Record<string, CameraInfo> = {};
  if (!isRecord(raw)) return cameras;

  for (const [name, info] of Object.entries(raw)) {
    if (!isRecord(info)) continue;
    cameras[name] = {
      sensorWidth: isPositiveNumber(info.sensorWidth)
        ? info.sensorWidth
        : DEFAULT_CAMERA.sensorWidth,
      sensorFit: SENSOR_FITS.includes(info.sensorFit as SensorFit)
        ? (info.sensorFit as SensorFit)
        : DEFAULT_CAMERA.sensorFit,
    };
  }
  return cameras;
}

export function parseManifest(raw: unknown, clips: AnimationClip[]): ManifestResult {
  const hasManifest = isRecord(raw);
  const data: Record<string, unknown> = hasManifest ? raw : {};
  const warnings: string[] = hasManifest ? [] : ['No valid manifest found, using defaults'];
  const warn = (message: string) => {
    if (hasManifest) warnings.push(message);
  };

  if (hasManifest && data.version !== 1) warn(`Unknown manifest version: ${String(data.version)}`);

  let fps = DEFAULT_FPS;
  if (isPositiveNumber(data.fps)) fps = data.fps;
  else warn(`Invalid fps, using ${DEFAULT_FPS}`);

  const fromClips = frameRangeFromClips(clips, fps);
  let range: FrameRange = fromClips;
  if (isInteger(data.frameStart) && isInteger(data.frameEnd)) {
    if (data.frameEnd >= data.frameStart) {
      range = { frameStart: data.frameStart, frameEnd: data.frameEnd };
    } else {
      warn(`frameEnd is before frameStart, using the animation range`);
    }
  } else {
    warn(`Missing frame range, using the animation range`);
  }

  const source = isRecord(data.source) ? data.source : {};
  const nodes: Record<string, string> = {};
  if (isRecord(data.nodes)) {
    for (const [gltfName, dccName] of Object.entries(data.nodes)) {
      if (isString(dccName)) nodes[gltfName] = dccName;
    }
  }

  return {
    manifest: {
      version: 1,
      source: {
        dcc: isString(source.dcc) ? source.dcc : 'unknown',
        version: isString(source.version) ? source.version : '',
        file: isString(source.file) ? source.file : '',
      },
      fps,
      ...range,
      nodes,
      cameras: parseCameras(data.cameras),
    },
    warnings,
  };
}
