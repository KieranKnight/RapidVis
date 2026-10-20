import { formatCommand } from '../commands/format';
import type { CommandLog } from '../commands/log';
import type { Command } from '../commands/parse';

/**
 * Click a row to jump to that point, double-click to edit it in the command bar,
 * ✕ to remove it. The top row is the original shot, before any commands.
 */
export function createHistoryPanel(
  root: HTMLElement,
  log: CommandLog,
  onEdit: (text: string) => void,
) {
  const section = document.createElement('section');
  section.className = 'history';

  const heading = document.createElement('h2');
  heading.textContent = 'History';

  const list = document.createElement('ol');
  list.className = 'history-list';

  section.append(heading, list);
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
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-remove';
      remove.textContent = '✕';
      remove.title = 'Remove this command';
      remove.addEventListener('mousedown', (event) => event.preventDefault()); // keep keyboard focus
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
  };

  log.onChange(render);
  render();
}
