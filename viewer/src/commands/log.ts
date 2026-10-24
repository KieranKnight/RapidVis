import type { Command } from './parse';

/** A command in the log. A muted one stays in the history but isn't applied. */
export interface LogEntry {
  command: Command;
  muted: boolean;
}

/**
 * Every command typed, in order, plus a cursor. Commands before the cursor are applied;
 * commands after it have been undone and can be redone.
 *
 *   entries:  [retime A, retime B, retime C]
 *   position:                     ^ 2  -> A and B applied, C can be redone
 */
export class CommandLog {
  private entries: LogEntry[] = [];

  private position = 0;
  private listeners: Array<() => void> = [];

  /** The commands that are currently applied (muted or not), oldest first. */
  get applied(): readonly Command[] {
    return this.entries.slice(0, this.position).map((entry) => entry.command);
  }

  /** Undone commands that redo would bring back, next one first. */
  get undone(): readonly Command[] {
    return this.entries.slice(this.position).map((entry) => entry.command);
  }

  /** The applied commands that aren't muted: what the scene should show. */
  get active(): readonly Command[] {
    return this.entries
      .slice(0, this.position)
      .filter((entry) => !entry.muted)
      .map((entry) => entry.command);
  }

  /** The applied commands with their muted flags: what "Save edits" writes. */
  get appliedEntries(): readonly LogEntry[] {
    return this.entries.slice(0, this.position);
  }

  isMuted(index: number): boolean {
    return this.entries[index]?.muted ?? false;
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }

  push(command: Command) {
    // A new command replaces whatever had been undone, like in any editor
    this.entries = [...this.entries.slice(0, this.position), { command, muted: false }];
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

  /**
   * Mutes an applied command, or unmutes it, to compare the shot with and without it.
   * Muting isn't an edit, so it isn't undoable: it's like flicking a switch to look.
   */
  toggleMute(index: number) {
    const entry = this.entries[index];
    if (!entry || index >= this.position) return;
    this.entries = this.entries.with(index, { ...entry, muted: !entry.muted });
    this.notify();
  }

  /** Replaces the whole history, e.g. with edits loaded from a file. Every entry ends up applied. */
  load(entries: readonly LogEntry[]) {
    this.entries = [...entries];
    this.position = this.entries.length;
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
