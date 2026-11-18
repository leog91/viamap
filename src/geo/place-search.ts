import type { Coordinates } from "./catchment";

export const placeSearchEndpoint =
  import.meta.env?.VITE_PLACE_SEARCH_URL || "https://photon.komoot.io/api/";
export type Place = { key: string; label: string; coordinates: Coordinates };

export async function searchPlaces(query: string, signal: AbortSignal) {
  const url = new URL(placeSearchEndpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Place search returned HTTP ${response.status}`);
  return parsePlaces(await response.json());
}

export function parsePlaces(value: unknown): Place[] {
  if (!record(value) || !Array.isArray(value.features))
    throw new Error("Invalid place response");
  const results = new Map<string, Place>();
  for (const item of value.features) {
    if (
      !record(item) ||
      !record(item.geometry) ||
      item.geometry.type !== "Point" ||
      !record(item.properties)
    )
      continue;
    const coordinates: unknown = item.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;
    const [lon, lat]: unknown[] = coordinates;
    if (
      typeof lon !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 85
    )
      continue;
    const { name, street, housenumber, locality, city, state, country } =
      item.properties;
    const parts = [
      name,
      [street, housenumber].filter((p) => typeof p === "string" && p).join(" "),
      locality,
      city,
      state,
      country,
    ]
      .filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
      .map((p) => p.trim());
    const label = [...new Set(parts)].join(", ");
    if (label)
      results.set(`${lon},${lat}`, {
        key: `${lon},${lat}`,
        label,
        coordinates: [lon, lat],
      });
  }
  return [...results.values()].slice(0, 5);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
