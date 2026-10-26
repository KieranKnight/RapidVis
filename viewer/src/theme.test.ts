import { describe, expect, it } from 'vitest';
import { pickTheme } from './theme';

describe('pickTheme', () => {
  it('uses the saved choice over the OS setting', () => {
    expect(pickTheme('dark', true)).toBe('dark');
    expect(pickTheme('light', false)).toBe('light');
  });

  it('follows the OS when nothing is saved', () => {
    expect(pickTheme(null, true)).toBe('light');
    expect(pickTheme(null, false)).toBe('dark');
  });

  it('ignores a saved value it does not know', () => {
    expect(pickTheme('purple', false)).toBe('dark');
  });
});
