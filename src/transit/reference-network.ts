import type { FeatureCollection, LineString } from "geojson";

export type ReferenceNetwork = FeatureCollection<
  LineString,
  { name: string; color: string }
>;

async function loadReferenceNetwork(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Network data returned HTTP ${response.status}`);
  return parseReferenceNetwork(await response.json());
}

export async function loadReferenceNetworks(
  urls: readonly string[],
  signal: AbortSignal,
): Promise<ReferenceNetwork> {
  const networks = await Promise.all(
    urls.map((url) => loadReferenceNetwork(url, signal)),
  );
  return {
    type: "FeatureCollection",
    features: networks.flatMap(({ features }) => features),
  };
}

export function parseReferenceNetwork(value: unknown): ReferenceNetwork {
  if (
    !record(value) ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    !value.features.length
  ) {
    throw new Error("Invalid network line collection");
  }
  const features: ReferenceNetwork["features"] = value.features.map(
    (feature: unknown) => {
      if (
        !record(feature) ||
        feature.type !== "Feature" ||
        !record(feature.properties) ||
        typeof feature.properties.name !== "string" ||
        !feature.properties.name ||
        typeof feature.properties.color !== "string" ||
        !/^#[a-f0-9]{6}$/i.test(feature.properties.color) ||
        !record(feature.geometry) ||
        feature.geometry.type !== "LineString" ||
        !Array.isArray(feature.geometry.coordinates) ||
        feature.geometry.coordinates.length < 2
      ) {
        throw new Error("Invalid network line");
      }
      const coordinates = feature.geometry.coordinates.map((pair: unknown) => {
        if (
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          !pair.every((n) => typeof n === "number" && Number.isFinite(n)) ||
          Math.abs(pair[0]) > 180 ||
          Math.abs(pair[1]) > 90
        )
          throw new Error("Invalid network coordinate");
        return [pair[0], pair[1]];
      });
      return {
        type: "Feature",
        properties: {
          name: feature.properties.name,
          color: feature.properties.color,
        },
        geometry: { type: "LineString", coordinates },
      };
    },
  );
  return { type: "FeatureCollection", features };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
