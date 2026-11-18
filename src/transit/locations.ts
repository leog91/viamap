import type { Coordinates } from "../geo/catchment";
import type { Bounds } from "./model";

export type TransitLocation = {
  id: string;
  name: string;
  coordinates: Coordinates;
  kind: string;
  detail: string;
};
export type NearbyLocation = TransitLocation & { metres: number };

// The smallest rectangle enclosing the published points, not service coverage.
export function locationExtent(
  locations: readonly TransitLocation[],
): Bounds | undefined {
  if (!locations.length) return undefined;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const {
    coordinates: [lon, lat],
  } of locations) {
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

export async function loadLocations(
  url: string,
  signal: AbortSignal,
): Promise<TransitLocation[]> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Locations returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  return parseLocations(value);
}

export function parseLocations(value: unknown): TransitLocation[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error("Missing transit locations");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new Error("Invalid location");
    const { id, name, coordinates, kind, detail } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof id !== "string" ||
      ids.has(id) ||
      typeof name !== "string" ||
      !name ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !coordinates.every((n) => typeof n === "number" && Number.isFinite(n)) ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90 ||
      typeof kind !== "string" ||
      typeof detail !== "string"
    )
      throw new Error("Invalid location fields");
    ids.add(id);
    return {
      id,
      name,
      coordinates: [coordinates[0], coordinates[1]],
      kind,
      detail,
    };
  });
}
