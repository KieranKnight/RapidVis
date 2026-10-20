import type { Timeline } from '../timeline';

export function createTimelineBar(root: HTMLElement, timeline: Timeline) {
  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'play-button';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.step = '1';
  slider.className = 'frame-slider';

  const label = document.createElement('span');
  label.className = 'frame-label';

  root.replaceChildren(playButton, slider, label);

  playButton.addEventListener('click', () => timeline.toggle());
  slider.addEventListener('input', () => {
    timeline.pause();
    timeline.setFrame(Number(slider.value));
  });

  const render = () => {
    playButton.textContent = timeline.playing ? '⏸' : '▶';
    playButton.title = timeline.playing ? 'Pause (Space)' : 'Play (Space)';
    slider.min = String(timeline.frameStart);
    slider.max = String(timeline.frameEnd);
    slider.value = String(timeline.frame);
    label.textContent = `${timeline.frame} / ${timeline.frameEnd}`;
  };

  timeline.onChange(render);
  render();
}
