import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, clampSize, historyHeight, readLayout, sidebarWidth } from './layout';

describe('clampSize', () => {
  it('keeps a size between the limits, in whole pixels', () => {
    expect(clampSize(250.4, 100, 400)).toBe(250);
    expect(clampSize(50, 100, 400)).toBe(100);
    expect(clampSize(900, 100, 400)).toBe(400);
  });

  it('lets the minimum win when the limits cross', () => {
    expect(clampSize(250, 100, 60)).toBe(100);
  });
});

describe('sidebarWidth', () => {
  it("can't take more than half the window", () => {
    expect(sidebarWidth(300, 1600)).toBe(300);
    expect(sidebarWidth(1000, 1600)).toBe(800);
  });

  it("can't get too thin to use, even in a tiny window", () => {
    expect(sidebarWidth(20, 1600)).toBe(160);
    expect(sidebarWidth(300, 200)).toBe(160);
  });
});

describe('historyHeight', () => {
  it('leaves the outliner room above it', () => {
    expect(historyHeight(150, 900)).toBe(150);
    expect(historyHeight(850, 900)).toBe(700);
    expect(historyHeight(10, 900)).toBe(80);
  });
});

describe('readLayout', () => {
  it('uses the defaults when nothing was saved', () => {
    expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it('reads back what was saved', () => {
    const saved = { sidebarWidth: 320, historyHeight: 200, collapsed: true };
    expect(readLayout(JSON.stringify(saved))).toEqual(saved);
  });

  it('replaces anything missing or broken with its default', () => {
    expect(readLayout('{"sidebarWidth": 320, "historyHeight": "big"}')).toEqual({
      ...DEFAULT_LAYOUT,
      sidebarWidth: 320,
    });
    expect(readLayout('not json')).toEqual(DEFAULT_LAYOUT);
    expect(readLayout('null')).toEqual(DEFAULT_LAYOUT);
  });
});
