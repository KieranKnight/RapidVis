import type { Command } from './parse';

/** Quotes names with spaces, so the text can be typed (or parsed) again. */
function quote(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name;
}

/** Turns a command back into the text you would type for it. */
export function formatCommand(command: Command): string {
  switch (command.verb) {
    case 'retime':
      return `retime ${quote(command.target)} ${command.factor}`;
    case 'offset':
      return `offset ${quote(command.target)} ${command.frames}`;
    case 'trim':
      return `trim ${command.start} ${command.end}`;
    case 'move-all':
    case 'rotate-all':
    case 'scale-all':
      return `${command.verb} ${quote(command.target)} ${command.by.join(' ')}`;
    case 'hide':
    case 'show':
      return `${command.verb} ${quote(command.target)}`;
  }
}
