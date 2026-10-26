import { fitWidth, readWidths } from '../panelSize';
import { recall, remember } from '../storage';
import { getElement, keepFocus } from './dom';
import { createResizeHandle } from './resizeHandle';

const PANELS_KEY = 'rapidvis.scenePanel'; // 'shown' or 'hidden'
const CHANGES_KEY = 'rapidvis.changesPanel';
const WIDTHS_KEY = 'rapidvis.panelWidths';

export interface Panels {
  /** Tab (or the button at the top left): every side panel on or off. */
  toggleAll(): void;
  /** H: Changes on or off. With every panel hidden, it brings the panels back, Changes included. */
  toggleChanges(): void;
  hideChanges(): void;
}

/** A toggle button's pressed state, and the tooltip (and label) that says what clicking does. */
function label(button: HTMLButtonElement, shown: boolean, what: string, key: string) {
  button.setAttribute('aria-pressed', String(shown));
  button.title = `${shown ? 'Hide' : 'Show'} ${what} (${key})`;
  button.setAttribute('aria-label', button.title);
}

/**
 * The Scene and Changes panels: shown or hidden (with their header buttons), and how wide.
 * Both resize from their inner edge, and remember all of it between sessions.
 */
export function createPanels(app: HTMLElement): Panels {
  const panelsButton = getElement<HTMLButtonElement>('#scene-toggle');
  const changesButton = getElement<HTMLButtonElement>('#changes-toggle');
  const panelsShown = () => !app.classList.contains('panels-hidden');
  const changesShown = () => !app.classList.contains('changes-hidden');

  function showPanels(shown: boolean) {
    app.classList.toggle('panels-hidden', !shown);
    label(panelsButton, shown, 'panels', 'Tab');
    remember(PANELS_KEY, shown ? 'shown' : 'hidden');
  }

  function showChanges(shown: boolean) {
    app.classList.toggle('changes-hidden', !shown);
    label(changesButton, shown, 'changes', 'H');
    remember(CHANGES_KEY, shown ? 'shown' : 'hidden');
  }

  const toggleAll = () => showPanels(!panelsShown());
  function toggleChanges() {
    if (!panelsShown()) {
      showPanels(true);
      showChanges(true);
    } else {
      showChanges(!changesShown());
    }
  }

  showPanels(recall(PANELS_KEY) !== 'hidden');
  showChanges(recall(CHANGES_KEY) !== 'hidden');
  for (const [button, toggle] of [
    [panelsButton, toggleAll],
    [changesButton, toggleChanges],
  ] as const) {
    keepFocus(button);
    button.addEventListener('click', toggle);
  }

  // --- Widths ---
  const widths = readWidths(recall(WIDTHS_KEY));
  function applyWidths() {
    app.style.setProperty('--scene-width', `${fitWidth(widths.scene ?? 230, innerWidth)}px`);
    app.style.setProperty('--changes-width', `${fitWidth(widths.changes ?? 240, innerWidth)}px`);
  }
  const saveWidths = () => remember(WIDTHS_KEY, JSON.stringify(widths));
  createResizeHandle(
    getElement<HTMLElement>('#outliner'),
    'right',
    'Resize the scene panel',
    (width) => {
      widths.scene = fitWidth(width, innerWidth);
      applyWidths();
    },
    saveWidths,
  );
  createResizeHandle(
    getElement<HTMLElement>('#changes'),
    'left',
    'Resize the changes panel',
    (width) => {
      widths.changes = fitWidth(width, innerWidth);
      applyWidths();
    },
    saveWidths,
  );
  window.addEventListener('resize', applyWidths); // a smaller window may need narrower panels
  applyWidths();

  return { toggleAll, toggleChanges, hideChanges: () => showChanges(false) };
}
