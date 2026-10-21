/** The frame under a position along the ruler: a whole frame, kept inside the range */
export function frameAt(x: number, width: number, start: number, end: number): number {
  if (width <= 0) return start;
  const frame = start + (x / width) * (end - start);
  return Math.min(end, Math.max(start, Math.round(frame)));
}

/** Where a frame sits along the ruler, from 0 (the start) to 1 (the end) */
export function fractionAt(frame: number, start: number, end: number): number {
  return end === start ? 0 : (frame - start) / (end - start);
}

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** The smallest 'nice' game between labels that keeps them at least 'minGap' pixels apart */
export function tickStep(start: number, end: number, width: number, minGap = 48): number {
  const pixelsPerFrame = width / Math.max(end - start, 1);
  return (
    NICE_STEPS.find((step) => step * pixelsPerFrame >= minGap) ?? NICE_STEPS[NICE_STEPS.length - 1]
  );
}

/** The labelled frames: every multiple of `step` inside of the range */
export function ticks(start: number, end: number, step: number): number[] {
  const result: number[] = [];
  for (let frame = Math.ceil(start / step) * step; frame <= end; frame += step) result.push(frame);
  return result;
}

/**
 * The first key after `frame` (direction 1) or before it (-1), or null if there isn't one
 * Keys can sit between frames after a retime, so they're rounded to whole frames first
 */
export function nextKey(keys: readonly number[], frame: number, direction: 1 | -1): number | null {
  const whole = [...new Set(keys.map((key) => Math.round(key)))].sort((a, b) => a - b);
  const found =
    direction === 1 ? whole.find((key) => key > frame) : whole.findLast((key) => key < frame);
  return found ?? null;
}
