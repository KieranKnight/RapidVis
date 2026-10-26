// Icons for the timeline's view toggles: 18px strokes in the button's own colour (Feather-style shapes)
const svg = (body: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Overlays: a stack of layers. */
export const LAYERS_ICON = svg(
  '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
);

/** Burn-in: a frame with lines of text in it. */
export const BURN_IN_ICON = svg(
  '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h6M7 11h3M15 15h2"/>',
);
