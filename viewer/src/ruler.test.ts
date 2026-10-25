import { describe, expect, it } from 'vitest';
import { fractionAt, frameAt, nextKey, rulerLabels, tickStep, ticks } from './ruler';

describe('frameAt', () => {
  it('maps a position to the nearest whole frame', () => {
    expect(frameAt(0, 470, 1, 48)).toBe(1);
    expect(frameAt(235, 470, 1, 48)).toBe(25); // halfway
    expect(frameAt(470, 470, 1, 48)).toBe(48);
  });

  it('stays inside the range when dragging past either end', () => {
    expect(frameAt(-50, 470, 1, 48)).toBe(1);
    expect(frameAt(9999, 470, 1, 48)).toBe(48);
  });
});

describe('fractionAt', () => {
  it('is 0 at the start, 1 at the end, and safe when the range is one frame', () => {
    expect(fractionAt(1, 1, 49)).toBe(0);
    expect(fractionAt(25, 1, 49)).toBe(0.5);
    expect(fractionAt(5, 5, 5)).toBe(0);
  });
});

describe('tickStep and ticks', () => {
  it('labels every frame when there is room, and fewer when there is not', () => {
    expect(tickStep(1, 48, 4800)).toBe(1); // 100px per frame
    expect(tickStep(1, 48, 470)).toBe(5); // 10px per frame, so every 5th
    expect(tickStep(1, 2000, 470)).toBe(250);
  });

  it('lists the multiples of the step inside the range', () => {
    expect(ticks(1, 48, 10)).toEqual([10, 20, 30, 40]);
    expect(ticks(0, 20, 10)).toEqual([0, 10, 20]);
  });
});

describe('nextKey', () => {
  const keys = [1, 12.4, 24, 48];

  it('finds the next and previous keys', () => {
    expect(nextKey(keys, 1, 1)).toBe(12);
    expect(nextKey(keys, 30, -1)).toBe(24);
  });

  it('skips the key you are standing on', () => {
    expect(nextKey(keys, 24, 1)).toBe(48);
    expect(nextKey(keys, 24, -1)).toBe(12);
  });

  it('returns null past the last or first key', () => {
    expect(nextKey(keys, 48, 1)).toBeNull();
    expect(nextKey(keys, 1, -1)).toBeNull();
    expect(nextKey([], 10, 1)).toBeNull();
  });
});

describe('rulerLabels', () => {
  it('always labels the first and last frame', () => {
    // 10px a frame: steps of 5, but 5 itself is too close to 1, and 45 to 48
    expect(rulerLabels(1, 48, 470)).toEqual([1, 10, 15, 20, 25, 30, 35, 40, 48]);
  });

  it('labels a single frame once', () => {
    expect(rulerLabels(10, 10, 400)).toEqual([10]);
  });
});
