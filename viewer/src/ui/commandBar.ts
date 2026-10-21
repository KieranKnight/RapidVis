import type { Suggestion } from '../commands/complete';
import { helpFor } from '../commands/definitions';

/** Runs a command. Returns an error message, or null if it worked. */
export type RunCommand = (text: string) => string | null;

/** What to offer for the text before the cursor. */
export type Suggest = (before: string) => Suggestion[];

export interface CommandBar {
  focus(): void;
  setText(text: string): void;
}

export function createCommandBar(root: HTMLElement, run: RunCommand, suggest: Suggest): CommandBar {
  const form = document.createElement('form');
  form.className = 'command-bar';

  const menu = document.createElement('ul');
  menu.className = 'command-menu';
  menu.setAttribute('role', 'listbox');

  const message = document.createElement('div');
  message.className = 'command-message';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'command-input';
  input.placeholder = 'Type a command, or / to see them all';
  input.spellcheck = false;
  input.autocomplete = 'off';

  form.append(menu, message, input);
  root.append(form);

  const show = (text: string, isError: boolean) => {
    message.textContent = text;
    message.classList.toggle('error', isError);
  };

  // --- The menu ---
  let items: Suggestion[] = [];
  let selected = 0;

  function renderMenu() {
    const rows = items.map((item, i) => {
      const row = document.createElement('li');
      row.className = 'command-menu-row';
      row.classList.toggle('selected', i === selected);
      row.setAttribute('role', 'option');

      const label = document.createElement('span');
      label.className = 'command-menu-label';
      label.textContent = item.label;
      const detail = document.createElement('span');
      detail.className = 'command-menu-detail';
      detail.textContent = item.description
        ? `${item.detail}  ·  ${item.description}`
        : item.detail;
      row.append(label, detail);

      row.addEventListener('mousedown', (event) => {
        event.preventDefault(); // keep the focus in the input
        choose(item);
      });
      return row;
    });
    menu.replaceChildren(...rows);
    rows[selected]?.scrollIntoView({ block: 'nearest' });
  }

  /** Works out the suggestions for the text before the cursor, and shows them. */
  function update() {
    items = suggest(input.value.slice(0, input.selectionStart ?? input.value.length));
    selected = 0;
    renderMenu();
  }

  function close() {
    items = [];
    renderMenu();
  }

  /** Swaps the text before the cursor for the suggestion's, keeping anything after it. */
  function choose(item: Suggestion) {
    const after = input.value.slice(input.selectionStart ?? input.value.length);
    input.value = item.text + after;
    input.setSelectionRange(item.text.length, item.text.length);
    update(); // a chosen command goes straight on to suggesting objects
  }

  input.addEventListener('input', update);

  input.addEventListener('keydown', (event) => {
    if (items.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); // stop the cursor jumping to the start or end
        const step = event.key === 'ArrowDown' ? 1 : -1;
        selected = (selected + step + items.length) % items.length; // wraps around
        renderMenu();
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault(); // Tab would leave the input, Enter would run the command
        choose(items[selected]);
        return;
      }
      if (event.key === 'Escape') {
        close();
        return;
      }
    }
    if (event.key === 'Escape') input.blur(); // hand the keyboard back to the viewport
  });

  input.addEventListener('blur', close);

  // --- Running ---
  form.addEventListener('submit', (event) => {
    event.preventDefault(); // a form would otherwise reload the page
    const text = input.value.trim();
    if (!text) return;

    const help = helpFor(text);
    if (help) {
      show(help, false);
      input.value = '';
      return;
    }

    const error = run(text);
    if (error) {
      show(`✖ ${error}`, true); // keep the text so it can be fixed
    } else {
      show(`✓ ${text}`, false);
      input.value = '';
    }
  });

  return {
    focus() {
      input.focus();
    },
    setText(text) {
      input.value = text;
      show('', false);
      input.focus();
      update();
    },
  };
}
