import type { FeatureCollection, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Bounds } from "../../transit/model";

export const coverageSource = "transit-data-area";
export const coverageColor = "#1069a4";

export function coverageShape(
  bounds: Bounds | undefined,
): FeatureCollection<Polygon> {
  if (!bounds) return { type: "FeatureCollection", features: [] };
  const [west, south, east, north] = bounds;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

export function addCoverageLayer(map: MapLibreMap, bounds: Bounds | undefined) {
  map.addSource(coverageSource, {
    type: "geojson",
    data: coverageShape(bounds),
  });
  const labels = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: "transit-data-boundary",
      source: coverageSource,
      type: "line",
      paint: {
        "line-color": coverageColor,
        "line-width": 3,
        "line-dasharray": [2, 1.2],
      },
    },
    labels,
  );
}
