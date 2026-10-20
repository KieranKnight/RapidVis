import { Group, Mesh, Object3D, PerspectiveCamera, PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry } from '../registry';
import { parseCommand } from './parse';

function named<T extends Object3D>(object: T, name: string): T {
  object.name = name;
  return object;
}

const root = new Group();
root.add(
  named(new Mesh(), 'cube'),
  named(new Mesh(), 'cube_big'),
  named(new PerspectiveCamera(), 'shotCam'),
  named(new PointLight(), 'Key Light'),
);
const registry = new SceneRegistry(root);
const parse = (text: string) => parseCommand(text, (query) => registry.find(query));

describe('parseCommand', () => {
  it('parses retime, using the real node id', () => {
    expect(parse('retime shot 1.5')).toEqual({
      ok: { verb: 'retime', target: 'shotCam', factor: 1.5 },
    });
  });

  it('ignores case and extra spaces', () => {
    expect(parse('  RETIME   CUBE   2 ')).toEqual({
      ok: { verb: 'retime', target: 'cube', factor: 2 },
    });
  });

  it('accepts quoted names with spaces', () => {
    expect(parse('retime "Key Light" .5')).toMatchObject({
      ok: { target: 'Key Light', factor: 0.5 },
    });
  });

  it('rejects empty input', () => {
    expect(parse('   ')).toHaveProperty('error');
  });

  it('rejects unknown verbs, even ones hiding on Object.prototype', () => {
    expect(parse('speedup cube 2')).toEqual({
      error: expect.stringMatching(/^Unknown command "speedup"\. Commands: retime, offset, /),
    });

    expect(parse('toString cube 2')).toHaveProperty('error');
  });

  it('shows usage when the argument count is wrong', () => {
    expect(parse('retime cube')).toEqual({ error: 'Usage: retime <object> <factor>' });
    expect(parse('retime cube 2 3')).toEqual({ error: 'Usage: retime <object> <factor>' });
  });

  it('lists the candidates for an ambiguous name', () => {
    expect(parse('retime cu 2')).toEqual({ error: '"cu" matches 2 objects: cube, cube_big' });
  });

  it('rejects unknown objects', () => {
    expect(parse('retime boat 2')).toEqual({ error: 'No object named "boat"' });
  });

  it.each(['0', '-1', 'abc', '1.5x', '0x10', '1e3'])('rejects the factor %s', (factor) => {
    expect(parse(`retime cube ${factor}`)).toHaveProperty('error');
  });

  it('rejects an unclosed quote', () => {
    expect(parse('retime "Key Light 2')).toEqual({ error: 'Missing a closing quote (")' });
  });

  it('parses offset, including negative and fractional frames', () => {
    expect(parse('offset cube -12.5')).toEqual({
      ok: { verb: 'offset', target: 'cube', frames: -12.5 },
    });
  });

  it('rejects an offset that is not a number', () => {
    expect(parse('offset cube soon')).toHaveProperty('error');
  });

  it('parses trim, which has no object', () => {
    expect(parse('trim 10 50')).toEqual({ ok: { verb: 'trim', start: 10, end: 50 } });
  });

  it.each(['trim 10', 'trim 10.5 50', 'trim 50 10', 'trim 10 10', 'trim a b'])(
    'rejects %s',
    (text) => {
      expect(parse(text)).toHaveProperty('error');
    },
  );

  it('parses move-all, rotate-all and scale-all with x y z in Blender axes', () => {
    expect(parse('move-all cube 0 0 2')).toEqual({
      ok: { verb: 'move-all', target: 'cube', by: [0, 0, 2] },
    });
    expect(parse('rotate-all shot 0 0 -90')).toEqual({
      ok: { verb: 'rotate-all', target: 'shotCam', by: [0, 0, -90] },
    });
    expect(parse('scale-all cube 2 2 0.5')).toEqual({
      ok: { verb: 'scale-all', target: 'cube', by: [2, 2, 0.5] },
    });
  });

  it('shows usage when x, y or z is missing', () => {
    expect(parse('move-all cube 1 2')).toEqual({ error: 'Usage: move-all <object> <x> <y> <z>' });
  });

  it.each(['move-all cube 1 up 3', 'scale-all cube 1 0 1'])('rejects %s', (text) => {
    expect(parse(text)).toHaveProperty('error');
  });
  it('parses hide and show, which take just an object', () => {
    expect(parse('hide cube')).toEqual({ ok: { verb: 'hide', target: 'cube' } });
    expect(parse('show "Key Light"')).toEqual({ ok: { verb: 'show', target: 'Key Light' } });
    expect(parse('hide')).toEqual({ error: 'Usage: hide <object>' });
  });
});
