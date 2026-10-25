import { formatCommand } from '../commands/format';
import type { CommandLog } from '../commands/log';
import type { Command } from '../commands/parse';

/** Saving and loading the whole history, done by main.ts */
export interface HistoryFiles {
  save: () => void;
  load: (file: File) => void;
}

/**
 * Click a row to jump to that point, double-click to edit it in the command bar,
 * M to mute it (compare the shot without it), ✕ to remove it.
 */
export function createHistoryPanel(
  root: HTMLElement,
  log: CommandLog,
  onEdit: (text: string) => void,
  files: HistoryFiles,
) {
  const section = document.createElement('section');
  section.className = 'history';

  const heading = document.createElement('h2');
  heading.textContent = 'Changes';

  const list = document.createElement('ol');
  list.className = 'history-list';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // so choosing the same file again still counts as a change
    if (file) files.load(file);
  });

  const header = document.createElement('div');
  header.className = 'history-header';
  header.append(
    heading,
    actionButton('Save', 'Save these edits to a file (Ctrl+S)', files.save),
    actionButton('Load', 'Load edits from a file', () => fileInput.click()),
    fileInput,
  );

  section.append(header, list);

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
      mute.addEventListener('mousedown', (event) => event.preventDefault()); // keep keyboard focus
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

function actionButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-action';
  button.textContent = text;
  button.title = title;
  button.addEventListener('mousedown', (event) => event.preventDefault()); // keep keyboard focus
  button.addEventListener('click', onClick);
  return button;
}
