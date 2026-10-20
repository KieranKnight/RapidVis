import type { Command } from './parse';

/**
 * Every command typed, in order, plus a cursor. Commands before the cursor are applied;
 * commands after it have been undone and can be redone.
 *
 *   entries:  [retime A, retime B, retime C]
 *   position:                     ^ 2  -> A and B applied, C can be redone
 */
export class CommandLog {
  private entries: Command[] = [];
  private position = 0;
  private listeners: Array<() => void> = [];

  /** The commands that are currently applied, oldest first. */
  get applied(): readonly Command[] {
    return this.entries.slice(0, this.position);
  }

  /** Undone commands that redo would bring back, next one first. */
  get undone(): readonly Command[] {
    return this.entries.slice(this.position);
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }

  push(command: Command) {
    // A new command replaces whatever had been undone, like in any editor
    this.entries = [...this.entries.slice(0, this.position), command];
    this.position = this.entries.length;
    this.notify();
  }

  undo() {
    if (this.position === 0) return;
    this.position--;
    this.notify();
  }

  redo() {
    if (this.position === this.entries.length) return;
    this.position++;
    this.notify();
  }

  /** Jumps to just after the command at `index`. -1 means before every command: the original shot. */
  goTo(index: number) {
    const position = index + 1;
    if (position < 0 || position > this.entries.length || position === this.position) return;
    this.position = position;
    this.notify();
  }

  /** Removes one applied command from the middle of the history. */
  remove(index: number) {
    if (index < 0 || index >= this.position) return;
    this.entries = this.entries.toSpliced(index, 1);
    this.position--;
    this.notify();
  }

  clear() {
    this.entries = [];
    this.position = 0;
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
