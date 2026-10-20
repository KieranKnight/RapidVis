export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The largest rectangle with the given aspect that fits centred inside the container */
export function fitAspect(containerWidth: number, containerHeight: number, aspect: number): Rect {
  const containerAspect = containerWidth / containerHeight;

  if (containerAspect > aspect) {
    // Container is wider than the shot: bars on the left and right
    const width = Math.round(containerHeight * aspect);
    return { x: Math.round((containerWidth - width) / 2), y: 0, width, height: containerHeight };
  }

  // Container is taller than the shot: bars on the top and bottom
  const height = Math.round(containerWidth / aspect);
  return { x: 0, y: Math.round((containerHeight - height) / 2), width: containerWidth, height };
}
