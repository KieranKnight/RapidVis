import {
  ColorKeyframeTrack,
  NumberKeyframeTrack,
  PropertyBinding,
  type KeyframeTrack,
} from 'three';
import { frameToSeconds } from './timeline';

type Rgb = [number, number, number];

/**
 * Animation the .glb can't carry (see docs/exporter-spike.md), sampled by the Blender add-on:
 * one value per frame, from the manifest's frameStart to its frameEnd.
 */
export interface PropertyCurves {
  lens?: number[]; // mm
  intensity?: number[]; // glTF uints, like the lights loaded intensity
  color?: Rgb[]; // linear RGB, like three.js colours
}

export type ShotCurves = Record<string, PropertyCurves>; // by object name

/** The track properties these curves become.
 * They have a simple on every frame, not keys
 */
export const SAMPLED_PROPERTIES = new Set(['fov', 'intensity', 'color']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `length` finite numbers that all pass `valid` */
function isNumbers(
  value: unknown,
  length: number,
  valid: (n: number) => boolean,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && valid(n))
  );
}

function isColors(value: unknown, length: number): value is Rgb[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((c) => isNumbers(c, 3, (n) => n >= 0))
  );
}

/**
 * Checks each curve on its own: one that's broken (or the wrong length) is dropped with a warning,
 * and that property keeps its value from the .glb. Manifests from before curves existed have none.
 */
export function parseCurves(
  raw: unknown,
  frameCount: number,
): { curves: ShotCurves; warnings: string[] } {
  const curves: ShotCurves = {};
  const warnings: string[] = [];
  if (raw === undefined) return { curves, warnings };
  if (!isRecord(raw)) return { curves, warnings: ['Invalid curves, using the values in the .glb'] };

  for (const [name, properties] of Object.entries(raw)) {
    if (!isRecord(properties)) continue;
    const parsed: PropertyCurves = {};
    const invalid = (property: string) =>
      warnings.push(`Invalid ${property} curve for "${name}", using its value in the .glb`);

    if ('lens' in properties) {
      if (isNumbers(properties.lens, frameCount, (mm) => mm > 0)) parsed.lens = properties.lens;
      else invalid('lens');
    }
    if ('intensity' in properties) {
      if (isNumbers(properties.intensity, frameCount, (n) => n >= 0)) {
        parsed.intensity = properties.intensity;
      } else invalid('intensity');
    }
    if ('color' in properties) {
      if (isColors(properties.color, frameCount)) parsed.color = properties.color;
      else invalid('color');
    }
    curves[name] = parsed;
  }
  return { curves, warnings };
}

/**
 * The curves as three.js tracks, so the mixer plays them like any other animation, and retime,
 * offset and trim move them along with everything else. A lens becomes the camera's vertical
 * field of view, which `fovFor` works out (it needs that camera's sensor and shape).
 */
export function curveTracks(
  curves: ShotCurves,
  frameStart: number,
  fps: number,
  fovFor: (node: string, lens: number) => number,
): KeyframeTrack[] {
  const tracks: KeyframeTrack[] = [];
  const times = (values: readonly unknown[]) =>
    values.map((_, i) => frameToSeconds(frameStart + i, fps));

  for (const [name, { lens, intensity, color }] of Object.entries(curves)) {
    const node = PropertyBinding.sanitizeNodeName(name); // three.js tidied the node names the same way
    if (lens) {
      const fovs = lens.map((mm) => fovFor(node, mm));
      tracks.push(new NumberKeyframeTrack(`${node}.fov`, times(lens), fovs));
    }
    if (intensity) {
      tracks.push(new NumberKeyframeTrack(`${node}.intensity`, times(intensity), intensity));
    }
    if (color) tracks.push(new ColorKeyframeTrack(`${node}.color`, times(color), color.flat()));
  }
  return tracks;
}
