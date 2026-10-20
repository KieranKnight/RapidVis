import type { Vec3 } from '../axes';
import type { FindResult } from '../registry';

/** A command that has been checked and is ready to apply. `target` is always a real node id. */
export type Command =
  | { verb: 'retime'; target: string; factor: number }
  | { verb: 'offset'; target: string; frames: number }
  | { verb: 'trim'; start: number; end: number }
  // x y z in Blender axes: metres, degrees, or scale factors
  | { verb: 'move-all'; target: string; by: Vec3 }
  | { verb: 'rotate-all'; target: string; by: Vec3 }
  | { verb: 'scale-all'; target: string; by: Vec3 };

export type ParseResult = { ok: Command } | { error: string };

/** How the parser looks up objects. In the app this is `registry.find`; tests can pass anything. */
export type FindNode = (query: string) => FindResult;

const USAGE = {
  retime: 'retime <object> <factor>',
  offset: 'offset <object> <frames>',
  trim: 'trim <start> <end>',
  'move-all': 'move-all <object> <x> <y> <z>',
  'rotate-all': 'rotate-all <object> <x°> <y°> <z°>',
  'scale-all': 'scale-all <object> <x> <y> <z>',
};

type Verb = keyof typeof USAGE;

function isVerb(word: string): word is Verb {
  return Object.hasOwn(USAGE, word); // not `in`: 'toString' in USAGE is true!
}

/** Splits on spaces, but keeps "quoted names" together: retime "Key Light" 2 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/"([^"]*)"|(\S+)/g)) tokens.push(match[1] ?? match[2]);
  return tokens;
}

/** Plain decimal numbers only, so "0x10", "1e3" and "" aren't silently accepted. */
function parseNumber(token: string): number | null {
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(token) ? Number(token) : null;
}

/** Three numbers, or null if any of them is not a number. */
function parseVec3(tokens: string[]): Vec3 | null {
  const [x, y, z] = tokens.map(parseNumber);
  return x === null || y === null || z === null ? null : [x, y, z];
}

function describeFindError(result: { error: string; candidates: string[] }): string {
  if (result.candidates.length === 0) return result.error;
  return `${result.error}: ${result.candidates.join(', ')}`;
}

export function parseCommand(text: string, findNode: FindNode): ParseResult {
  if ((text.match(/"/g) ?? []).length % 2 === 1) return { error: 'Missing a closing quote (")' };

  const [word, ...args] = tokenize(text);
  if (!word) return { error: 'Type a command, e.g. retime cube 1.5' };

  const verb = word.toLowerCase();
  if (!isVerb(verb)) {
    return { error: `Unknown command "${word}". Commands: ${Object.keys(USAGE).join(', ')}` };
  }
  const usage = `Usage: ${USAGE[verb]}`;
  const expected = USAGE[verb].split(' ').length - 1; // one argument per <placeholder>
  if (args.length !== expected) return { error: usage };

  switch (verb) {
    case 'retime': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const factor = parseNumber(args[1]);
      if (factor === null || factor <= 0) {
        return { error: `The factor must be a number above 0. ${usage}` };
      }
      return { ok: { verb, target: found.ok.id, factor } };
    }
    case 'offset': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const frames = parseNumber(args[1]);
      if (frames === null) return { error: `The offset must be a number of frames. ${usage}` };
      return { ok: { verb, target: found.ok.id, frames } };
    }
    case 'trim': {
      const [start, end] = args.map(parseNumber);
      if (start === null || end === null || !Number.isInteger(start) || !Number.isInteger(end)) {
        return { error: `Start and end must be whole frame numbers. ${usage}` };
      }
      if (start >= end) return { error: `The start frame must be before the end frame. ${usage}` };
      return { ok: { verb, start, end } };
    }
    case 'move-all':
    case 'rotate-all':
    case 'scale-all': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const by = parseVec3(args.slice(1));
      if (!by) return { error: `x, y and z must be numbers. ${usage}` };
      if (verb === 'scale-all' && by.includes(0)) {
        return { error: `A scale of 0 would squash it flat. ${usage}` };
      }
      return { ok: { verb, target: found.ok.id, by } };
    }
  }
}
