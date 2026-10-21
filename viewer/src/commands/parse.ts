import type { Vec3 } from '../axes';
import type { FindResult } from '../registry';
import { COMMANDS, VERBS, isVerb } from './definitions';

/** A command that has been checked and is ready to apply. `target` is always a real node id. */
export type Command =
  | { verb: 'retime'; target: string; factor: number }
  | { verb: 'offset'; target: string; frames: number }
  | { verb: 'trim'; start: number; end: number }
  // x y z in Blender axes: metres, degrees, or scale factors
  | { verb: 'move-all'; target: string; by: Vec3 }
  | { verb: 'rotate-all'; target: string; by: Vec3 }
  | { verb: 'scale-all'; target: string; by: Vec3 }
  // one key, at a frame (always recorded, so replaying the log edits the same key)
  | { verb: 'move-key'; target: string; by: Vec3; frame: number }
  | { verb: 'rotate-key'; target: string; by: Vec3; frame: number }
  | { verb: 'scale-key'; target: string; by: Vec3; frame: number }
  | { verb: 'hide'; target: string }
  | { verb: 'show'; target: string }
  // lights: a brightness multiplier (1 = as loaded), and a colour as '#rrggbb'
  | { verb: 'intensity'; target: string; factor: number }
  | { verb: 'color'; target: string; color: string }
  | { verb: 'color'; target: string; color: string }
  // cameras: a focal length in millimetres, like Blender's Lens setting
  | { verb: 'focal'; target: string; mm: number };

export type ParseResult = { ok: Command } | { error: string };

/** How the parser looks up objects. In the app this is `registry.find`; tests can pass anything. */
export type FindNode = (query: string) => FindResult;

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

/** How many arguments a usage line asks for: one per <placeholder>, not counting [optional] parts. */
function argumentCount(usage: string): number {
  return (usage.replace(/\[.*?\]/g, '').match(/<[^>]+>/g) ?? []).length;
}

/** A hex colour like #ff8800 (the # is optional), as lowercase '#rrggbb'. Null if it isn't one. */
function parseHexColor(token: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(token);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function describeFindError(result: { error: string; candidates: string[] }): string {
  if (result.candidates.length === 0) return result.error;
  return `${result.error}: ${result.candidates.join(', ')}`;
}

/** `currentFrame` is the frame key commands use when no `at <frame>` is typed. */
export function parseCommand(text: string, findNode: FindNode, currentFrame: number): ParseResult {
  if ((text.match(/"/g) ?? []).length % 2 === 1) return { error: 'Missing a closing quote (")' };

  const [word, ...args] = tokenize(text.replace(/^\s*\//, '')); // the leading / is optional
  if (!word) return { error: 'Type a command, e.g. retime cube 1.5' };

  const verb = word.toLowerCase();
  if (!isVerb(verb)) {
    return { error: `Unknown command "${word}". Commands: ${VERBS.join(', ')}` };
  }
  const usage = `Usage: ${COMMANDS[verb].usage}`;
  // Key commands can end with "at <frame>"; without it they use the current frame
  let frame = currentFrame;
  if (verb.endsWith('-key') && args.at(-2)?.toLowerCase() === 'at') {
    const typed = parseNumber(args[args.length - 1]);
    if (typed === null || !Number.isInteger(typed)) {
      return { error: `The frame must be a whole number. ${usage}` };
    }
    frame = typed;
    args.splice(-2); // drop "at <frame>" so the rest is checked as usual
  }

  if (args.length !== argumentCount(COMMANDS[verb].usage)) return { error: usage };

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
    case 'move-key':
    case 'rotate-key':
    case 'scale-key': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const by = parseVec3(args.slice(1));
      if (!by) return { error: `x, y and z must be numbers. ${usage}` };
      if (verb === 'scale-key' && by.includes(0)) {
        return { error: `A scale of 0 would squash it flat. ${usage}` };
      }
      return { ok: { verb, target: found.ok.id, by, frame } };
    }
    case 'hide':
    case 'show': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      return { ok: { verb, target: found.ok.id } };
    }
    case 'intensity': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const factor = parseNumber(args[1]);
      if (factor === null || factor < 0) {
        return { error: `The factor must be a number, 0 or above. ${usage}` };
      }
      return { ok: { verb, target: found.ok.id, factor } };
    }
    case 'color': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const color = parseHexColor(args[1]);
      if (!color) return { error: `The colour must be a hex code like #ff8800. ${usage}` };
      return { ok: { verb, target: found.ok.id, color } };
    }
    case 'focal': {
      const found = findNode(args[0]);
      if ('error' in found) return { error: describeFindError(found) };
      const mm = parseNumber(args[1]);
      if (mm === null || mm <= 0) return { error: `The focal length must be above 0 mm. ${usage}` };
      return { ok: { verb, target: found.ok.id, mm } };
    }
  }
}
