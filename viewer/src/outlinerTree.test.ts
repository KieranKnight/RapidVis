import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { ancestorIds, descendantIds, parentIds, visibleNodes } from './outlinerTree';
import type { SceneNode } from './registry';

function node(id: string, depth: number): SceneNode {
  const rest = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  return { id, gltfName: id, type: 'group', depth, object: new Object3D(), rest };
}

// props
//   cube
//   rig
//     rig_arm
// shotCam
const nodes = [
  node('props', 0),
  node('cube', 1),
  node('rig', 1),
  node('rig_arm', 2),
  node('shotCam', 0),
];
const ids = (list: SceneNode[]) => list.map((n) => n.id);

describe('outliner tree', () => {
  it('shows every row when nothing is collapsed', () => {
    expect(ids(visibleNodes(nodes, new Set()))).toEqual([
      'props',
      'cube',
      'rig',
      'rig_arm',
      'shotCam',
    ]);
  });

  it('hides all descendants of a collapsed node', () => {
    expect(ids(visibleNodes(nodes, new Set(['props'])))).toEqual(['props', 'shotCam']);
  });

  it('hides only the collapsed branch when nested', () => {
    expect(ids(visibleNodes(nodes, new Set(['rig'])))).toEqual(['props', 'cube', 'rig', 'shotCam']);
  });

  it('finds which nodes have children', () => {
    expect(parentIds(nodes)).toEqual(new Set(['props', 'rig']));
  });

  it('lists ancestors nearest first', () => {
    expect(ancestorIds(nodes, 'rig_arm')).toEqual(['rig', 'props']);
    expect(ancestorIds(nodes, 'shotCam')).toEqual([]);
  });

  it('lists every descendant in a branch', () => {
    expect(descendantIds(nodes, 'props')).toEqual(['cube', 'rig', 'rig_arm']);
  });
});
