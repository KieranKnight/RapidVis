import type { RecentShot } from '../platform';
import type { Theme } from '../theme';
import { createMenu, type MenuEntry } from './menu';
import { keepFocus } from './dom';

// A 12px chevron pointing down, drawn in the chip's muted colour
const CHEVRON =
  '<svg class="chip-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>';

/** Everything the shot menu can do: main.ts answers all of these. */
export interface ShotMenuActions {
  open(): void;
  /** The recent shots, or null where there's no such list (a browser can't reopen by path). */
  recent(): readonly RecentShot[] | null;
  openRecent(shot: RecentShot): void;
  export(): void;
  save(): void;
  load(): void;
  theme(): Theme;
  setTheme(theme: Theme): void;
}

export interface ShotMenu {
  /** The shot's name, and its "24 fps · 1–48" readout. */
  setShot(name: string, info: string): void;
}

/** A Light / Dark switch for the menu's last row. Changing it leaves the menu open. */
function themeRow(actions: ShotMenuActions): HTMLElement {
  const row = document.createElement('div');
  row.className = 'menu-row';
  const label = document.createElement('span');
  label.className = 'menu-label';
  label.textContent = 'Theme';
  const switcher = document.createElement('div');
  switcher.className = 'segmented';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Theme');

  const buttons = (['light', 'dark'] as const).map((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'segment menu-focusable';
    button.tabIndex = -1;
    button.textContent = theme === 'light' ? 'Light' : 'Dark';
    button.addEventListener('click', () => {
      actions.setTheme(theme);
      show();
    });
    return button;
  });
  const show = () => {
    const current = actions.theme();
    buttons.forEach((button, i) =>
      button.setAttribute('aria-pressed', String((i === 0 ? 'light' : 'dark') === current)),
    );
  };
  show();

  switcher.append(...buttons);
  row.append(label, switcher);
  return row;
}

/** The shot chip at the top right, and the menu it opens: open, export, save and load, theme. */
export function createShotMenu(root: HTMLElement, actions: ShotMenuActions): ShotMenu {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'shot-chip';
  const name = document.createElement('span');
  name.className = 'shot-name';
  name.textContent = 'RapidVis';
  const info = document.createElement('span');
  info.className = 'shot-info';
  chip.append(name, info);
  chip.insertAdjacentHTML('beforeend', CHEVRON);
  keepFocus(chip);
  root.append(chip);

  const entries = (): MenuEntry[] => {
    const recent = actions.recent();
    return [
      { kind: 'action', label: 'Open shot…', shortcut: 'Ctrl O', run: actions.open },
      ...(recent
        ? [
            {
              kind: 'submenu' as const,
              label: 'Open recent',
              entries: (): MenuEntry[] =>
                recent.length > 0
                  ? recent.map((shot) => ({
                      kind: 'action' as const,
                      label: shot.name,
                      title: shot.path,
                      run: () => actions.openRecent(shot),
                    }))
                  : [{ kind: 'custom', element: emptyNote('No recent shots') }],
            },
          ]
        : []),
      { kind: 'action', label: 'Export…', shortcut: 'Ctrl E', run: actions.export },
      { kind: 'divider' },
      { kind: 'action', label: 'Save changes…', shortcut: 'Ctrl S', run: actions.save },
      { kind: 'action', label: 'Load changes…', run: actions.load },
      { kind: 'divider' },
      { kind: 'custom', element: themeRow(actions) },
    ];
  };

  createMenu(chip, entries, {
    label: 'Shot',
    placement: 'below',
    onToggle: (open) => chip.classList.toggle('open', open),
  });

  return {
    setShot(shotName, shotInfo) {
      name.textContent = shotName;
      info.textContent = shotInfo;
    },
  };
}

function emptyNote(text: string): HTMLElement {
  const note = document.createElement('div');
  note.className = 'menu-note';
  note.textContent = text;
  return note;
}
