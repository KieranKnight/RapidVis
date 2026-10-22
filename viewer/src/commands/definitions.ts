/**
 * Every command: how to type it, and what it does. The parser checks against `usage`,
 * and the slash menu and `help` show both, so they can never disagree.
 */
export const COMMANDS = {
  retime: {
    usage: 'retime <object> <factor>',
    description: 'Plays its animation faster or slower (2 = twice as fast, 1 = as exported)',
  },
  offset: {
    usage: 'offset <object> <frames>',
    description: 'Slides its animation later (or earlier, with a minus) by some frames',
  },
  trim: {
    usage: 'trim <start> <end>',
    description: 'Sets the first and last frame of the shot',
  },
  'move-all': {
    usage: 'move-all <object> <x> <y> <z>',
    description: 'Moves it on every frame, in Blender axes and metres',
  },
  'rotate-all': {
    usage: 'rotate-all <object> <x°> <y°> <z°>',
    description: 'Rotates it on every frame, in degrees',
  },
  'scale-all': {
    usage: 'scale-all <object> <x> <y> <z>',
    description: 'Scales it on every frame (1 1 1 = as exported)',
  },
  'move-key': {
    usage: 'move-key <object> <x> <y> <z> [at <frame>]',
    description: 'Moves one key: on this frame, or the one after "at"',
  },
  'rotate-key': {
    usage: 'rotate-key <object> <x°> <y°> <z°> [at <frame>]',
    description: 'Rotates one key: on this frame, or the one after "at"',
  },
  'scale-key': {
    usage: 'scale-key <object> <x> <y> <z> [at <frame>]',
    description: 'Scales one key: on this frame, or the one after "at"',
  },
  hide: {
    usage: 'hide <object>',
    description: 'Hides it, and everything parented to it',
  },
  show: {
    usage: 'show <object>',
    description: 'Shows it again',
  },
  intensity: {
    usage: 'intensity <light> <factor>',
    description: 'Makes a light brighter or dimmer (2 = twice as bright, 0 = off)',
  },
  color: {
    usage: 'color <light> <#rrggbb>',
    description: "Sets a light's colour",
  },
  focal: {
    usage: 'focal <camera> <mm>',
    description: "Sets a camera's lens, in millimetres",
  },
};

export type Verb = keyof typeof COMMANDS;

export const VERBS = Object.keys(COMMANDS) as Verb[];

export function isVerb(word: string): word is Verb {
  return Object.hasOwn(COMMANDS, word); // not `in`: 'toString' in COMMANDS is true!
}

/** The answer to `help` or `help <command>`, or null when the text isn't asking for help. */
export function helpFor(text: string): string | null {
  const [word, verb] = text.trim().replace(/^\//, '').split(/\s+/);
  if (word.toLowerCase() !== 'help') return null;
  if (!verb) return `Commands: ${VERBS.join(', ')}. Type / to browse them, or help <command>`;
  const wanted = verb.toLowerCase();
  if (!isVerb(wanted)) return `Unknown command "${verb}". Commands: ${VERBS.join(', ')}`;
  return `${COMMANDS[wanted].usage}: ${COMMANDS[wanted].description}`;
}
