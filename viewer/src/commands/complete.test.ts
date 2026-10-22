import { describe, expect, it } from 'vitest';
import { suggest, type NodeChoice } from './complete';
import { helpFor, type Verb } from './definitions';

const nodes: NodeChoice[] = [
  { id: 'cube', type: 'mesh' },
  { id: 'cube_big', type: 'mesh' },
  { id: 'shotCam', type: 'camera' },
  { id: 'Key Light', type: 'light' },
];

/** A stand-in for the real rules (targetError): light commands take lights, focal takes cameras. */
function canTarget(verb: Verb, node: NodeChoice): boolean {
  if (verb === 'intensity' || verb === 'color') return node.type === 'light';
  if (verb === 'focal') return node.type === 'camera';
  return true;
}

/** Just the labels, so each test reads in one line. */
const labels = (before: string) => suggest(before, nodes, canTarget).map((s) => s.label);

describe('suggest: commands', () => {
  it('lists every command after a lone /', () => {
    expect(labels('/')).toHaveLength(14);
  });

  it('filters by what has been typed, with or without the /', () => {
    expect(labels('/re')).toEqual(['retime']);
    expect(labels('ro')).toEqual(['rotate-all', 'rotate-key']);
  });

  it('shows usage and description from the command table, and fills in the verb', () => {
    expect(suggest('/foc', nodes, canTarget)).toEqual([
      {
        label: 'focal',
        detail: 'focal <camera> <mm>',
        description: "Sets a camera's lens, in millimetres",
        text: 'focal ',
      },
    ]);
  });

  it('offers nothing for an empty bar, or a command that is already complete', () => {
    expect(labels('')).toEqual([]);
    expect(labels('retime')).toEqual([]);
  });
});

describe('suggest: objects', () => {
  it('lists objects once the command is typed', () => {
    expect(labels('hide ')).toEqual(['cube', 'cube_big', 'shotCam', 'Key Light']);
    expect(labels('hide cu')).toEqual(['cube', 'cube_big']);
  });

  it('only offers lights to light commands, and cameras to focal', () => {
    expect(labels('intensity ')).toEqual(['Key Light']);
    expect(labels('/focal ')).toEqual(['shotCam']);
  });

  it('quotes names with spaces when filling them in', () => {
    expect(suggest('color k', nodes, canTarget)[0].text).toBe('color "Key Light" ');
    expect(labels('color "Key L')).toEqual(['Key Light']);
  });

  it('stops once the name is finished, or for arguments that are not objects', () => {
    expect(labels('hide cube')).toEqual([]);
    expect(labels('retime cube ')).toEqual([]);
    expect(labels('trim ')).toEqual([]);
  });
});

describe('helpFor', () => {
  it('lists the commands for a plain help', () => {
    expect(helpFor('help')).toMatch(/^Commands: retime, offset, trim, /);
  });

  it('explains one command, from the same table the menu uses', () => {
    expect(helpFor('/help focal')).toBe(
      "focal <camera> <mm>: Sets a camera's lens, in millimetres",
    );
    expect(helpFor('help nope')).toMatch(/^Unknown command "nope"/);
  });

  it('ignores anything that is not a help request', () => {
    expect(helpFor('hide cube')).toBeNull();
  });
});
