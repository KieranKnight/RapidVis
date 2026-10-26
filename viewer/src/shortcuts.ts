import type { MenuAction } from './platform';

/** Everything the keyboard can do: the native menu's actions, plus playback and the command bar. */
export type Action =
  | MenuAction
  | 'open'
  | 'play'
  | 'next-frame'
  | 'previous-frame'
  | 'next-key'
  | 'previous-key'
  | 'deselect'
  | 'command';

export interface Shortcut {
  action: Action;
  /** Held Ctrl (Cmd on a Mac). These still work with a button focused. */
  ctrl: boolean;
  /** Stop the browser's own use of the key: its Save, scrolling the page, moving the focus. */
  preventDefault: boolean;
}

/** The parts of a key press a shortcut depends on. */
export type KeyPress = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** With Ctrl, by `event.key` (Ctrl+Z is wherever the Z is). Ctrl+Shift+Z is redo too. */
const CTRL_KEYS: Record<string, Action> = {
  z: 'undo',
  y: 'redo',
  s: 'save',
  o: 'open',
  e: 'export',
};

/** Without Ctrl, by `event.code` (where the key sits, whatever the keyboard's layout). */
const KEYS: Record<string, Omit<Shortcut, 'ctrl'>> = {
  Space: { action: 'play', preventDefault: true }, // not scrolling the page
  ArrowRight: { action: 'next-frame', preventDefault: false },
  ArrowLeft: { action: 'previous-frame', preventDefault: false },
  ArrowUp: { action: 'next-key', preventDefault: true },
  ArrowDown: { action: 'previous-key', preventDefault: true },
  Escape: { action: 'deselect', preventDefault: false },
  KeyH: { action: 'changes-panel', preventDefault: false },
  KeyO: { action: 'overlays', preventDefault: false },
  KeyB: { action: 'burn-in', preventDefault: false },
  KeyC: { action: 'compare', preventDefault: false },
  KeyT: { action: 'cards', preventDefault: false },
};

/** The shortcut a key press is, or null if it isn't one. */
export function shortcutFor(event: KeyPress): Shortcut | null {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    const action = key === 'z' && event.shiftKey ? 'redo' : CTRL_KEYS[key];
    return action ? { action, ctrl: true, preventDefault: true } : null;
  }
  // Tab moves no focus: on the page, it shows or hides the panels
  if (event.key === 'Tab') return { action: 'scene-panel', ctrl: false, preventDefault: true };
  const plain = KEYS[event.code];
  if (plain) return { ...plain, ctrl: false };
  // The command bar gets its own /, which also opens the menu
  if (event.key === '/') return { action: 'command', ctrl: false, preventDefault: true };
  return null;
}
