export interface ToggleButton {
  toggle(): void;
}

export function createToggleButton(
  root: HTMLElement,
  label: string,
  initial: boolean,
  onChange: (on: boolean) => void,
): ToggleButton {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toggle-button';
  button.textContent = label;
  root.append(button);

  let on = initial;
  const apply = () => {
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  };

  // Don't take focus on mouse click, so Space and the arrows keep controlling playback
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    on = !on;
    apply();
  });
  apply();

  return {
    toggle() {
      on = !on;
      apply();
    },
  };
}
