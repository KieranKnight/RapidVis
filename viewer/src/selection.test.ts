import { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { SceneNode } from './registry';
import { Selection } from './selection';

const node: SceneNode = {
  id: 'cube',
  gltfName: 'cube',
  type: 'mesh',
  depth: 0,
  object: new Mesh(),
  rest: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  restSettings: {},
};

describe('Selection', () => {
  it('notifies listeners when the selection changes', () => {
    const selection = new Selection();
    const listener = vi.fn();
    selection.onChange(listener);
    selection.select(node);
    expect(selection.selected).toBe(node);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when re-selecting the same node', () => {
    const selection = new Selection();
    selection.select(node);
    const listener = vi.fn();
    selection.onChange(listener);
    selection.select(node);
    expect(listener).not.toHaveBeenCalled();
  });
});
