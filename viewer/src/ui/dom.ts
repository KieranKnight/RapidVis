/** An element from index.html, which must be there. */
export function getElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

/** Clicking `element` doesn't take the focus, so Space and the arrows keep controlling playback. */
export function keepFocus(element: HTMLElement) {
  element.addEventListener('mousedown', (event) => event.preventDefault());
}

/** "✖ what went wrong", for a status line. */
export function errorLine(error: unknown): string {
  return `✖ ${error instanceof Error ? error.message : String(error)}`;
}
