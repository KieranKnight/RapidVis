// Remembered settings (theme, panels, burn-in). Storage can be missing or blocked: then nothing
// is remembered, and that must never break anything

export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered, but everything still works
  }
}

export function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
