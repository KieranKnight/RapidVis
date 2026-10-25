import { fractionAt, frameAt, rulerLabels } from '../ruler';
import { frameToSeconds, type Timeline } from '../timeline';

// 16px play and pause glyphs, filled with the button's text colour
const PLAY =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z"/></svg>';
const PAUSE =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';

export interface TimelineBar {
  /** Every key to mark, and the ones to pick out (the selected object's). */
  setKeys(frames: readonly number[], picked: readonly number[]): void;
}

export function createTimelineBar(root: HTMLElement, timeline: Timeline): TimelineBar {
  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'play-button';

  // The ruler: frame labels above a rounded track. Scrub by pressing anywhere on it
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  ruler.setAttribute('role', 'slider');
  ruler.setAttribute('aria-label', 'Current frame');
  const labelLayer = document.createElement('div');
  labelLayer.className = 'ruler-labels';
  const bar = document.createElement('div');
  bar.className = 'ruler-bar';
  // The track sits inset from the bar's rounded ends, so keys on the first and last frame aren't cut off
  const track = document.createElement('div');
  track.className = 'ruler-track';
  const played = document.createElement('div');
  played.className = 'ruler-played';
  const keyLayer = document.createElement('div');
  const playhead = document.createElement('div');
  playhead.className = 'ruler-playhead';
  track.append(played, keyLayer, playhead);
  bar.append(track);
  ruler.append(labelLayer, bar);

  // "24 / 48", with the time in seconds under it
  const counter = document.createElement('div');
  counter.className = 'frame-counter';
  const frameNow = document.createElement('span');
  frameNow.className = 'frame-now';
  const frameTotal = document.createElement('span');
  frameTotal.className = 'frame-total';
  const seconds = document.createElement('div');
  seconds.className = 'frame-seconds';
  counter.append(frameNow, frameTotal, seconds);

  root.replaceChildren(playButton, ruler, counter);

  let keys: readonly number[] = [];
  let pickedKeys = new Set<number>();
  let drawnRange = '';

  /** A frame's position as a CSS percentage, so it stays right when the window resizes. */
  const percentAt = (frame: number) =>
    fractionAt(frame, timeline.frameStart, timeline.frameEnd) * 100;

  function renderLabels() {
    const { frameStart: start, frameEnd: end } = timeline;
    const elements = rulerLabels(start, end, track.clientWidth).map((frame) => {
      const label = document.createElement('span');
      label.className = 'ruler-label';
      label.style.left = `${percentAt(frame)}%`;
      label.textContent = String(frame);
      return label;
    });
    labelLayer.replaceChildren(...elements);
  }

  function keyElement(frame: number, picked: boolean): HTMLElement {
    const key = document.createElement('span');
    key.className = picked ? 'ruler-key picked' : 'ruler-key';
    key.style.left = `${percentAt(frame)}%`;
    key.title = `Key at frame ${Number(frame.toFixed(2))}`;
    return key;
  }

  function renderKeys() {
    const { frameStart: start, frameEnd: end } = timeline;
    const inRange = keys.filter((frame) => frame >= start && frame <= end);
    // The picked keys go last, so they're drawn on top of another object's key on the same frame
    keyLayer.replaceChildren(
      ...inRange.filter((frame) => !pickedKeys.has(frame)).map((frame) => keyElement(frame, false)),
      ...inRange.filter((frame) => pickedKeys.has(frame)).map((frame) => keyElement(frame, true)),
    );
  }

  const render = () => {
    playButton.innerHTML = timeline.playing ? PAUSE : PLAY;
    playButton.title = timeline.playing ? 'Pause (Space)' : 'Play (Space)';
    playButton.setAttribute('aria-label', timeline.playing ? 'Pause' : 'Play');
    const position = percentAt(timeline.frame);
    playhead.style.left = `${position}%`;
    played.style.width = `calc(${position}% + var(--track-inset))`; // filled from the bar's left end
    frameNow.textContent = String(timeline.frame);
    frameTotal.textContent = ` / ${timeline.frameEnd}`;
    seconds.textContent = `${frameToSeconds(timeline.frame, timeline.fps).toFixed(2)}s`;
    ruler.setAttribute('aria-valuemin', String(timeline.frameStart));
    ruler.setAttribute('aria-valuemax', String(timeline.frameEnd));
    ruler.setAttribute('aria-valuenow', String(timeline.frame));

    // Labels and keys only move when the range changes, not on every frame of playback
    const range = `${timeline.frameStart}-${timeline.frameEnd}`;
    if (range !== drawnRange) {
      drawnRange = range;
      renderLabels();
      renderKeys();
    }
  };

  // Scrubbing: press anywhere on the ruler, then drag
  const scrubTo = (event: PointerEvent) => {
    const bounds = track.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    timeline.setFrame(frameAt(x, bounds.width, timeline.frameStart, timeline.frameEnd));
  };
  ruler.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    ruler.setPointerCapture(event.pointerId); // keep receiving moves even outside the ruler
    timeline.pause();
    scrubTo(event);
  });
  ruler.addEventListener('pointermove', (event) => {
    if (ruler.hasPointerCapture(event.pointerId)) scrubTo(event);
  });

  playButton.addEventListener('mousedown', (event) => event.preventDefault()); // keep keys on playback
  playButton.addEventListener('click', () => timeline.toggle());
  new ResizeObserver(renderLabels).observe(ruler); // more room means more labels
  timeline.onChange(render);
  render();

  return {
    setKeys(frames, picked) {
      keys = frames;
      pickedKeys = new Set(picked);
      renderKeys();
    },
  };
}
