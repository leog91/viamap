import type { FeatureCollection, LineString } from "geojson";
import { pointAt, type RouteGeometry, upperBound } from "./route-data";

export const distanceColors = [
  [0, "#09883f"],
  [2500, "#e2bc0b"],
  [6000, "#ed700a"],
  [12000, "#d62638"],
] as const;
export const distanceLabels = ["0", "2.5", "6", "12+ km"] as const;
const redAt = distanceColors[3][0];
const step = 250;

type Segment = { metres: number };
export type RouteLines = FeatureCollection<LineString, Segment>;

export function makeRouteLines(
  data: readonly RouteGeometry[],
  platforms: ReadonlySet<string>,
) {
  const lines: RouteLines = { type: "FeatureCollection", features: [] };
  const mapped = new Set<string>();
  for (const route of data) {
    const seen = new Set<string>();
    for (const pattern of route.patterns) {
      const shape = route.shapes[pattern.shape];
      if (!shape) continue;
      const boardings = [
        ...new Set(
          pattern.boardings.flatMap(([id, metres]) =>
            platforms.has(id) && metres < pattern.end ? [metres] : [],
          ),
        ),
      ].sort((a, b) => a - b);
      for (const [i, board] of boardings.entries()) {
        // Another nearby boarding opportunity resets the displayed onboard distance.
        const end = boardings[i + 1] ?? pattern.end;
        const key = `${pattern.shape}:${board}:${end}`;
        if (seen.has(key) || end <= board) continue;
        seen.add(key);
        mapped.add(route.route);
        for (let from = board; from < end; ) {
          const to = from - board >= redAt ? end : Math.min(from + step, end);
          const coordinates = [pointAt(shape, from)];
          for (let j = upperBound(shape, from); j < shape.length; j++) {
            const point = shape[j];
            if (!point || point[2] >= to) break;
            coordinates.push([point[0], point[1]]);
          }
          coordinates.push(pointAt(shape, to));
          lines.features.push({
            type: "Feature",
            properties: { metres: (from + to) / 2 - board },
            geometry: { type: "LineString", coordinates },
          });
          from = to;
        }
      }
    }
  }
  return { lines, mapped };
}
