import { Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry } from '../registry';
import { formatCommand } from './format';
import { parseCommand, type Command } from './parse';

const root = new Group();
for (const name of ['cube', 'Key Light']) {
  const mesh = new Mesh();
  mesh.name = name;
  root.add(mesh);
}
const registry = new SceneRegistry(root);

describe('formatCommand', () => {
  it('writes a command the way you would type it', () => {
    expect(formatCommand({ verb: 'retime', target: 'cube', factor: 1.5 })).toBe('retime cube 1.5');
  });

  it('quotes names with spaces', () => {
    expect(formatCommand({ verb: 'retime', target: 'Key Light', factor: 2 })).toBe(
      'retime "Key Light" 2',
    );
  });

  it.each<Command>([
    { verb: 'retime', target: 'cube', factor: 0.25 },
    { verb: 'retime', target: 'Key Light', factor: 3 },
    { verb: 'offset', target: 'Key Light', frames: -12.5 },
    { verb: 'trim', start: 10, end: 50 },
    { verb: 'move-all', target: 'Key Light', by: [0, -1.5, 2] },
    { verb: 'rotate-all', target: 'cube', by: [90, 0, 45] },
    { verb: 'hide', target: 'Key Light' },
    { verb: 'move-key', target: 'Key Light', by: [0, 0, 1], frame: 12 },
  ])('round-trips through the parser: %o', (command) => {
    const text = formatCommand(command);
    expect(parseCommand(text, (query) => registry.find(query), 1)).toEqual({ ok: command });
  });
});
