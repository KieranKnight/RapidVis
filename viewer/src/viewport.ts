import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fitAspect, type Rect } from './cameras';
import { createGizmo, GIZMO_COLOR, SELECTED_COLOR, type Gizmo } from './gizmos';

export interface Viewport {
  readonly canvas: HTMLCanvasElement;
  setShot(root: THREE.Object3D | null): void;
  setViewCamera(camera: THREE.PerspectiveCamera | null): void;
  setHighlight(object: THREE.Object3D | null): void;
  setOverlays(visible: boolean): void;
  pick(clientX: number, clientY: number): THREE.Object3D | null;
  start(onTick: (deltaSeconds: number) => void): void;
}

function disposeMaterial(material: THREE.Material) {
  // Textures live on material properties (map, normalMap, roughnessMap, ...)
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach(disposeMaterial);
    }
  });
}

/** An object is only really visible if it and all its ancestors are. */
function isVisible(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export function createViewport(container: HTMLElement): Viewport {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x111214); // letterbox bar colour
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x26282c);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

  const grid = new THREE.GridHelper(10, 10, 0x555555, 0x333333);
  scene.add(grid);

  const freeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  freeCamera.position.set(3, 2, 5);
  const controls = new OrbitControls(freeCamera, renderer.domElement);
  controls.enableDamping = true;

  let viewCamera = freeCamera;
  let shot: THREE.Object3D | null = null;

  // Selection highlight: a box around anything with geometry, axes for cameras/lights/empties
  const highlightBounds = new THREE.Box3();
  const highlightBox = new THREE.Box3Helper(highlightBounds, 0xffa040);
  const highlightAxes = new THREE.AxesHelper(0.75);
  scene.add(highlightBox, highlightAxes);
  let highlighted: THREE.Object3D | null = null;
  const gizmos = new Map<THREE.Object3D, Gizmo>(); // camera/light -> its gizmo
  let overlaysVisible = true;

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    freeCamera.aspect = width / height;
    freeCamera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  function frameObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const halfFov = THREE.MathUtils.degToRad(freeCamera.fov) / 2;
    const distance = sphere.radius / Math.sin(halfFov);
    const direction = new THREE.Vector3(1, 0.6, 1).normalize();

    freeCamera.position.copy(sphere.center).addScaledVector(direction, distance);
    freeCamera.near = distance / 100;
    freeCamera.far = distance * 100;
    freeCamera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
  }

  /** Where the current camera's picture is drawn: the full canvas, or the letterboxed rect. */
  function viewRect(): Rect {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (viewCamera === freeCamera) return { x: 0, y: 0, width, height };
    return fitAspect(width, height, viewCamera.aspect);
  }

  function updateHighlight() {
    highlightBox.visible = false;
    highlightAxes.visible = false;
    if (!highlighted || !isVisible(highlighted)) return;
    if (gizmos.has(highlighted)) return; // gizmos show selection by turning orange

    highlightBounds.setFromObject(highlighted);
    if (!highlightBounds.isEmpty()) {
      highlightBox.visible = true;
      return;
    }
    highlighted.getWorldPosition(highlightAxes.position);
    highlighted.getWorldQuaternion(highlightAxes.quaternion);
    highlightAxes.visible = true;
  }

  function updateGizmos() {
    for (const [owner, gizmo] of gizmos) {
      gizmo.visible = overlaysVisible && owner !== viewCamera; // never draw the camera you're looking through
      gizmo.material.color.set(owner === highlighted ? SELECTED_COLOR : GIZMO_COLOR);
    }
  }

  function render() {
    updateGizmos();
    updateHighlight();
    const rect = viewRect();
    renderer.setScissorTest(false);
    renderer.clear(); // whole canvas -> bar colour
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
    renderer.render(scene, viewCamera);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    canvas: renderer.domElement,

    setShot(root) {
      if (shot) {
        scene.remove(shot);
        disposeObject(shot); // also disposes the gizmos, since they're children
      }
      gizmos.clear();
      shot = root;
      highlighted = null;
      grid.visible = root === null;
      if (!root) return;

      // Size gizmos relative to the shot, so they look right whether it's a room or a city
      const bounds = new THREE.Box3().setFromObject(root);
      const size = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius * 0.06, 0.1);
      raycaster.params.Line = { threshold: size * 0.1 }; // how close a click must be to hit a line

      // Collect first, then add: don't change a tree while you're walking it
      const owners: THREE.Object3D[] = [];
      root.traverse((object) => owners.push(object));
      for (const owner of owners) {
        const gizmo = createGizmo(owner, size);
        if (gizmo) gizmos.set(owner, gizmo);
      }

      scene.add(root);
      frameObject(root);
    },
    setViewCamera(camera) {
      viewCamera = camera ?? freeCamera;
      controls.enabled = viewCamera === freeCamera;
    },

    setHighlight(object) {
      highlighted = object;
    },

    setOverlays(visible) {
      overlaysVisible = visible;
    },

    pick(clientX, clientY) {
      if (!shot) return null;
      const bounds = renderer.domElement.getBoundingClientRect();
      const rect = viewRect();

      // rect.y counts up from the bottom (WebGL); mouse y counts down from the top (browser)
      const rectTop = bounds.height - rect.y - rect.height;
      const x = clientX - bounds.left - rect.x;
      const y = clientY - bounds.top - rectTop;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null; // clicked a letterbox bar

      pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, viewCamera);
      // The raycaster ignores `visible`, so skip hidden things ourselves (gizmos when overlays are off, etc.)
      const hit = raycaster.intersectObject(shot, true).find((h) => isVisible(h.object));
      return hit ? hit.object : null;
    },

    start(onTick) {
      let lastTime = performance.now();
      renderer.setAnimationLoop((time) => {
        const deltaSeconds = (time - lastTime) / 1000;
        lastTime = time;
        onTick(deltaSeconds);
        controls.update();
        render();
      });
    },
  };
}
