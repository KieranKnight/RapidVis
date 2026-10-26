/** How wide a side panel may be dragged. */
export const PANEL_LIMITS = { min: 200, max: 420 } as const;

/** A panel width that fits: inside the limits, and never more than a third of the window. */
export function fitWidth(width: number, windowWidth: number): number {
  const max = Math.max(PANEL_LIMITS.min, Math.min(PANEL_LIMITS.max, windowWidth / 3));
  return Math.round(Math.min(max, Math.max(PANEL_LIMITS.min, width)));
}

/** The side panels' remembered widths, in pixels (missing until a panel has been dragged). */
export interface PanelWidths {
  scene?: number;
  changes?: number;
}

/** Reads the saved widths, keeping only sensible numbers (the saved text may be old or edited). */
export function readWidths(json: string | null): PanelWidths {
  let data: unknown;
  try {
    data = JSON.parse(json ?? '{}');
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null) return {};
  const widths: PanelWidths = {};
  for (const key of ['scene', 'changes'] as const) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) widths[key] = value;
  }
  return widths;
}
