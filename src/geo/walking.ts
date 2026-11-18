import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Coordinates } from "./catchment";

export type WalkingArea = FeatureCollection<Polygon | MultiPolygon>;
const walkingEndpoint =
  import.meta.env?.VITE_VALHALLA_BASE_URL ||
  "https://valhalla1.openstreetmap.de/";

export async function fetchWalkingDistance(
  from: Coordinates,
  to: Coordinates,
  signal: AbortSignal,
) {
  const result = await callValhalla(
    "route",
    {
      locations: [from, to].map(([lon, lat]) => ({ lon, lat })),
      costing: "pedestrian",
      units: "kilometers",
    },
    signal,
  );
  if (
    !record(result) ||
    !record(result.trip) ||
    !record(result.trip.summary) ||
    result.trip.units !== "kilometers" ||
    typeof result.trip.summary.length !== "number" ||
    typeof result.trip.summary.time !== "number" ||
    !Number.isFinite(result.trip.summary.length) ||
    !Number.isFinite(result.trip.summary.time) ||
    result.trip.summary.length < 0 ||
    result.trip.summary.time < 0
  ) {
    throw new Error("No pedestrian route returned");
  }
  return {
    metres: result.trip.summary.length * 1000,
    seconds: result.trip.summary.time,
  };
}

export async function fetchWalkingArea(
  [lon, lat]: Coordinates,
  metres: number,
  signal: AbortSignal,
): Promise<WalkingArea> {
  return parseWalkingArea(
    await callValhalla(
      "isochrone",
      {
        locations: [{ lat, lon }],
        costing: "pedestrian",
        contours: [{ distance: metres / 1000 }],
        polygons: true,
      },
      signal,
    ),
  );
}

async function callValhalla(
  action: string,
  data: object,
  signal: AbortSignal,
): Promise<unknown> {
  const url = new URL(action, `${walkingEndpoint.replace(/\/$/, "")}/`);
  url.searchParams.set("json", JSON.stringify(data));
  const response = await fetch(url, {
    signal,
    headers: { "X-Client-Id": "ViaMap-personal-explorer" },
  });
  if (!response.ok)
    throw new Error(`Walking service returned HTTP ${response.status}`);
  return response.json();
}

export function parseWalkingArea(value: unknown): WalkingArea {
  if (
    !record(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features)
  ) {
    throw new Error("Invalid walking response");
  }
  const features: WalkingArea["features"] = [];
  for (const feature of value.features) {
    if (!record(feature) || !record(feature.geometry)) continue;
    const { type, coordinates } = feature.geometry;
    if (type === "Polygon" && rings(coordinates)) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type, coordinates },
      });
    } else if (
      type === "MultiPolygon" &&
      Array.isArray(coordinates) &&
      coordinates.length &&
      coordinates.every(rings)
    ) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type, coordinates },
      });
    }
  }
  if (!features.length)
    throw new Error("The walking service returned no polygon");
  return { type: "FeatureCollection", features };
}

function rings(value: unknown): value is number[][][] {
  return (
    Array.isArray(value) &&
    !!value.length &&
    value.every(
      (ring: unknown) =>
        Array.isArray(ring) &&
        ring.length >= 4 &&
        ring.every(
          (point: unknown) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every((n) => typeof n === "number" && Number.isFinite(n)),
        ),
    )
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
