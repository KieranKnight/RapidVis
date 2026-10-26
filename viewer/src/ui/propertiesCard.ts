import { Light, PerspectiveCamera } from 'three';
import type { NodeSettings } from '../commands/apply';
import type { Command } from '../commands/parse';
import {
  colorCommand,
  describeKeys,
  focalCommand,
  INTENSITY,
  intensityCommand,
  type Channel,
} from '../properties';
import type { NodeType, SceneNode } from '../registry';
import type { Selection } from '../selection';

/** What the card reads about the shot, and how it changes it: main.ts answers all of these. */
export interface PropertiesSource {
  /** Runs a command, exactly as if it had been typed. */
  run(command: Command): void;
  settings(node: SceneNode): NodeSettings;
  /** A camera's focal length in mm, or null if it isn't a camera. */
  lens(node: SceneNode): number | null;
  channels(node: SceneNode): Channel[];
}

export interface PropertiesCard {
  /** Shows the selected object's current values again, after an edit. */
  refresh(): void;
}

const KINDS: Record<NodeType, string> = {
  mesh: 'Mesh',
  camera: 'Camera',
  light: 'Light',
  group: 'Group',
};
const LIGHT_KINDS: Record<string, string> = {
  DirectionalLight: 'Directional light',
  PointLight: 'Point light',
  SpotLight: 'Spot light',
};

/** A new element with a class, and optionally its text. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

/** The selected object's details. Its controls never change the scene themselves: they run commands. */
export function createPropertiesCard(
  root: HTMLElement,
  selection: Selection,
  source: PropertiesSource,
): PropertiesCard {
  function colourField(node: SceneNode, light: Light): HTMLElement {
    const current = `#${light.color.getHexString()}`; // what the shot shows now, edits included
    const readout = element('span', 'props-readout', current.toUpperCase());

    // A box showing the light's colour; clicking it opens the colour picker
    const picker = element('input', 'colour-box');
    picker.type = 'color';
    picker.value = current;
    picker.title = 'Pick a colour';
    picker.setAttribute('aria-label', 'Light colour');

    const show = (hex: string) => {
      light.color.set(hex);
      readout.textContent = hex.toUpperCase();
    };
    // While picking, preview the colour on the light itself; the command comes when the picker closes
    let chosen = false;
    picker.addEventListener('input', () => show(picker.value));
    picker.addEventListener('change', () => {
      if (picker.value === current) return;
      chosen = true;
      source.run(colorCommand(node.id, picker.value)); // -> the card refreshes with the new colour
    });
    // Closed without choosing: put the light back as it was
    picker.addEventListener('blur', () => {
      if (chosen) return;
      picker.value = current;
      show(current);
    });

    const row = element('div', 'props-colour');
    row.append(picker, readout);
    const field = element('div', 'props-field');
    field.append(element('span', 'props-label', 'Colour'), row);
    return field;
  }

  function intensityField(node: SceneNode, light: Light): HTMLElement {
    const factor = source.settings(node).intensity ?? 1;
    const readout = element('span', 'props-readout', `×${factor.toFixed(1)}`);
    const slider = element('input', 'props-slider');
    slider.type = 'range';
    slider.min = String(INTENSITY.min);
    slider.max = String(INTENSITY.max);
    slider.step = String(INTENSITY.step);
    slider.value = String(factor);
    slider.setAttribute('aria-label', 'Intensity');

    // While dragging, preview the brightness on the light itself; the command comes on release
    const loaded = factor > 0 ? light.intensity / factor : null; // its brightness before any edit
    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      readout.textContent = `×${value.toFixed(1)}`;
      if (loaded !== null) light.intensity = loaded * value;
    });
    slider.addEventListener('change', () =>
      source.run(intensityCommand(node.id, Number(slider.value))),
    );

    const row = element('div', 'props-row');
    row.append(element('span', 'props-label', 'Intensity'), readout);
    const field = element('div', 'props-field');
    field.append(row, slider);
    return field;
  }

  function lensField(node: SceneNode, mm: number): HTMLElement {
    const input = element('input', 'props-number');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = String(Math.round(mm * 10) / 10);
    input.setAttribute('aria-label', 'Lens in millimetres');
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (value > 0) source.run(focalCommand(node.id, value));
    });

    const value = element('span', 'props-lens');
    value.append(input, ' mm');
    const row = element('div', 'props-row');
    row.append(element('span', 'props-label', 'Lens'), value);
    return row;
  }

  function channelList(animated: Channel[]): HTMLElement {
    const list = element('div', 'props-channels');
    list.append(element('span', 'props-label', 'Animated channels'));
    for (const channel of animated) {
      const row = element('div', 'props-channel');
      row.append(
        element('span', 'props-channel-name', channel.name),
        element('span', 'props-readout', describeKeys(channel.keys)),
      );
      list.append(row);
    }
    return list;
  }

  function render() {
    const node = selection.selected;
    root.hidden = node === null;
    if (!node) {
      root.replaceChildren();
      return;
    }

    const { object } = node;
    const animated = source.channels(node);
    const kind = LIGHT_KINDS[object.type] ?? KINDS[node.type];
    const heading = element('div', 'props-heading');
    heading.append(
      element('h2', 'props-name', node.id),
      element('p', 'props-caption', animated.length > 0 ? `${kind} · animated` : kind),
    );

    const fields: HTMLElement[] = [];
    if (object instanceof Light)
      fields.push(colourField(node, object), intensityField(node, object));
    const mm = object instanceof PerspectiveCamera ? source.lens(node) : null;
    if (mm !== null) fields.push(lensField(node, mm));
    if (animated.length > 0) fields.push(channelList(animated));

    root.replaceChildren(heading, ...fields);
  }

  selection.onChange(render);
  render();

  return { refresh: render };
}
