import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Coordinates } from "../../geo/catchment";
import type { WalkingArea } from "../../geo/walking";

export const analysisSource = "location-analysis";

export function analysisGeometry(
  baseline: Coordinates | undefined,
  area: WalkingArea | undefined,
): FeatureCollection<Point | Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: [
      ...(area?.features ?? []),
      ...(baseline
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: baseline },
              properties: {},
            } as const,
          ]
        : []),
    ],
  };
}

export function addAnalysisLayers(
  map: MapLibreMap,
  data: ReturnType<typeof analysisGeometry>,
) {
  map.addSource(analysisSource, { type: "geojson", data });
  const labels = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: "walking-catchment",
      source: analysisSource,
      type: "fill",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#d97706",
        "fill-opacity": 0.27,
        "fill-outline-color": "#945009",
      },
    },
    labels,
  );
  map.addLayer({
    id: "comparison-pin",
    source: analysisSource,
    type: "circle",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-color": "#2649ba",
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
}
