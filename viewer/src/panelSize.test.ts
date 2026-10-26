import { describe, expect, it } from 'vitest';
import { fitWidth, PANEL_LIMITS, readWidths } from './panelSize';

describe('fitWidth', () => {
  it('keeps a width inside the limits', () => {
    expect(fitWidth(300, 1440)).toBe(300);
    expect(fitWidth(50, 1440)).toBe(PANEL_LIMITS.min);
    expect(fitWidth(900, 1440)).toBe(PANEL_LIMITS.max);
  });

  it('never takes more than a third of a small window', () => {
    expect(fitWidth(400, 900)).toBe(300);
  });

  it('still allows the minimum in a tiny window', () => {
    expect(fitWidth(400, 300)).toBe(PANEL_LIMITS.min);
  });
});

describe('readWidths', () => {
  it('reads the saved widths', () => {
    expect(readWidths('{"scene": 260, "changes": 300}')).toEqual({ scene: 260, changes: 300 });
  });

  it('ignores anything that is not a width', () => {
    expect(readWidths('{"scene": "wide", "changes": 280, "other": 5}')).toEqual({ changes: 280 });
    expect(readWidths('not json')).toEqual({});
    expect(readWidths(null)).toEqual({});
  });
});
