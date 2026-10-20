import { describe, expect, it, vi } from 'vitest';
import { Timeline, frameToSeconds, secondsToFrame } from './timeline';

function makeTimeline() {
  const timeline = new Timeline();
  timeline.configure(24, { frameStart: 1, frameEnd: 48 });
  return timeline;
}

describe('frame/seconds conversion', () => {
  it('puts frame 1 at 1/24 s at 24 fps', () => {
    expect(frameToSeconds(1, 24)).toBeCloseTo(1 / 24);
  });

  it('round-trips frame -> seconds -> frame', () => {
    expect(secondsToFrame(frameToSeconds(37, 24), 24)).toBeCloseTo(37);
  });
});

describe('Timeline', () => {
  it('starts paused on frameStart', () => {
    const timeline = makeTimeline();
    expect(timeline.frame).toBe(1);
    expect(timeline.playing).toBe(false);
  });

  it('clamps and rounds setFrame', () => {
    const timeline = makeTimeline();
    timeline.setFrame(100);
    expect(timeline.frame).toBe(48);
    timeline.setFrame(-5);
    expect(timeline.frame).toBe(1);
    timeline.setFrame(12.6);
    expect(timeline.frame).toBe(13);
  });

  it('does not advance while paused', () => {
    const timeline = makeTimeline();
    timeline.tick(1);
    expect(timeline.frame).toBe(1);
  });

  it('advances 12 frames in half a second', () => {
    const timeline = makeTimeline();
    timeline.play();
    timeline.tick(0.5);
    expect(timeline.frame).toBe(13);
  });

  it('accumulates partial frames', () => {
    const timeline = makeTimeline();
    timeline.play();
    timeline.tick(1 / 72);
    timeline.tick(1 / 72);
    expect(timeline.frame).toBe(1);
    timeline.tick(1 / 72);
    expect(timeline.frame).toBe(2);
  });

  it('loops from frameEnd back to frameStart', () => {
    const timeline = makeTimeline();
    timeline.setFrame(48);
    timeline.play();
    timeline.tick(1 / 24);
    expect(timeline.frame).toBe(1);
  });

  it('step pauses and moves one frame', () => {
    const timeline = makeTimeline();
    timeline.play();
    timeline.step(1);
    expect(timeline.playing).toBe(false);
    expect(timeline.frame).toBe(2);
  });

  it('notifies listeners when the frame changes', () => {
    const timeline = makeTimeline();
    const listener = vi.fn();
    timeline.onChange(listener);
    timeline.setFrame(10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setRange keeps the current frame and playback when the frame is inside', () => {
    const timeline = makeTimeline();
    timeline.setFrame(20);
    timeline.play();
    timeline.setRange({ frameStart: 10, frameEnd: 30 });
    expect(timeline.frame).toBe(20);
    expect(timeline.playing).toBe(true);
  });

  it('setRange clamps the current frame into the new range', () => {
    const timeline = makeTimeline();
    timeline.setFrame(40);
    timeline.setRange({ frameStart: 10, frameEnd: 30 });
    expect(timeline.frame).toBe(30);
  });
});
