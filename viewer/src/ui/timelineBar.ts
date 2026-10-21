import { fractionAt, frameAt, tickStep, ticks } from '../ruler';
import type { Timeline } from '../timeline';

export interface TimelineBar {
  /** The frames to mark with a key diamond. */
  setKeys(frames: readonly number[]): void;
}

export function createTimelineBar(root: HTMLElement, timeline: Timeline): TimelineBar {
  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'play-button';

  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  ruler.setAttribute('role', 'slider');
  ruler.setAttribute('aria-label', 'Current frame');
  const tickLayer = document.createElement('div');
  const keyLayer = document.createElement('div');
  keyLayer.className = 'ruler-keys';
  const playhead = document.createElement('div');
  playhead.className = 'ruler-playhead';
  // The track sits inset from the ruler's edges, so keys on the first and last frame aren't cut in half
  const track = document.createElement('div');
  track.className = 'ruler-track';
  track.append(tickLayer, keyLayer, playhead);
  ruler.append(track);

  const label = document.createElement('span');
  label.className = 'frame-label';

  root.replaceChildren(playButton, ruler, label);

  let keys: readonly number[] = [];
  let drawnRange = '';

  /** A frame's position as a CSS left value, so it stays right when the window resizes. */
  const leftOf = (frame: number) =>
    `${fractionAt(frame, timeline.frameStart, timeline.frameEnd) * 100}%`;

  function renderTicks() {
    const { frameStart: start, frameEnd: end } = timeline;
    const step = tickStep(start, end, track.clientWidth);
    const elements = ticks(start, end, step).map((frame) => {
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';
      tick.style.left = leftOf(frame);
      tick.textContent = String(frame);
      return tick;
    });
    tickLayer.replaceChildren(...elements);
  }

  function renderKeys() {
    const { frameStart: start, frameEnd: end } = timeline;
    const elements = keys
      .filter((frame) => frame >= start && frame <= end)
      .map((frame) => {
        const key = document.createElement('span');
        key.className = 'ruler-key';
        key.style.left = leftOf(frame);
        key.title = `Key at frame ${Number(frame.toFixed(2))}`;
        return key;
      });
    keyLayer.replaceChildren(...elements);
  }

  const render = () => {
    playButton.textContent = timeline.playing ? '⏸' : '▶';
    playButton.title = timeline.playing ? 'Pause (Space)' : 'Play (Space)';
    playhead.style.left = leftOf(timeline.frame);
    label.textContent = `${timeline.frame} / ${timeline.frameEnd}`;
    ruler.setAttribute('aria-valuemin', String(timeline.frameStart));
    ruler.setAttribute('aria-valuemax', String(timeline.frameEnd));
    ruler.setAttribute('aria-valuenow', String(timeline.frame));

    // Ticks and keys only move when the range changes, not on every frame of playback
    const range = `${timeline.frameStart}-${timeline.frameEnd}`;
    if (range !== drawnRange) {
      drawnRange = range;
      renderTicks();
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

  playButton.addEventListener('click', () => timeline.toggle());
  new ResizeObserver(renderTicks).observe(ruler); // more room means more labels
  timeline.onChange(render);
  render();

  return {
    setKeys(frames) {
      keys = frames;
      renderKeys();
    },
  };
}
