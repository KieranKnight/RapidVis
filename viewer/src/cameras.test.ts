import { describe, expect, it } from 'vitest';
import { fitAspect } from './cameras';

describe('fitAspect', () => {
  it('fills the container when the aspects match', () => {
    expect(fitAspect(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('adds bars left and right when the container is wider', () => {
    expect(fitAspect(2000, 1000, 16 / 9)).toEqual({ x: 111, y: 0, width: 1778, height: 1000 });
  });

  it('adds bars top and bottom when the container is taller', () => {
    expect(fitAspect(1600, 1200, 16 / 9)).toEqual({ x: 0, y: 150, width: 1600, height: 900 });
  });
});
