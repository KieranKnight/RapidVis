import type { PerspectiveCamera } from 'three';
import { createMenu } from './menu';
import { keepFocus } from './dom';

// A 16px film camera, and an 11px chevron pointing up (the menu opens upward, off the timeline)
const CAMERA_ICON =
  '<svg class="camera-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>';
const CHEVRON =
  '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5l3-3 3 3"/></svg>';

export interface CameraSelect {
  setCameras(cameras: PerspectiveCamera[]): void;
}

/** The timeline's camera button: which camera the viewport looks through. */
export function createCameraSelect(
  root: HTMLElement,
  onSelect: (camera: PerspectiveCamera | null) => void,
): CameraSelect {
  const box = document.createElement('div');
  box.className = 'camera-picker'; // holds the menu
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'camera-button';
  button.title = 'View through camera';
  const name = document.createElement('span');
  button.insertAdjacentHTML('afterbegin', CAMERA_ICON);
  button.append(name);
  button.insertAdjacentHTML('beforeend', CHEVRON);
  keepFocus(button);
  box.append(button);
  root.append(box);

  let cameras: PerspectiveCamera[] = [];
  let current: PerspectiveCamera | null = null;

  const choose = (camera: PerspectiveCamera | null) => {
    current = camera;
    name.textContent = camera ? camera.name || 'Camera' : 'Free camera';
    onSelect(camera);
  };

  createMenu(
    button,
    () => [
      { kind: 'action', label: 'Free camera', checked: current === null, run: () => choose(null) },
      ...cameras.map((camera, i) => ({
        kind: 'action' as const,
        label: camera.name || `Camera ${i + 1}`,
        checked: camera === current,
        run: () => choose(camera),
      })),
    ],
    { label: 'Camera', placement: 'above' },
  );
  choose(null);

  return {
    setCameras(next) {
      cameras = next;
      choose(next[0] ?? null); // reviewers want the shot's view, so start on the first shot camera
    },
  };
}
