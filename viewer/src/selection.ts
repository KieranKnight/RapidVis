import type { SceneNode } from './registry';

type Listener = () => void;

export class Selection {
  selected: SceneNode | null = null;
  private listeners: Listener[] = [];

  onChange(listener: Listener) {
    this.listeners.push(listener);
  }

  select(node: SceneNode | null) {
    if (node === this.selected) return;
    this.selected = node;
    for (const listener of this.listeners) listener();
  }
}
