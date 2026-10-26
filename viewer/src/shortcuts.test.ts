import { describe, expect, it } from 'vitest';
import { shortcutFor, type KeyPress } from './shortcuts';

const press = (key: string, code: string, held: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...held,
});

describe('shortcutFor', () => {
  it('reads Ctrl and Cmd shortcuts by the letter, and stops the browser using them', () => {
    expect(shortcutFor(press('s', 'KeyS', { ctrlKey: true }))).toEqual({
      action: 'save',
      ctrl: true,
      preventDefault: true,
    });
    expect(shortcutFor(press('o', 'KeyO', { metaKey: true }))?.action).toBe('open');
  });

  it('undoes with Ctrl+Z, and redoes with Ctrl+Shift+Z or Ctrl+Y', () => {
    expect(shortcutFor(press('z', 'KeyZ', { ctrlKey: true }))?.action).toBe('undo');
    expect(shortcutFor(press('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }))?.action).toBe('redo');
    expect(shortcutFor(press('y', 'KeyY', { ctrlKey: true }))?.action).toBe('redo');
  });

  it('leaves other Ctrl keys alone, even ones that are shortcuts without Ctrl', () => {
    expect(shortcutFor(press('h', 'KeyH', { ctrlKey: true }))).toBeNull();
  });

  it('reads plain keys by where they sit on the keyboard', () => {
    expect(shortcutFor(press('h', 'KeyH'))?.action).toBe('changes-panel');
    expect(shortcutFor(press('z', 'KeyY'))).toBeNull(); // a German Z is where the Y is
  });

  it('stops scrolling and focus moves, but lets the arrows and letters through', () => {
    expect(shortcutFor(press(' ', 'Space'))).toEqual({
      action: 'play',
      ctrl: false,
      preventDefault: true,
    });
    expect(shortcutFor(press('Tab', 'Tab'))?.preventDefault).toBe(true);
    expect(shortcutFor(press('ArrowUp', 'ArrowUp'))?.preventDefault).toBe(true);
    expect(shortcutFor(press('ArrowLeft', 'ArrowLeft'))?.preventDefault).toBe(false);
    expect(shortcutFor(press('b', 'KeyB'))?.preventDefault).toBe(false);
  });

  it('opens the command bar on /', () => {
    expect(shortcutFor(press('/', 'Slash'))?.action).toBe('command');
  });

  it('ignores keys that are not shortcuts', () => {
    expect(shortcutFor(press('q', 'KeyQ'))).toBeNull();
  });
});
