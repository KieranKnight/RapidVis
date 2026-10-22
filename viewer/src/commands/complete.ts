import type { SceneNode } from '../registry';
import { COMMANDS, VERBS, isVerb, type Verb } from './definitions';
import { quote } from './format';

/** What completion needs to know about an object: a SceneNode has this, and so can a test. */
export type NodeChoice = Pick<SceneNode, 'id' | 'type'>;

export interface Suggestion {
  label: string; // what the menu shows: a command or an object name
  detail: string; // the command's usage, or the object's type
  description?: string;
  text: string; // the whole text before the cursor once this is chosen
}

/** Whether a command can be used on an object right now. In the app, this asks targetError. */
export type CanTarget<N extends NodeChoice> = (verb: Verb, node: N) => boolean;

/** The usage placeholders that mean "an object goes here". */
const OBJECT_ARGUMENTS = new Set(['<object>', '<light>', '<camera>']);

/**
 * What to suggest for the text before the cursor: commands while the first word is being typed,
 * then object names for its first argument. Empty when there's nothing useful to offer,
 * including when the word typed is already complete.
 */
export function suggest<N extends NodeChoice>(
  before: string,
  nodes: readonly N[],
  canTarget: CanTarget<N>,
): Suggestion[] {
  if (before.trim() === '') return [];
  const text = before.trimStart().replace(/^\//, ''); // the leading / is optional

  if (/^\S*$/.test(text)) return verbSuggestions(text);
  const target = /^(\S+)\s+("[^"]*|[^"\s]*)$/.exec(text); // a verb, then a name in progress
  if (target) return objectSuggestions(target[1], target[2], nodes, canTarget);
  return [];
}

function verbSuggestions(typed: string): Suggestion[] {
  const prefix = typed.toLowerCase();
  if (isVerb(prefix)) return [];
  return VERBS.filter((verb) => verb.startsWith(prefix)).map((verb) => ({
    label: verb,
    detail: COMMANDS[verb].usage,
    description: COMMANDS[verb].description,
    text: `${verb} `,
  }));
}

function objectSuggestions<N extends NodeChoice>(
  word: string,
  typed: string,
  nodes: readonly N[],
  canTarget: CanTarget<N>,
) {
  const verb = word.toLowerCase();
  if (!isVerb(verb)) return [];
  if (!OBJECT_ARGUMENTS.has(firstArgument(verb))) return []; // e.g. trim, which takes frames

  const query = typed.replace(/^"/, '').toLowerCase();
  const matches = nodes.filter(
    (node) => node.id.toLowerCase().startsWith(query) && canTarget(verb, node),
  );

  const finished = !typed.startsWith('"') && matches.some((n) => n.id.toLowerCase() === query);
  if (finished) return [];

  return matches.map((node) => ({
    label: node.id,
    detail: node.type,
    text: `${verb} ${quote(node.id)} `,
  }));
}

function firstArgument(verb: Verb): string {
  return COMMANDS[verb].usage.split(' ')[1];
}
