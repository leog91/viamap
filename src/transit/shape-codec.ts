import type { MeasuredPoint } from "./route-data";

// Delta/varint encoding like Encoded Polyline, with a third dimension for
// cumulative centimetres so simplified geometry retains the original length.
export function encodeShape(points: MeasuredPoint[]) {
  const scale = [1e5, 1e5, 100];
  const previous = [0, 0, 0];
  let text = "";
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      const current = Math.round((point[axis] ?? 0) * (scale[axis] ?? 1));
      const delta = current - (previous[axis] ?? 0);
      previous[axis] = current;
      let value = delta < 0 ? -2 * delta - 1 : 2 * delta;
      while (value >= 32) {
        text += String.fromCharCode(95 + (value % 32));
        value = Math.floor(value / 32);
      }
      text += String.fromCharCode(63 + value);
    }
  }
  return text;
}

export function decodeShape(text: string): MeasuredPoint[] | undefined {
  const points: MeasuredPoint[] = [];
  let pos = 0;
  let x = 0;
  let y = 0;
  let cm = 0;
  function read() {
    let value = 0;
    for (let shift = 0; shift <= 30 && pos < text.length; shift += 5) {
      const digit = text.charCodeAt(pos++) - 63;
      if (digit < 0 || digit > 63) return;
      value += (digit % 32) * 2 ** shift;
      if (digit < 32) return value % 2 ? -(value + 1) / 2 : value / 2;
    }
  }
  while (pos < text.length) {
    const dx = read();
    const dy = read();
    const dc = read();
    if (dx === undefined || dy === undefined || dc === undefined) return;
    x += dx;
    y += dy;
    cm += dc;
    if (
      Math.abs(x) > 18e6 ||
      Math.abs(y) > 9e6 ||
      (points.length ? dc <= 0 : cm !== 0)
    )
      return;
    points.push([x / 1e5, y / 1e5, cm / 100]);
  }
  if (points.length >= 2) return points;
}
