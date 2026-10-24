import { isVerb } from './definitions';
import { formatCommand } from './format';
import type { LogEntry } from './log';
import type { Command, ParseResult } from './parse';

export const EDITS_VERSION = 1;

/** A command as it's saved: Command's own fields, plus `muted` when it's switched off */
export type SavedCommand = Command & { muted?: true };

/** A .rvedits.json file. */
export interface EditsFile {
  version: number;
  shot: string; // the .glbs name
  source: { dcc: string; file: string }; // where the shot came from e.g 'blender'
  commands: SavedCommand[];
}

export interface LoadedEdits {
  shot: string;
  entries: LogEntry[];
  skipped: string[]; // Why each command that couldn't be read was left out
}

export function editsFile(
  shot: string,
  source: EditsFile['source'],
  entries: readonly LogEntry[],
): EditsFile {
  return {
    version: EDITS_VERSION,
    shot,
    source,
    commands: entries.map(({ command, muted }) => (muted ? { ...command, muted: true } : command)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a saved edits file. Each command is checked by turning it back into text and parsing
 * that with `parse`, the same parser the command bar uses: a loaded command has to follow exactly
 * the rules a types one does, including nameing an object that's in this shot.
 */
export function readEdits(
  text: string,
  parse: (text: string) => ParseResult,
): { ok: LoadedEdits } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "This isn't an edits file (it isn't JSON)" };
  }
  if (!isRecord(data) || !Array.isArray(data.commands)) {
    return { error: "This isn't an edits file (it has no commands)" };
  }
  if (data.version !== EDITS_VERSION) {
    return { error: `Unknown edits file version: ${String(data.version)}` };
  }

  const entries: LogEntry[] = [];
  const skipped: string[] = [];
  data.commands.forEach((raw, i) => {
    const parsed = reparse(raw, parse);
    if ('error' in parsed) skipped.push(`command ${i + 1}: ${parsed.error}`);
    else entries.push({ command: parsed.ok, muted: isRecord(raw) && raw.muted === true });
  });
  return { ok: { shot: typeof data.shot === 'string' ? data.shot : '', entries, skipped } };
}

function reparse(raw: unknown, parse: (text: string) => ParseResult): ParseResult {
  if (!isRecord(raw) || typeof raw.verb !== 'string' || !isVerb(raw.verb)) {
    return { error: 'not a command' };
  }
  try {
    // A malformed command formats to nonsense (or throws), which the parser then rejects
    return parse(formatCommand(raw as Command));
  } catch {
    return { error: `this ${raw.verb} is missing something` };
  }
}
