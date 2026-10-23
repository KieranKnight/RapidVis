/** Everything the burn-in reports about one frame. */
export interface BurnInInfo {
  shot: string;
  camera: string;
  focal: number | null; // mm, or null when there's no lens to report (the free camera)
  frame: number;
  frameEnd: number;
  commands: readonly string[]; // the applied commands, oldest first
}

/** The text for each corner of the frame. */
export interface BurnIn {
  topLeft: string;
  topRight: string;
  bottomLeft: string[]; // one line each, top to bottom
  bottomRight: string;
}

/** How many commands fit in the corner before older ones are summed up. */
export const MAX_COMMANDS = 4;

/** At least 4 digits, or as many as the last frame needs, so the counter never changes width. */
export function padFrame(frame: number, frameEnd: number): string {
  const digits = Math.max(4, String(frameEnd).length);
  return String(frame).padStart(digits, '0');
}

export function burnInText(info: BurnInInfo): BurnIn {
  const lens = info.focal === null ? '' : ` · ${Number(info.focal.toFixed(1))}mm`;
  const recent = info.commands.slice(-MAX_COMMANDS);
  const earlier = info.commands.length - recent.length;

  return {
    topLeft: info.shot,
    topRight: info.camera + lens,
    bottomLeft:
      info.commands.length === 0
        ? ['No edits']
        : [...(earlier > 0 ? [`+${earlier} earlier`] : []), ...recent],
    bottomRight: `frame ${padFrame(info.frame, info.frameEnd)} / ${padFrame(info.frameEnd, info.frameEnd)}`,
  };
}
