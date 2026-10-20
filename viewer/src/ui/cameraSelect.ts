import type { PerspectiveCamera } from 'three';

export interface CameraSelect {
  setCameras(cameras: PerspectiveCamera[]): void;
}

export function createCameraSelect(
  root: HTMLElement,
  onSelect: (camera: PerspectiveCamera | null) => void,
): CameraSelect {
  const select = document.createElement('select');
  select.className = 'camera-select';
  select.title = 'View through camera';
  root.append(select);

  let cameras: PerspectiveCamera[] = [];

  const applySelection = () => {
    const index = Number(select.value);
    onSelect(index >= 0 ? cameras[index] : null);
  };
  select.addEventListener('change', applySelection);

  return {
    setCameras(next) {
      cameras = next;
      select.replaceChildren(
        new Option('Free camera', '-1'),
        ...next.map((camera, i) => new Option(camera.name || `Camera ${i + 1}`, String(i))),
      );
      // Reviewers want the shot's view, so default to the first shot camera
      select.value = next.length > 0 ? '0' : '-1';
      applySelection();
    },
  };
}
