import type { SceneNode } from './registry';

/** The rows to show: everything except descendants of collapsed nodes. Nodes must be depth-first. */
export function visibleNodes(nodes: SceneNode[], collapsed: ReadonlySet<string>): SceneNode[] {
  const visible: SceneNode[] = [];
  let hiddenBelow = Infinity; // rows deeper than this are inside a collapsed node

  for (const node of nodes) {
    if (node.depth > hiddenBelow) continue;
    hiddenBelow = Infinity;
    visible.push(node);
    if (collapsed.has(node.id)) hiddenBelow = node.depth;
  }
  return visible;
}

/** Ids of nodes that have children (the next node in depth-first order is deeper). */
export function parentIds(nodes: SceneNode[]): Set<string> {
  const ids = new Set<string>();
  nodes.forEach((node, i) => {
    const next = nodes[i + 1];
    if (next && next.depth > node.depth) ids.add(node.id);
  });
  return ids;
}

/** Ancestors of a node, nearest first */
export function ancestorIds(nodes: SceneNode[], id: string): string[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) return [];

  const ancestors: string[] = [];
  let depth = nodes[index].depth;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    if (nodes[i].depth < depth) {
      ancestors.push(nodes[i].id);
      depth = nodes[i].depth;
    }
  }
  return ancestors;
}

/** Every node inside a node's branch. */
export function descendantIds(nodes: SceneNode[], id: string): string[] {
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) return [];

  const ids: string[] = [];
  for (let i = index + 1; i < nodes.length && nodes[i].depth > nodes[index].depth; i++) {
    ids.push(nodes[i].id);
  }
  return ids;
}
