import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
} from 'mediabunny';
import { CODECS, type MovieCodec } from './settings';

export interface RecordOptions {
  canvas: HTMLCanvasElement; // each frame is drawn here, at the movie's size
  codec: MovieCodec;
  fps: number;
  frameStart: number;
  frameEnd: number;
  drawFrame: (frame: number) => void; // Shows that frame and draws it onto the canvas
  onProgress: (done: number, total: number) => void;
  signal: AbortSignal; // abort it to cancel
}

/**
 * Draws every frame of the range, one at a time, and encodes them into an MP4.
 * Not in real time: each frame waits for the last, so none are ever dropped.
 * Returns null if it was cancelled.
 */
export async function recordMovie(options: RecordOptions): Promise<Blob | null> {
  const { canvas, codec, fps, frameStart, frameEnd, drawFrame, onProgress, signal } = options;
  const { width, height } = canvas;
  if (!(await canEncodeVideo('avc', { width, height, quality: QUALITY_HIGH }))) {
    throw new Error(`This browser can't encode H.264 video at ${width}×${height}`);
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }), // plays before it's fully loaded
    target: new BufferTarget(),
  });

  if (!(await canEncodeVideo(codec, { width, height, quality: QUALITY_HIGH }))) {
    throw new Error(`This browser can't encode ${CODECS[codec].name} video at ${width}×${height}`);
  }

  const video = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  await output.start();

  const total = frameEnd - frameStart + 1;
  try {
    for (let i = 0; i < total && !signal.aborted; i++) {
      drawFrame(frameStart + i);
      await video.add(i / fps, 1 / fps); // waits while the encoder catches up
      onProgress(i + 1, total);
    }
    if (signal.aborted) {
      await output.cancel();
      return null;
    }
    await output.finalize();
  } catch (error) {
    await output.cancel(); // let go of the encoder
    throw error;
  }

  const { buffer } = output.target;
  if (!buffer) throw new Error('The movie was finished but came out empty');
  return new Blob([buffer], { type: 'video/mp4' });
}
