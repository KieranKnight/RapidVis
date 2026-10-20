/** Runs a command. Returns an error message, or null if it worked. */
export type RunCommand = (text: string) => string | null;

export interface CommandBar {
  focus(): void;
  setText(text: string): void;
}

export function createCommandBar(root: HTMLElement, run: RunCommand): CommandBar {
  const form = document.createElement('form');
  form.className = 'command-bar';

  const message = document.createElement('div');
  message.className = 'command-message';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'command-input';
  input.placeholder = 'Type a command, e.g. retime cube 1.5   (press / to focus)';
  input.spellcheck = false;
  input.autocomplete = 'off';

  form.append(message, input);
  root.append(form);

  const show = (text: string, isError: boolean) => {
    message.textContent = text;
    message.classList.toggle('error', isError);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault(); // a form would otherwise reload the page
    const text = input.value.trim();
    if (!text) return;

    const error = run(text);
    if (error) {
      show(`✖ ${error}`, true); // keep the text so it can be fixed
    } else {
      show(`✓ ${text}`, false);
      input.value = '';
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') input.blur(); // hand the keyboard back to the viewport
  });

  return {
    focus() {
      input.focus();
    },
    setText(text) {
      input.value = text;
      show('', false);
      input.focus();
    },
  };
}
