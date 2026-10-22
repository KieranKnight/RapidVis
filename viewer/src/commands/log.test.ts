import { describe, expect, it, vi } from 'vitest';
import { CommandLog } from './log';
import type { Command } from './parse';

const retime = (target: string): Command => ({ verb: 'retime', target, factor: 2 });
const targets = (commands: readonly Command[]) =>
  commands.map((c) => ('target' in c ? c.target : c.verb));

function logWith(...names: string[]) {
  const log = new CommandLog();
  for (const name of names) log.push(retime(name));
  return log;
}

describe('CommandLog', () => {
  it('starts empty', () => {
    const log = new CommandLog();
    expect(log.applied).toEqual([]);
    expect(log.undone).toEqual([]);
  });

  it('undo and redo move commands between applied and undone', () => {
    const log = logWith('a', 'b', 'c');
    log.undo();
    log.undo();
    expect(targets(log.applied)).toEqual(['a']);
    expect(targets(log.undone)).toEqual(['b', 'c']);
    log.redo();
    expect(targets(log.applied)).toEqual(['a', 'b']);
  });

  it('ignores undo and redo when there is nothing to do', () => {
    const log = logWith('a');
    log.redo();
    log.undo();
    log.undo();
    expect(log.applied).toEqual([]);
    expect(targets(log.undone)).toEqual(['a']);
  });

  it('a new command throws away the undone ones', () => {
    const log = logWith('a', 'b');
    log.undo();
    log.push(retime('c'));
    expect(targets(log.applied)).toEqual(['a', 'c']);
    expect(log.undone).toEqual([]);
  });

  it('removes a command from the middle and keeps the redo list', () => {
    const log = logWith('a', 'b', 'c');
    log.undo();
    log.remove(0);
    expect(targets(log.applied)).toEqual(['b']);
    expect(targets(log.undone)).toEqual(['c']);
  });

  it('jumps to any point, including back to the original shot', () => {
    const log = logWith('a', 'b', 'c');
    log.goTo(0);
    expect(targets(log.applied)).toEqual(['a']);
    log.goTo(2);
    expect(targets(log.applied)).toEqual(['a', 'b', 'c']);
    log.goTo(-1);
    expect(log.applied).toEqual([]);
    expect(targets(log.undone)).toEqual(['a', 'b', 'c']);
  });

  it('ignores jumps out of range, or to where it already is', () => {
    const log = logWith('a', 'b');
    const listener = vi.fn();
    log.onChange(listener);
    log.goTo(5);
    log.goTo(-2);
    log.goTo(1); // already showing up to 'b'
    expect(targets(log.applied)).toEqual(['a', 'b']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies listeners on every change', () => {
    const log = new CommandLog();
    const listener = vi.fn();
    log.onChange(listener);
    log.push(retime('a'));
    log.undo();
    log.redo();
    log.remove(0);
    log.clear();
    expect(listener).toHaveBeenCalledTimes(5);
  });
});

describe('muting', () => {
  it('keeps a muted command in the history, but out of what is shown', () => {
    const log = logWith('a', 'b', 'c');
    log.toggleMute(1);
    expect(targets(log.applied)).toEqual(['a', 'b', 'c']);
    expect(targets(log.active)).toEqual(['a', 'c']);
    expect(log.isMuted(1)).toBe(true);

    log.toggleMute(1);
    expect(targets(log.active)).toEqual(['a', 'b', 'c']);
  });

  it('remembers a mute through undo and redo', () => {
    const log = logWith('a', 'b');
    log.toggleMute(1);
    log.undo();
    log.redo();
    expect(targets(log.active)).toEqual(['a']);
  });

  it("can't mute a command that has been undone", () => {
    const log = logWith('a', 'b');
    log.undo();
    log.toggleMute(1);
    expect(log.isMuted(1)).toBe(false);
  });

  it('tells listeners, so the scene is rebuilt', () => {
    const log = logWith('a');
    const listener = vi.fn();
    log.onChange(listener);
    log.toggleMute(0);
    expect(listener).toHaveBeenCalledOnce();
  });
});
