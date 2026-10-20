import { Group, Mesh, Object3D, PerspectiveCamera, PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry } from './registry';

function named<T extends Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

function makeShot() {
  const root = named(new Group(), 'Scene');
  const props = named(new Group(), 'props');
  const camera = named(new PerspectiveCamera(), 'shotCam');
  props.add(named(new Mesh(), 'cube'), named(new Mesh(), 'cube_big'));
  root.add(props, camera, named(new PointLight(), 'Key_Light')); // as three.js names "Key Light"
  return { root, camera };
}

describe('SceneRegistry', () => {
  it('lists nodes depth-first with type and depth', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect(registry.nodes.map((n) => [n.id, n.type, n.depth])).toEqual([
      ['props', 'group', 0],
      ['cube', 'mesh', 1],
      ['cube_big', 'mesh', 1],
      ['shotCam', 'camera', 0],
      ['Key_Light', 'light', 0],
    ]);
  });

  it('uses DCC names from the manifest, matching sanitized glTF names', () => {
    const registry = new SceneRegistry(makeShot().root, { 'Key Light': 'Key Light' });
    expect(registry.find('key light')).toMatchObject({ ok: { id: 'Key Light' } });
  });

  it('finds names case-insensitively', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect(registry.find('SHOTCAM')).toMatchObject({ ok: { id: 'shotCam' } });
  });

  it('prefers an exact match over a prefix match', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect(registry.find('cube')).toMatchObject({ ok: { id: 'cube' } });
  });

  it('accepts a unique prefix', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect(registry.find('shot')).toMatchObject({ ok: { id: 'shotCam' } });
  });

  it('reports ambiguous prefixes with candidates', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect(registry.find('cu')).toEqual({
      error: '"cu" matches 2 objects',
      candidates: ['cube', 'cube_big'],
    });
  });

  it('reports unknown names', () => {
    const registry = new SceneRegistry(makeShot().root);
    expect('error' in registry.find('tree')).toBe(true);
  });

  it('gives duplicate names Blender-style suffixes', () => {
    const root = new Group();
    root.add(new Group(), new Group());
    const registry = new SceneRegistry(root);
    expect(registry.nodes.map((n) => n.id)).toEqual(['group', 'group.001']);
  });

  it('maps internal children to their registered ancestor', () => {
    const { root, camera } = makeShot();
    const gizmo = new Object3D();
    gizmo.userData.rvInternal = true;
    camera.add(gizmo);
    const registry = new SceneRegistry(root);
    expect(registry.nodes.some((n) => n.object === gizmo)).toBe(false);
    expect(registry.nodeFor(gizmo)?.id).toBe('shotCam');
  });

  it('lists real children of cameras', () => {
    const { root, camera } = makeShot();
    camera.add(named(new Mesh(), 'lens_flare'));
    const registry = new SceneRegistry(root);
    expect(registry.find('lens_flare')).toMatchObject({ ok: { id: 'lens_flare', depth: 1 } });
  });

  it('remembers where each object was when the shot loaded', () => {
    const { root, camera } = makeShot();
    camera.position.set(1, 2, 3);
    const registry = new SceneRegistry(root);
    camera.position.set(9, 9, 9); // moving it later (e.g. by animation) does not change rest
    expect(registry.find('shotCam')).toMatchObject({
      ok: { rest: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
    });
  });
});
