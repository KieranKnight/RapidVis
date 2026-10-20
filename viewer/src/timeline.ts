import type { FrameRange } from './manifest';

const EPSILON = 1e-6;

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export function secondsToFrame(seconds: number, fps: number): number {
  return seconds * fps;
}

type Listener = () => void;

export class Timeline {
  fps = 24;
  frameStart = 1;
  frameEnd = 1;
  frame = 1;
  playing = false;
  private pendingFrames = 0;
  private listeners: Listener[] = [];

  onChange(listener: Listener) {
    this.listeners.push(listener);
  }

  configure(fps: number, range: FrameRange) {
    this.fps = fps;
    this.frameStart = range.frameStart;
    this.frameEnd = range.frameEnd;
    this.playing = false;
    this.setFrame(range.frameStart);
  }

  /** Changes the frame range (e.g. after `trim`), keeping the current frame if it's still inside. */
  setRange(range: FrameRange) {
    this.frameStart = range.frameStart;
    this.frameEnd = range.frameEnd;
    this.setFrame(this.frame); // clamps into the new range, and notifies
  }

  setFrame(frame: number) {
    this.frame = Math.min(Math.max(Math.round(frame), this.frameStart), this.frameEnd);
    this.pendingFrames = 0;
    this.notify();
  }

  step(frames: number) {
    this.playing = false;
    this.setFrame(this.frame + frames);
  }

  play() {
    this.playing = true;
    this.pendingFrames = 0;
    this.notify();
  }

  pause() {
    this.playing = false;
    this.notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  tick(deltaSeconds: number) {
    if (!this.playing) return;

    this.pendingFrames += deltaSeconds * this.fps;
    const wholeFrames = Math.floor(this.pendingFrames + EPSILON);
    if (wholeFrames === 0) return;

    this.pendingFrames -= wholeFrames;
    this.advance(wholeFrames);
  }

  private advance(frames: number) {
    const length = this.frameEnd - this.frameStart + 1;
    const offset = (this.frame - this.frameStart + frames) % length;
    this.frame = this.frameStart + offset;
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
