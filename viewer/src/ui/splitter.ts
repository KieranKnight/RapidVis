export interface SplitterOptions {
  axis: 'x' | 'y'; // 'x' drags left and right, 'y' drags up and down
  panel: HTMLElement; // the panel this handle resizes
  /** 1 if dragging right (or down) makes the panel bigger, -1 if left (or up) does. */
  grow: 1 | -1;
  onResize: (size: number) => void; // while dragging, with the size the panel should be
  onDone: () => void; // once, when the drag ends
}

/** A thin handle that resizes a panel when it's dragged. */
export function createSplitter(root: HTMLElement, options: SplitterOptions): HTMLElement {
  const { axis, panel, grow, onResize, onDone } = options;
  const handle = document.createElement('div');
  handle.className = `splitter splitter-${axis}`;
  root.append(handle);

  const position = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY);
  let start: { pointer: number; size: number } | null = null; // null when not dragging

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault(); // don't start selecting text
    handle.setPointerCapture(event.pointerId); // keep getting moves after leaving the handle
    const rect = panel.getBoundingClientRect();
    start = { pointer: position(event), size: axis === 'x' ? rect.width : rect.height };
    handle.classList.add('dragging');
  });

  handle.addEventListener('pointermove', (event) => {
    if (!start) return;
    onResize(start.size + (position(event) - start.pointer) * grow);
  });

  const end = () => {
    if (!start) return;
    start = null;
    handle.classList.remove('dragging');
    onDone();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  return handle;
}
