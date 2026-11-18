import { circle } from "@turf/circle";

export type Coordinates = [longitude: number, latitude: number];

export const radiusMetres = { initial: 500, min: 100, max: 2000, step: 50 };

export function catchmentFeatures(center: Coordinates, metres: number) {
  const area = circle(center, metres, {
    units: "meters",
    steps: 96,
    properties: { kind: "catchment" },
  });
  return {
    type: "FeatureCollection",
    features: [
      area,
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: center },
        properties: { kind: "origin" },
      },
    ],
  } as const satisfies import("geojson").FeatureCollection;
}
