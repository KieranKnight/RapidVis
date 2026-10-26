import type { PerspectiveCamera } from 'three';
import type { BurnIn } from '../burnin';
import type { Timeline } from '../timeline';
import { drawBurnIn } from '../ui/burnInLayer';
import type { RunExport } from '../ui/exportDialog';
import type { Viewport } from '../viewport';
import { recordMovie } from './movie';
import { movieFileName, movieSize } from './settings';

/** What a movie is made from. */
export interface MovieSource {
  viewport: Viewport;
  timeline: Timeline;
  shotName(): string;
  burnIn(camera: PerspectiveCamera, frame: number): BurnIn;
}

/** Records the frame range through a camera, edits and all, by stepping the timeline frame by frame. */
export function createMovieExport({
  viewport,
  timeline,
  shotName,
  burnIn,
}: MovieSource): RunExport {
  return async ({ camera, height, burnIn: withBurnIn, codec }, onProgress, signal) => {
    const size = movieSize(height, camera.aspect);
    const frameCanvas = document.createElement('canvas'); // the clean render, plus any burn-in
    frameCanvas.width = size.width;
    frameCanvas.height = size.height;
    const context = frameCanvas.getContext('2d');
    if (!context) throw new Error("This browser can't draw on a 2D canvas");
    const clean = viewport.createCleanRenderer(size.width, size.height);
    const { fps, frameStart, frameEnd } = timeline;
    const returnTo = timeline.frame;
    timeline.pause();

    try {
      const movie = await recordMovie({
        canvas: frameCanvas,
        codec,
        fps,
        frameStart,
        frameEnd,
        drawFrame: (frame) => {
          timeline.setFrame(frame); // poses the whole shot for that frame
          clean.draw(camera);
          context.drawImage(clean.canvas, 0, 0);
          if (withBurnIn) drawBurnIn(context, burnIn(camera, frame), { x: 0, y: 0, ...size });
        },
        onProgress,
        signal,
      });
      if (!movie) return null;
      return {
        movie,
        fileName: movieFileName(shotName(), camera.name || 'camera', frameStart, frameEnd),
      };
    } finally {
      clean.dispose();
      timeline.setFrame(returnTo);
    }
  };
}
