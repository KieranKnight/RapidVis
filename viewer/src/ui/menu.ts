/** One line in a dropdown menu. */
export type MenuEntry =
  | {
      kind: 'action';
      label: string;
      shortcut?: string; // shown on the right, e.g. "Ctrl O"
      title?: string; // a tooltip, e.g. a recent shot's full path
      checked?: boolean; // makes it one of a set of choices, e.g. the cameras
      run: () => void;
    }
  | { kind: 'submenu'; label: string; entries: () => MenuEntry[] }
  | { kind: 'divider' }
  | { kind: 'custom'; element: HTMLElement }; // e.g. the theme switch

export interface Menu {
  readonly isOpen: boolean;
  open(): void;
  close(returnFocus?: boolean): void;
  toggle(): void;
}

export interface MenuOptions {
  label: string; // what screen readers call the menu
  placement: 'below' | 'above';
  onToggle?: (open: boolean) => void;
}

const FOCUSABLE = '.menu-item, .menu-focusable';

/** The menu's items that the arrow keys move between. */
function itemsOf(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (item) => item.closest('.menu') === menu, // not a submenu's items
  );
}

/**
 * A dropdown menu under (or over) `anchor`, which must sit in a `position: relative` box.
 * `entries` is asked again on every open, so the menu always shows the current state.
 * Closes on Esc, a click outside, Tab, or choosing an action; the arrow keys move through it.
 */
export function createMenu(
  anchor: HTMLElement,
  entries: () => MenuEntry[],
  options: MenuOptions,
): Menu {
  const box = anchor.parentElement;
  if (!box) throw new Error('A menu anchor needs a parent to hold the menu');
  anchor.setAttribute('aria-haspopup', 'menu');
  anchor.setAttribute('aria-expanded', 'false');

  let menu: HTMLElement | null = null;

  function moveFocus(within: HTMLElement, step: number | 'first' | 'last') {
    const items = itemsOf(within);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? items.length - 1
          : (index + step + items.length) % items.length; // wraps around
    items[next].focus();
  }

  function build(list: MenuEntry[], className: string): HTMLElement {
    const element = document.createElement('div');
    element.className = className;
    element.setAttribute('role', 'menu');
    element.setAttribute('aria-label', options.label);
    for (const entry of list) element.append(buildEntry(entry, element));
    return element;
  }

  function buildEntry(entry: MenuEntry, parent: HTMLElement): HTMLElement {
    if (entry.kind === 'divider') {
      const divider = document.createElement('div');
      divider.className = 'menu-divider';
      divider.setAttribute('role', 'separator');
      return divider;
    }
    if (entry.kind === 'custom') return entry.element;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'menu-item';
    item.tabIndex = -1; // reached with the arrow keys, not Tab
    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = entry.label;
    item.append(label);

    if (entry.kind === 'submenu') {
      item.setAttribute('role', 'menuitem');
      item.setAttribute('aria-haspopup', 'menu');
      const arrow = document.createElement('span');
      arrow.className = 'menu-hint';
      arrow.textContent = '›';
      item.append(arrow);
      const openSub = (focus: boolean) => {
        parent.querySelector(':scope > .submenu')?.remove();
        const sub = build(entry.entries(), 'menu submenu');
        sub.style.top = `${item.offsetTop - 6}px`; // lined up with its item
        parent.append(sub);
        item.setAttribute('aria-expanded', 'true');
        if (focus) moveFocus(sub, 'first');
      };
      item.addEventListener('click', () => openSub(true));
      item.addEventListener('mouseenter', () => openSub(false));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault(); // the submenu opens to the left, beside the window's edge
          event.stopPropagation();
          openSub(true);
        }
      });
      return item;
    }

    item.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (entry.checked !== undefined) item.setAttribute('aria-checked', String(entry.checked));
    if (entry.title) item.title = entry.title;
    if (entry.shortcut || entry.checked) {
      const hint = document.createElement('span');
      hint.className = 'menu-hint';
      hint.textContent = entry.checked ? '✓' : (entry.shortcut ?? '');
      item.append(hint);
    }
    item.addEventListener('mouseenter', () => parent.querySelector(':scope > .submenu')?.remove());
    item.addEventListener('click', (event) => {
      close(event.detail === 0); // detail 0: chosen with the keyboard, so keep the focus nearby
      entry.run();
    });
    return item;
  }

  function onKey(event: KeyboardEvent) {
    const current = (event.target as HTMLElement).closest<HTMLElement>('.menu');
    if (!current) return;
    if (event.key === 'ArrowDown') moveFocus(current, 1);
    else if (event.key === 'ArrowUp') moveFocus(current, -1);
    else if (event.key === 'Home') moveFocus(current, 'first');
    else if (event.key === 'End') moveFocus(current, 'last');
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!current.classList.contains('submenu')) return;
      // Back out of a submenu, to the item that opened it
      const opener = current.parentElement?.querySelector<HTMLElement>('[aria-expanded="true"]');
      current.remove();
      opener?.setAttribute('aria-expanded', 'false');
      opener?.focus();
    } else if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close(false);
    else return;
    event.preventDefault();
    event.stopPropagation(); // the app's own shortcuts never see keys meant for the menu
  }

  function onOutside(event: PointerEvent) {
    if (!box!.contains(event.target as Node)) close(false);
  }

  function open() {
    if (menu) return;
    menu = build(entries(), `menu menu-${options.placement}`);
    menu.addEventListener('keydown', onKey);
    box!.append(menu);
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    options.onToggle?.(true);
    moveFocus(menu, 'first');
  }

  function close(returnFocus = false) {
    if (!menu) return;
    menu.remove();
    menu = null;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    options.onToggle?.(false);
    if (returnFocus) anchor.focus();
    else anchor.blur(); // so Space goes back to playing the shot, not reopening the menu
  }

  anchor.addEventListener('click', () => (menu ? close(false) : open()));
  anchor.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && options.placement === 'below') {
      event.preventDefault();
      open();
    } else if (event.key === 'ArrowUp' && options.placement === 'above') {
      event.preventDefault();
      open();
    }
  });

  return {
    get isOpen() {
      return menu !== null;
    },
    open,
    close,
    toggle: () => (menu ? close(false) : open()),
  };
}
