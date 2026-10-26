import { keepFocus } from './dom';

export interface ToggleButton {
  toggle(): void;
}

/** For an icon-only toggle: the icon, and the key that also toggles it (named in the tooltip). */
export interface ToggleLook {
  icon: string;
  shortcut: string;
}

export function createToggleButton(
  root: HTMLElement,
  label: string,
  initial: boolean,
  onChange: (on: boolean) => void,
  look?: ToggleLook,
): ToggleButton {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = look ? 'toggle-button icon-toggle' : 'toggle-button';
  if (look) {
    button.innerHTML = look.icon;
    button.title = `${label} (${look.shortcut})`;
    button.setAttribute('aria-label', label);
  } else {
    button.textContent = label;
  }
  root.append(button);

  let on = initial;
  const apply = () => {
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  };

  keepFocus(button);
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
