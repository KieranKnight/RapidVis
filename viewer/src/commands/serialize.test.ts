import { Group, Mesh, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry } from '../registry';
import type { LogEntry } from './log';
import { parseCommand } from './parse';
import { editsFile, readEdits } from './serialize';

function named<T extends Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

const root = new Group();
root.add(named(new Mesh(), 'cube'), named(new Mesh(), 'big rock'));
const registry = new SceneRegistry(root);
const parse = (text: string) => parseCommand(text, (query) => registry.find(query), 1);

const entries: LogEntry[] = [
  { command: { verb: 'retime', target: 'cube', factor: 2 }, muted: false },
  { command: { verb: 'move-key', target: 'big rock', by: [0, 0, 1], frame: 24 }, muted: true },
];
const source = { dcc: 'blender', file: 'sh010.blend' };

describe('editsFile', () => {
  it('saves each command as structured data, marking the muted ones', () => {
    expect(editsFile('sh010', source, entries)).toEqual({
      version: 1,
      shot: 'sh010',
      source,
      commands: [
        { verb: 'retime', target: 'cube', factor: 2 },
        { verb: 'move-key', target: 'big rock', by: [0, 0, 1], frame: 24, muted: true },
      ],
    });
  });
});

describe('readEdits', () => {
  it('reads back exactly what was saved', () => {
    const text = JSON.stringify(editsFile('sh010', source, entries));
    expect(readEdits(text, parse)).toEqual({ ok: { shot: 'sh010', entries, skipped: [] } });
  });

  it('skips commands that would not be allowed if typed, and says why', () => {
    const text = JSON.stringify({
      version: 1,
      shot: 'sh010',
      commands: [
        { verb: 'retime', target: 'cube', factor: 2 },
        { verb: 'retime', target: 'ghost', factor: 2 }, // not in this shot
        { verb: 'retime', target: 'cube', factor: -1 }, // not a valid factor
        { verb: 'explode', target: 'cube' }, // not a command at all
      ],
    });
    const result = readEdits(text, parse);
    expect('ok' in result && result.ok.entries.map((e) => e.command)).toEqual([
      { verb: 'retime', target: 'cube', factor: 2 },
    ]);
    expect('ok' in result && result.ok.skipped).toHaveLength(3);
    expect('ok' in result && result.ok.skipped[2]).toBe('command 4: not a command');
  });

  it('turns away files that are not edits files', () => {
    expect(readEdits('not json', parse)).toEqual({
      error: "This isn't an edits file (it isn't JSON)",
    });
    expect(readEdits('{"version": 1}', parse)).toEqual({
      error: "This isn't an edits file (it has no commands)",
    });
    expect(readEdits('{"version": 2, "commands": []}', parse)).toEqual({
      error: 'Unknown edits file version: 2',
    });
  });
});
