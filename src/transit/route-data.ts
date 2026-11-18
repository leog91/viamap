import type { Coordinates } from "../geo/catchment";

export type MeasuredPoint = [lon: number, lat: number, metres: number];
export type Boarding = [platform: string, metres: number];

export interface RoutePattern {
  shape: number;
  end: number;
  boardings: Boarding[];
}

export interface RouteGeometry {
  route: string;
  shapes: MeasuredPoint[][];
  patterns: RoutePattern[];
}

export function pointAt(
  points: readonly MeasuredPoint[],
  metres: number,
): Coordinates {
  const bracket = upperBound(points, metres);
  const previous = points[bracket - 1];
  const next = points[bracket];
  if (!previous && !next) throw new Error("Empty route shape");
  if (!previous && next) return [next[0], next[1]];
  if (!next && previous) return [previous[0], previous[1]];
  if (!next || !previous) throw new Error("Invalid route shape");
  const t = (metres - previous[2]) / (next[2] - previous[2]);
  return [
    previous[0] + (next[0] - previous[0]) * t,
    previous[1] + (next[1] - previous[1]) * t,
  ];
}

export function upperBound(points: readonly MeasuredPoint[], metres: number) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((points[mid]?.[2] ?? Infinity) <= metres) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
