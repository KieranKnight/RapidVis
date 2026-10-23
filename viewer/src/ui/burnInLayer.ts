import type { BurnIn } from '../burnin';
import type { Rect } from '../cameras';

const STORAGE_KEY = 'rapidvis.burnIn';

/**
 * Draws the burn-in inside `area` (in the canvas's own pixels, from the top left).
 * The viewport and the movie export both use this, so they always match.
 */
export function drawBurnIn(context: CanvasRenderingContext2D, text: BurnIn, area: Rect) {
  const size = Math.max(10, Math.round(area.height / 40)); // 27px on a 1080 frame
  const lineHeight = Math.round(size * 1.3);
  const left = area.x + size;
  const right = area.x + area.width - size;
  const top = area.y + size;
  const bottom = area.y + area.height - size;

  context.save();
  context.font = `${size}px ui-monospace, Consolas, monospace`;
  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  context.shadowColor = 'rgba(0, 0, 0, 0.8)'; // readable over a white sky or a black floor
  context.shadowBlur = size / 4;

  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillText(text.topLeft, left, top);
  context.textAlign = 'right';
  context.fillText(text.topRight, right, top);

  context.textBaseline = 'bottom';
  context.fillText(text.bottomRight, right, bottom);
  context.textAlign = 'left';
  const lines = text.bottomLeft;
  lines.forEach((line, i) =>
    context.fillText(line, left, bottom - (lines.length - 1 - i) * lineHeight),
  );
  context.restore();
}

export interface BurnInLayer {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Redraws over the picture (`area`, in CSS pixels). `text` is only asked for when it's shown. */
  draw(area: Rect, text: () => BurnIn | null): void;
}

/** A see-through 2D canvas over the viewport, for the burn-in. Remembers if it was on. */
export function createBurnInLayer(container: HTMLElement): BurnInLayer {
  const canvas = document.createElement('canvas');
  canvas.className = 'burn-in-layer';
  container.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error("This browser can't draw 2D text on a canvas");

  let visible = load();

  return {
    get visible() {
      return visible;
    },
    setVisible(on) {
      visible = on;
      save(on);
    },
    draw(area, text) {
      // Draw at the screen's real resolution, so the text is sharp on hi-DPI screens
      const ratio = window.devicePixelRatio;
      const width = Math.round(container.clientWidth * ratio);
      const height = Math.round(container.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);

      const burnIn = visible ? text() : null;
      if (!burnIn) return;
      const scaled = {
        x: area.x * ratio,
        y: area.y * ratio,
        width: area.width * ratio,
        height: area.height * ratio,
      };
      drawBurnIn(context, burnIn, scaled);
    },
  };
}

// Like the sidebar layout: storage may be blocked, and that must never break anything
function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function save(visible: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(visible));
  } catch {
    // Not remembered, but still works
  }
}
