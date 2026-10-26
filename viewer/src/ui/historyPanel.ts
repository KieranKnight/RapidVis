import { formatCommand } from '../commands/format';
import type { CommandLog } from '../commands/log';
import type { Command } from '../commands/parse';
import { keepFocus } from './dom';

// A 14px cross, for the card's own hide button
const CLOSE_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/**
 * Click a row to jump to that point, double-click to edit it in the command bar,
 * M to mute it (compare the shot without it), ✕ to remove it.
 * `onHide` is the card's own hide button, so hiding just Changes is easy to find (H does the same).
 */
export function createHistoryPanel(
  root: HTMLElement,
  log: CommandLog,
  onEdit: (text: string) => void,
  onHide: () => void,
) {
  const section = document.createElement('section');
  section.className = 'history';

  const heading = document.createElement('h2');
  heading.textContent = 'Changes';

  const list = document.createElement('ol');
  list.className = 'history-list';

  const header = document.createElement('div');
  header.className = 'history-header';
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'panel-hide';
  hide.title = 'Hide changes (H)';
  hide.setAttribute('aria-label', hide.title);
  hide.innerHTML = CLOSE_ICON;
  keepFocus(hide);
  hide.addEventListener('click', onHide);
  header.append(heading, hide); // saving and loading live in the shot menu

  // An instant A/B: every edit off, then on again. The history itself never changes
  const compare = document.createElement('button');
  compare.type = 'button';
  compare.className = 'history-compare';
  compare.title = 'Compare with the original shot (C)';
  keepFocus(compare);
  compare.addEventListener('click', () => log.setComparing(!log.isComparing));

  section.append(header, list, compare);

  root.append(section);

  /** `index` is the command's place in the log; -1 is the original shot. */
  function createRow(index: number, command: Command | null): HTMLLIElement {
    const text = command ? formatCommand(command) : 'Original shot';
    const current = log.applied.length - 1; // the row the scene is showing right now

    const row = document.createElement('li');
    row.className = 'history-row';
    row.classList.toggle('current', index === current);
    row.classList.toggle('undone', index > current);
    row.addEventListener('click', () => log.goTo(index));

    const label = document.createElement('span');
    label.className = 'history-text';
    label.textContent = text;
    label.title = text; // full text on hover, in case it's cut off
    row.append(label);

    if (command) {
      row.addEventListener('dblclick', () => onEdit(text));
    }

    if (command && index <= current) {
      const muted = log.isMuted(index);
      row.classList.toggle('muted', muted);

      const mute = document.createElement('button');
      mute.type = 'button';
      mute.className = 'history-mute';
      mute.textContent = 'M';
      mute.title = muted ? 'Unmute: apply this command again' : 'Mute: see the shot without it';
      mute.setAttribute('aria-pressed', String(muted));
      keepFocus(mute);
      mute.addEventListener('click', (event) => {
        event.stopPropagation(); // don't also jump to this row
        log.toggleMute(index);
      });
      row.append(mute);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-remove';
      remove.textContent = '✕';
      remove.title = 'Remove this command';
      keepFocus(remove);
      remove.addEventListener('click', (event) => {
        event.stopPropagation(); // don't also jump to this row
        log.remove(index);
      });
      row.append(remove);
    }
    return row;
  }

  const render = () => {
    const commands = [...log.applied, ...log.undone];
    list.replaceChildren(
      createRow(-1, null),
      ...commands.map((command, index) => createRow(index, command)),
    );
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });

    compare.hidden = log.applied.length === 0; // nothing to compare yet
    compare.textContent = log.isComparing ? 'Back to the edits' : 'Compare with original';
    compare.setAttribute('aria-pressed', String(log.isComparing));
    section.classList.toggle('comparing', log.isComparing);
  };

  log.onChange(render);
  render();
}
