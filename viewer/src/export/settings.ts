export interface MovieSize {
  width: number;
  height: number;
}

/** Video is encoded in blocks, so H.264 needs an even width and height */
export function evenPixels(pixels: number): number {
  return Math.max(2, Math.round(pixels / 2) * 2);
}

/** `height` lines tall and as wide as the camera's shape needs */
export function movieSize(height: number, aspect: number): MovieSize {
  return { width: evenPixels(height * aspect), height: evenPixels(height) };
}

/** A filename that's safe eveywhere */
export function movieFileName(shot: string, camera: string, start: number, end: number): string {
  const safe = (text: string) => text.replace(/[^\w.-]+/g, '_');
  return `${safe(shot)}_${safe(camera)}_f${start}-${end}.mp4`;
}
