/** How the sidebar is laid out. Saved between visits. */
export interface Layout {
  sidebarWidth: number; // px, as wide as it was dragged (it's clamped when shown)
  historyHeight: number; // px
  collapsed: boolean;
}

export const DEFAULT_LAYOUT: Layout = { sidebarWidth: 240, historyHeight: 150, collapsed: false };

/** Keeps a size between `min` and `max`. If they cross (a tiny window), `min` wins. */
export function clampSize(size: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(size, max)));
}

/** At least 160px, and never more than half the window. */
export function sidebarWidth(wanted: number, windowWidth: number): number {
  return clampSize(wanted, 160, windowWidth / 2);
}

/** At least a few rows, and always leaving the outliner some room above it. */
export function historyHeight(wanted: number, sidebarHeight: number): number {
  return clampSize(wanted, 80, sidebarHeight - 200);
}

/** The saved layout, using the defaults for anything missing or broken. */
export function readLayout(saved: string | null): Layout {
  const data = parseObject(saved);
  return {
    sidebarWidth: isSize(data.sidebarWidth) ? data.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
    historyHeight: isSize(data.historyHeight) ? data.historyHeight : DEFAULT_LAYOUT.historyHeight,
    collapsed: typeof data.collapsed === 'boolean' ? data.collapsed : DEFAULT_LAYOUT.collapsed,
  };
}

function parseObject(text: string | null): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(text ?? '{}');
    if (typeof data === 'object' && data !== null) return data as Record<string, unknown>;
  } catch {
    // Not JSON (edited by hand?): use the defaults
  }
  return {};
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
