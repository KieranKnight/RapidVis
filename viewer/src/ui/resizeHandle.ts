/**
 * A thin strip on a panel's inner edge that resizes it: drag it, or focus it and use the arrow keys.
 * `onResize` gets the width asked for (main.ts keeps it sensible); `onDone` is when to remember it.
 */
export function createResizeHandle(
  panel: HTMLElement,
  edge: 'left' | 'right',
  label: string,
  onResize: (width: number) => void,
  onDone: () => void,
) {
  const handle = document.createElement('div');
  handle.className = `resize-handle resize-${edge}`;
  handle.tabIndex = 0;
  handle.title = label;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', label);
  panel.append(handle);

  // Dragging right widens a panel on the left, and narrows one on the right
  const sign = edge === 'right' ? 1 : -1;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault(); // no text selection while dragging
    handle.setPointerCapture(event.pointerId); // keep the drag even off the strip
    handle.classList.add('dragging');
    startX = event.clientX;
    startWidth = panel.offsetWidth;
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) {
      onResize(startWidth + sign * (event.clientX - startX));
    }
  });
  handle.addEventListener('pointerup', () => {
    handle.classList.remove('dragging');
    onDone();
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation(); // not the timeline's frame step
    const step = event.key === 'ArrowRight' ? 16 : -16;
    onResize(panel.offsetWidth + sign * step);
    onDone();
  });
}
