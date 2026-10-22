import { historyHeight, readLayout, sidebarWidth, type Layout } from '../layout';
import { createSplitter } from './splitter';

const STORAGE_KEY = 'rapidvis.layout';

export interface Sidebar {
  readonly collapsed: boolean;
  setCollapsed(collapsed: boolean): void;
}

// Storage can be missing or blocked (private windows, strict settings), so it must never throw
function load(): Layout {
  try {
    return readLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return readLayout(null);
  }
}

function save(layout: Layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Nowhere to keep it: the layout just won't be remembered
  }
}

/**
 * Makes the sidebar resizable (its right edge, and the line above the history) and
 * collapsible, and remembers how it was left. Sizes reach the CSS as variables on `app`.
 */
export function createSidebar(
  app: HTMLElement,
  sidebar: HTMLElement,
  history: HTMLElement,
): Sidebar {
  const layout = load();

  /** Shows the layout, clamped to fit the window as it is right now. */
  function apply() {
    app.classList.toggle('sidebar-collapsed', layout.collapsed);
    const width = sidebarWidth(layout.sidebarWidth, window.innerWidth);
    const height = historyHeight(layout.historyHeight, sidebar.clientHeight);
    app.style.setProperty('--sidebar-width', `${width}px`);
    app.style.setProperty('--history-height', `${height}px`);
  }

  createSplitter(sidebar, {
    axis: 'x',
    panel: sidebar,
    grow: 1, // the handle is on the right edge, so dragging right makes it wider
    onResize: (size) => {
      layout.sidebarWidth = sidebarWidth(size, window.innerWidth);
      apply();
    },
    onDone: () => save(layout),
  });

  createSplitter(history, {
    axis: 'y',
    panel: history,
    grow: -1, // the handle is above the history, so dragging up makes it taller
    onResize: (size) => {
      layout.historyHeight = historyHeight(size, sidebar.clientHeight);
      apply();
    },
    onDone: () => save(layout),
  });

  window.addEventListener('resize', apply); // a smaller window may need smaller panels
  apply();

  return {
    get collapsed() {
      return layout.collapsed;
    },
    setCollapsed(collapsed) {
      layout.collapsed = collapsed;
      apply();
      save(layout);
    },
  };
}
