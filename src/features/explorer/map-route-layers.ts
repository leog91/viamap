import type { Map as MapLibreMap } from "maplibre-gl";
import { distanceColors, type RouteLines } from "../../transit/route-lines";

export const routeSource = "accessible-route-shapes";

export function addRouteLayers(map: MapLibreMap, data: RouteLines) {
  map.addSource(routeSource, { type: "geojson", data, tolerance: 0.25 });
  const labels = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: "accessible-route-casing",
      type: "line",
      source: routeSource,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-width": 6, "line-color": "#fff", "line-opacity": 0.85 },
    },
    labels,
  );
  map.addLayer(
    {
      id: "accessible-route-distance",
      type: "line",
      source: routeSource,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        "line-sort-key": ["-", 0, ["number", ["get", "metres"]]],
      },
      paint: {
        "line-width": 4,
        // line-gradient can't vary its scale per feature. These bands get their
        // colors from absolute metres so a short branch still uses the same scale.
        "line-color": [
          "interpolate",
          ["linear"],
          ["number", ["get", "metres"]],
          ...distanceColors.flat(),
        ],
      },
    },
    labels,
  );
}
