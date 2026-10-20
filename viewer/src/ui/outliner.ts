import { ancestorIds, descendantIds, parentIds, visibleNodes } from '../outlinerTree';
import type { NodeType, SceneNode, SceneRegistry } from '../registry';
import type { Selection } from '../selection';

const ICONS: Record<NodeType, string> = {
  mesh: '🔷',
  camera: '🎥',
  light: '💡',
  group: '📁',
};

export interface Outliner {
  setRegistry(registry: SceneRegistry | null): void;
  setHidden(ids: readonly string[]): void;
}

export function createOutliner(root: HTMLElement, selection: Selection): Outliner {
  const list = document.createElement('div');
  list.className = 'outliner-list';
  root.append(list);

  let nodes: SceneNode[] = [];
  let parents = new Set<string>();
  const collapsed = new Set<string>();
  const rows = new Map<string, HTMLElement>();

  let hidden = new Set<string>();

  /** Hidden itself, or inside a hidden group. */
  function isHidden(id: string): boolean {
    return hidden.has(id) || ancestorIds(nodes, id).some((ancestor) => hidden.has(ancestor));
  }

  function toggle(node: SceneNode, wholeBranch: boolean) {
    const collapse = !collapsed.has(node.id);
    const ids = wholeBranch ? [node.id, ...descendantIds(nodes, node.id)] : [node.id];
    for (const id of ids) {
      if (!parents.has(id)) continue; // only rows with children can collapse
      if (collapse) collapsed.add(id);
      else collapsed.delete(id);
    }
    renderRows();
  }

  function createRow(node: SceneNode): HTMLElement {
    const row = document.createElement('div');
    row.className = 'outliner-row';
    row.style.paddingLeft = `${4 + node.depth * 16}px`;
    row.title = `${node.type}: ${node.id}${hidden.has(node.id) ? ' (hidden)' : ''}`;
    row.classList.toggle('hidden-node', isHidden(node.id));

    const arrow = document.createElement('span');
    arrow.className = 'outliner-arrow';
    if (parents.has(node.id)) {
      arrow.textContent = collapsed.has(node.id) ? '▸' : '▾';
      arrow.title = 'Collapse / expand (Shift+click: whole branch)';
      arrow.addEventListener('click', (event) => {
        event.stopPropagation(); // don't also select the row
        toggle(node, event.shiftKey);
      });
    }

    const label = document.createElement('span');
    label.textContent = `${ICONS[node.type]} ${node.id}`;

    row.append(arrow, label);
    row.addEventListener('click', () => selection.select(node));
    return row;
  }

  function renderRows() {
    rows.clear();
    const elements = visibleNodes(nodes, collapsed).map((node) => {
      const row = createRow(node);
      rows.set(node.id, row);
      return row;
    });
    list.replaceChildren(...elements);
    renderSelection();
  }

  function renderSelection() {
    const selectedId = selection.selected?.id;
    for (const [id, row] of rows) row.classList.toggle('selected', id === selectedId);
    if (selectedId) rows.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }

  selection.onChange(() => {
    // Selecting something inside a collapsed group (e.g. from the viewport) unfolds its parents
    const selected = selection.selected;
    const folded = selected
      ? ancestorIds(nodes, selected.id).filter((id) => collapsed.has(id))
      : [];
    if (folded.length > 0) {
      folded.forEach((id) => collapsed.delete(id));
      renderRows(); // also re-applies the selection highlight
    } else {
      renderSelection();
    }
  });

  return {
    setRegistry(registry) {
      nodes = registry?.nodes ?? [];
      parents = parentIds(nodes);
      collapsed.clear();
      renderRows();
    },
    setHidden(ids) {
      hidden = new Set(ids);
      renderRows();
    },
  };
}
