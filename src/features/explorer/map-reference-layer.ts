import type { Map as MapLibreMap } from "maplibre-gl";
import type { ReferenceNetwork } from "../../transit/reference-network";

export const referenceSource = "reference-network";
export const emptyNetwork: ReferenceNetwork = {
  type: "FeatureCollection",
  features: [],
};

export function addReferenceLayer(map: MapLibreMap, network: ReferenceNetwork) {
  map.addSource(referenceSource, { type: "geojson", data: network });
  const labels = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: "reference-network-outline",
      type: "line",
      source: referenceSource,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#fff", "line-width": 7 },
    },
    labels,
  );
  map.addLayer(
    {
      id: "reference-network-lines",
      type: "line",
      source: referenceSource,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["to-color", ["get", "color"]],
        "line-width": 4,
        "line-dasharray": [2.5, 1],
      },
    },
    labels,
  );
}
