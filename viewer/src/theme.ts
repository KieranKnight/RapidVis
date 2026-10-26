import { recall, remember } from './storage';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rapidvis.theme';

/** The theme to start in: the one chosen last time, else the OS setting, else dark. */
export function pickTheme(saved: string | null, osPrefersLight: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return osPrefersLight ? 'light' : 'dark';
}

export function startingTheme(): Theme {
  return pickTheme(recall(STORAGE_KEY), matchMedia('(prefers-color-scheme: light)').matches);
}

/** Switches every colour on the page (style.css swaps its tokens on `data-theme`). */
export function showTheme(theme: Theme, animate = false) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-changing'); // fades the colours, only while switching
    setTimeout(() => root.classList.remove('theme-changing'), 300);
  }
  root.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  remember(STORAGE_KEY, theme);
}

/** The colours the 3D view takes from the theme. */
export interface SceneColors {
  background: string;
  grid: string;
  gizmo: string;
  accent: string;
}

/** Reads the current theme's tokens, so the 3D view always matches the CSS. */
export function sceneColors(): SceneColors {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: token('--bg'),
    grid: token('--grid'),
    gizmo: token('--muted'),
    accent: token('--accent'),
  };
}
