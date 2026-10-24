import * as THREE from 'three';

type Vec3 = [number, number, number];
type Segment = [Vec3, Vec3];

export const GIZMO_COLOR = 0xc8ccd2;
export const SELECTED_COLOR = 0xffa040;

export type Gizmo = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

/** Flatten segments to [x,y,z, x,y,z, ...]: every two points make one line. */
function flatten(segments: Segment[]): number[] {
  return segments.flatMap(([a, b]) => [...a, ...b]);
}

/** A circle as line segments. `offset` moves it along the axis the circle faces. */
function circle(radius: number, plane: 'xy' | 'xz' | 'yz', offset = 0, steps = 24): Segment[] {
  const at = (i: number): Vec3 => {
    const angle = (i / steps) * Math.PI * 2;
    const a = Math.cos(angle) * radius;
    const b = Math.sin(angle) * radius;
    if (plane === 'xy') return [a, b, offset];
    if (plane === 'xz') return [a, offset, b];
    return [offset, a, b];
  };
  const segments: Segment[] = [];
  for (let i = 0; i < steps; i++) segments.push([at(i), at(i + 1)]);
  return segments;
}

/** blender-style camera: A pyramid from the lens to a frame */
export function cameraFrustumPoints(fovDegrees: number, aspect: number, size: number): number[] {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2) * size;
  const halfWidth = halfHeight * aspect;
  const z = -size;

  const apex: Vec3 = [0, 0, 0];
  const topLeft: Vec3 = [-halfWidth, halfHeight, z];
  const topRight: Vec3 = [halfWidth, halfHeight, z];
  const bottomRight: Vec3 = [halfWidth, -halfHeight, z];
  const bottomLeft: Vec3 = [-halfWidth, -halfHeight, z];
  const upLeft: Vec3 = [-halfWidth * 0.5, halfHeight * 1.1, z];
  const upRight: Vec3 = [halfWidth * 0.5, halfHeight * 1.1, z];
  const upTip: Vec3 = [0, halfHeight * 1.6, z];

  return flatten([
    [apex, topLeft],
    [apex, topRight],
    [apex, bottomRight],
    [apex, bottomLeft],
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
    [upLeft, upRight],
    [upRight, upTip],
    [upTip, upLeft],
  ]);
}

/** Point light: three rings plus six short rays. */
export function pointLightPoints(size: number): number[] {
  const r = size * 0.25;
  const axes: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const rays = axes.map(([x, y, z]): Segment => [
    [x * r * 1.4, y * r * 1.4, z * r * 1.4],
    [x * r * 2.2, y * r * 2.2, z * r * 2.2],
  ]);
  return flatten([...circle(r, 'xy'), ...circle(r, 'xz'), ...circle(r, 'yz'), ...rays]);
}

/** Spot light: a small ring at the source and a cone along -Z. `coneAngle` is the half-angle. */
export function spotLightPoints(coneAngle: number, size: number): number[] {
  const radius = Math.tan(coneAngle) * size;
  const edges = [
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ].map(([x, y]): Segment => [
    [0, 0, 0],
    [x, y, -size],
  ]);
  return flatten([...circle(size * 0.15, 'xy'), ...circle(radius, 'xy', -size), ...edges]);
}

/** Sun: a ring plus a line showing the direction the light travels (-Z). */
export function sunLightPoints(size: number): number[] {
  return flatten([
    ...circle(size * 0.2, 'xy'),
    [
      [0, 0, 0],
      [0, 0, -size * 1.5],
    ],
  ]);
}

/** Adds a gizmo as a child of a camera or light. Returns null for anything else. */
export function createGizmo(object: THREE.Object3D, size: number): Gizmo | null {
  let points: number[];
  if (object instanceof THREE.PerspectiveCamera) {
    points = cameraFrustumPoints(object.fov, object.aspect, size);
  } else if (object instanceof THREE.SpotLight) {
    points = spotLightPoints(object.angle, size);
  } else if (object instanceof THREE.DirectionalLight) {
    points = sunLightPoints(size);
  } else if (object instanceof THREE.PointLight) {
    points = pointLightPoints(size);
  } else {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: GIZMO_COLOR, toneMapped: false });

  const gizmo = new THREE.LineSegments(geometry, material);
  gizmo.name = `${object.name}_gizmo`;
  gizmo.userData.size = size; // to reshape a camera's frustum later
  if (object instanceof THREE.PerspectiveCamera) gizmo.userData.fov = object.fov;
  gizmo.userData.rvInternal = true; // tells the registry this isn't a scene item
  object.add(gizmo);
  return gizmo;
}

/** Reshapes a camera's frustum when its lens has changed: a zoom, or a `focal` edit. */
export function updateCameraGizmo(gizmo: Gizmo, camera: THREE.PerspectiveCamera) {
  if (gizmo.userData.fov === camera.fov) return;
  gizmo.userData.fov = camera.fov;
  const position = gizmo.geometry.getAttribute('position') as THREE.BufferAttribute;
  position.array.set(cameraFrustumPoints(camera.fov, camera.aspect, gizmo.userData.size));
  position.needsUpdate = true; // send the new points to the GPU
  gizmo.geometry.computeBoundingSphere(); // so clicks still find it
}
