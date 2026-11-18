import { distance } from "@turf/distance";
import type { Coordinates } from "../geo/catchment";
import type { Bounds, TransitStop } from "./model";

export type NearbyStop = TransitStop & { metres: number };

export function withinBounds(
  [lon, lat]: Coordinates,
  [west, south, east, north]: Bounds,
) {
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export function findNearbyStops(
  stops: readonly TransitStop[],
  origin: Coordinates,
  radius: number,
): NearbyStop[] {
  return findNearbyPoints(stops, origin, radius);
}

export function findNearbyPoints<
  T extends { id: string; coordinates: Coordinates },
>(
  points: readonly T[],
  origin: Coordinates,
  radius: number,
): (T & { metres: number })[] {
  return points
    .flatMap((stop) => {
      const metres = distance(origin, stop.coordinates, { units: "meters" });
      return metres <= radius ? [{ ...stop, metres }] : [];
    })
    .sort((a, b) => a.metres - b.metres || a.id.localeCompare(b.id));
}

// Compare against the edges at the origin's longitude/latitude. This is a
// viewport-scale coverage hint, not a polygon containment calculation.
export function radiusCoverage(
  origin: Coordinates,
  radius: number,
  bounds: Bounds,
) {
  if (!withinBounds(origin, bounds)) return "outside";
  const [lon, lat] = origin;
  const [west, south, east, north] = bounds;
  const edgePoints: Coordinates[] = [
    [west, lat],
    [east, lat],
    [lon, south],
    [lon, north],
  ];
  return edgePoints.some(
    (point) => distance(origin, point, { units: "meters" }) <= radius,
  )
    ? "edge"
    : "inside";
}
