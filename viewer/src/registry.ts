import { Camera, Light, Mesh, PerspectiveCamera, PropertyBinding, type Object3D } from 'three';

export type NodeType = 'mesh' | 'camera' | 'light' | 'group';

/** Where an object was when the shot loaded, as plain arrays (glTF axes). */
export interface RestPose {
  position: number[];
  quaternion: number[];
  scale: number[];
}

/** A light's or camera's settings when the shot loaded (empty for everything else). */
export interface RestSettings {
  intensity?: number;
  color?: string; // '#rrggbb'
  fov?: number; // vertical field of view in degrees (perspective cameras)
}

export interface SceneNode {
  id: string; // The name commands use: The dcc name when the manifest has one
  gltfName: string;
  type: NodeType;
  depth: number;
  object: Object3D;
  rest: RestPose;
  restSettings: RestSettings;
}

export type FindResult = { ok: SceneNode } | { error: string; candidates: string[] };

function restSettings(object: Object3D): RestSettings {
  if (object instanceof Light) {
    return { intensity: object.intensity, color: `#${object.color.getHexString()}` };
  }
  if (object instanceof PerspectiveCamera) return { fov: object.fov };

  return {};
}

function nodeType(object: Object3D): NodeType {
  if (object instanceof Camera) return 'camera';
  if (object instanceof Light) return 'light';
  if (object instanceof Mesh) return 'mesh';
  return 'group';
}

/** Helper objects that aren't scene items: our gizmos, and spot/sun light aim targets. */
function isInternal(parent: Object3D, child: Object3D): boolean {
  if (child.userData.rvInternal === true) return true;
  return 'target' in parent && parent.target === child;
}

export class SceneRegistry {
  readonly nodes: SceneNode[] = [];
  private readonly byObject = new Map<Object3D, SceneNode>();

  constructor(root: Object3D, dccNames: Record<string, string> = {}) {
    // three.js sanitizes names on load ("Key Light" -> "Key_Light"), so match the manifest the same way
    const nameMap = new Map(
      Object.entries(dccNames).map(([gltfName, dccName]) => [
        PropertyBinding.sanitizeNodeName(gltfName),
        dccName,
      ]),
    );
    const usedIds = new Set<string>();
    const visit = (object: Object3D, depth: number) => {
      const base = nameMap.get(object.name) ?? (object.name || nodeType(object));
      let id = base;
      for (let n = 1; usedIds.has(id); n++) id = `${base}.${String(n).padStart(3, '0')}`;
      usedIds.add(id);

      const rest: RestPose = {
        position: object.position.toArray(),
        quaternion: object.quaternion.toArray(),
        scale: object.scale.toArray(),
      };
      const node: SceneNode = {
        id,
        gltfName: object.name,
        type: nodeType(object),
        depth,
        object,
        rest,
        restSettings: restSettings(object),
      };

      this.nodes.push(node);
      this.byObject.set(object, node);

      // Cameras and lights can carry internal children (e.g. a spot light's target), which aren't scene items
      for (const child of object.children) {
        if (!isInternal(object, child)) visit(child, depth + 1);
      }
    };

    for (const child of root.children) visit(child, 0);
  }

  nodeFor(object: Object3D): SceneNode | null {
    let current: Object3D | null = object;
    while (current) {
      const node = this.byObject.get(current);
      if (node) return node;
      current = current.parent;
    }
    return null;
  }

  find(query: string): FindResult {
    const q = query.trim().toLowerCase();
    if (!q) return { error: 'Missing object name', candidates: [] };

    const exact = this.nodes.find((node) => node.id.toLowerCase() === q);
    if (exact) return { ok: exact };

    const matches = this.nodes.filter((node) => node.id.toLowerCase().startsWith(q));
    if (matches.length === 1) return { ok: matches[0] };
    if (matches.length > 1) {
      return {
        error: `"${query}" matches ${matches.length} objects`,
        candidates: matches.map((n) => n.id),
      };
    }

    return { error: `No object named "${query}"`, candidates: [] };
  }
}
