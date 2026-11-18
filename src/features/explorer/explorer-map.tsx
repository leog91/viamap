import { Crosshair, Frame, MapPin, Minus, Plus, RotateCcw } from "lucide-react";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { type CityView, cityAt, cityLabel } from "../../config/cities";
import { type Coordinates, catchmentFeatures } from "../../geo/catchment";
import type { WalkingArea } from "../../geo/walking";
import type { Bounds } from "../../transit/model";
import type { ReferenceNetwork } from "../../transit/reference-network";
import {
  distanceColors,
  distanceLabels,
  type RouteLines,
} from "../../transit/route-lines";
import {
  addAnalysisLayers,
  analysisGeometry,
  analysisSource,
} from "./map-analysis-layers";
import {
  addCoverageLayer,
  coverageColor,
  coverageShape,
  coverageSource,
} from "./map-coverage-layer";
import {
  addReferenceLayer,
  emptyNetwork,
  referenceSource,
} from "./map-reference-layer";
import { addRouteLayers, routeSource } from "./map-route-layers";
import "maplibre-gl/dist/maplibre-gl.css";

const sourceId = "origin-selection";
const stopsSource = "nearby-boarding-points";
const stopsLayer = "nearby-stops";
type MapStatus = "loading" | "ready" | "failed";
export type MapCamera = { center: Coordinates; zoom: number };
type Marker = {
  id: string;
  name: string;
  coordinates: Coordinates;
  metres: number;
};

interface ExplorerMapProps {
  city: CityView;
  initialCamera: MapCamera | undefined;
  placeCamera: MapCamera | undefined;
  baseline: Coordinates | undefined;
  walkingArea: WalkingArea | undefined;
  origin: Coordinates;
  metres: number;
  onSelect: (coordinates: Coordinates, camera?: MapCamera) => void;
  stops: Marker[];
  selectedStop: Marker | undefined;
  onSelectStop: (id: string) => void;
  routeLines: RouteLines;
  coverage: Bounds | undefined;
  locationBoundary: boolean;
  network: ReferenceNetwork | undefined;
}

export default function ExplorerMap({
  city,
  initialCamera,
  placeCamera,
  baseline,
  walkingArea,
  origin,
  metres,
  onSelect,
  stops,
  selectedStop,
  onSelectStop,
  routeLines,
  coverage,
  locationBoundary,
  network,
}: ExplorerMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [tileWarning, setTileWarning] = useState(false);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showNetwork, setShowNetwork] = useState(true);
  const [suggestedCity, setSuggestedCity] = useState<CityView>();
  const visibleNetwork = showNetwork ? (network ?? emptyNetwork) : emptyNetwork;
  const visibleCoverage = showCoverage ? coverage : undefined;
  const readSelection = useEffectEvent(() => ({ origin, metres }));
  const selectFromMap = useEffectEvent(onSelect);
  const selectMapStop = useEffectEvent(onSelectStop);
  const readStops = useEffectEvent(() => stopFeatures(stops, selectedStop?.id));
  const readRoutes = useEffectEvent(() => routeLines);
  const readNetwork = useEffectEvent(() => visibleNetwork);
  const readCoverage = useEffectEvent(() => visibleCoverage);
  const readAnalysis = useEffectEvent(() =>
    analysisGeometry(baseline, walkingArea),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry recreates the map after a failed load.
  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      setWorkerUrl(workerUrl);
      instance = new MapLibreMap({
        container: container.current,
        style: city.style,
        center: initialCamera?.center ?? readSelection().origin,
        zoom: initialCamera?.zoom ?? city.zoom,
        bounds: initialCamera ? undefined : city.overview,
        fitBoundsOptions: { padding: 40 },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        attributionControl: { compact: true },
      });
    } catch {
      setStatus("failed");
      return;
    }
    map.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    instance.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    instance
      .getCanvas()
      .setAttribute(
        "aria-label",
        `${city.name} map. Use the arrow keys to pan, then choose Use map centre to set an origin.`,
      );

    const timeout = window.setTimeout(() => setStatus("failed"), 15_000);
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    instance.once("load", () => {
      window.clearTimeout(timeout);
      addCoverageLayer(instance, readCoverage());
      addAnalysisLayers(instance, readAnalysis());
      const selection = readSelection();
      addSelectionLayers(
        instance,
        catchmentFeatures(selection.origin, selection.metres),
      );
      addRouteLayers(instance, readRoutes());
      addReferenceLayer(instance, readNetwork());
      instance.addSource(stopsSource, { type: "geojson", data: readStops() });
      instance.addLayer({
        id: stopsLayer,
        type: "circle",
        source: stopsSource,
        layout: { "circle-sort-key": ["case", ["get", "selected"], 1, 0] },
        paint: {
          "circle-radius": ["case", ["get", "selected"], 8, 5.5],
          "circle-color": ["case", ["get", "selected"], "#0f6159", "#008679"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      instance.getCanvas().style.cursor = "crosshair";
      setStatus("ready");
    });
    instance.on("moveend", () => {
      const { center, zoom } = currentCamera(instance);
      const candidate = zoom >= 8 ? cityAt(center) : undefined;
      setSuggestedCity(candidate?.id !== city.id ? candidate : undefined);
    });
    instance.on("error", () => setTileWarning(true));
    instance.on("mouseenter", stopsLayer, () => {
      instance.getCanvas().style.cursor = "pointer";
    });
    instance.on("mouseleave", stopsLayer, () => {
      instance.getCanvas().style.cursor = "crosshair";
    });
    instance.on("click", ({ lngLat, point }) => {
      if (!instance.getSource(sourceId)) return;
      const feature = instance.queryRenderedFeatures(point, {
        layers: [stopsLayer],
      })[0];
      const id: unknown = feature?.properties?.stopId;
      if (typeof id === "string") {
        selectMapStop(id);
        return;
      }
      const { lng, lat } = lngLat.wrap();
      selectFromMap([lng, lat], currentCamera(instance));
    });

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [attempt, city, initialCamera]);

  useEffect(() => {
    if (placeCamera) map.current?.jumpTo(placeCamera);
  }, [placeCamera]);

  useEffect(() => {
    map.current
      ?.getSource<GeoJSONSource>(analysisSource)
      ?.setData(analysisGeometry(baseline, walkingArea));
  }, [baseline, walkingArea]);

  useEffect(() => {
    map.current
      ?.getSource<GeoJSONSource>(sourceId)
      ?.setData(catchmentFeatures(origin, metres));
  }, [origin, metres]);

  const selectedStopId = selectedStop?.id;
  useEffect(() => {
    map.current
      ?.getSource<GeoJSONSource>(stopsSource)
      ?.setData(stopFeatures(stops, selectedStopId));
  }, [stops, selectedStopId]);

  useEffect(() => {
    map.current?.getSource<GeoJSONSource>(routeSource)?.setData(routeLines);
  }, [routeLines]);

  useEffect(() => {
    map.current
      ?.getSource<GeoJSONSource>(referenceSource)
      ?.setData(visibleNetwork);
  }, [visibleNetwork]);

  useEffect(() => {
    map.current
      ?.getSource<GeoJSONSource>(coverageSource)
      ?.setData(coverageShape(visibleCoverage));
  }, [visibleCoverage]);

  function selectCentre() {
    if (!map.current) return;
    const camera = currentCamera(map.current);
    onSelect(camera.center, camera);
  }

  function reset() {
    map.current?.jumpTo({ center: city.center, zoom: city.zoom });
    onSelect(city.center);
  }

  function fitRoutes() {
    const bounds = new LngLatBounds(origin, origin);
    for (const feature of routeLines.features) {
      for (const [lon, lat] of feature.geometry.coordinates) {
        if (lon !== undefined && lat !== undefined) bounds.extend([lon, lat]);
      }
    }
    map.current?.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 15 });
  }

  function fitCoverage() {
    if (!coverage) return;
    setShowCoverage(true);
    map.current?.fitBounds(coverage, { padding: 44, duration: 0 });
  }

  function fitNetwork() {
    if (!network) return;
    const bounds = new LngLatBounds();
    for (const feature of network.features) {
      for (const [lon, lat] of feature.geometry.coordinates) {
        if (lon !== undefined && lat !== undefined) bounds.extend([lon, lat]);
      }
    }
    setShowNetwork(true);
    map.current?.fitBounds(bounds, { padding: 44, duration: 0 });
  }

  return (
    <>
      <div className="map-canvas">
        <div ref={container} className="h-full w-full" />
      </div>
      {status === "ready" ? (
        <>
          <div className="map-info">
            <div className="view-label">
              <MapPin size={16} aria-hidden="true" /> Origin map
              {!!stops.length && (
                <span className="map-legend">
                  <span />{" "}
                  {city.locations ? "Transit location" : "Boarding stop"}
                </span>
              )}
            </div>
            {suggestedCity && (
              <button
                type="button"
                className="area-suggestion"
                onClick={selectCentre}
              >
                Use {cityLabel(suggestedCity)} data here
              </button>
            )}
            {baseline && (
              <span className="view-label">
                <span className="comparison-dot" /> Saved A
              </span>
            )}
            {coverage && (
              <div className="coverage-controls">
                <button
                  type="button"
                  aria-pressed={showCoverage}
                  title={
                    locationBoundary
                      ? "Toggle the extent of published transit locations (not service coverage)"
                      : "Toggle the imported boarding-stop study boundary"
                  }
                  onClick={() => setShowCoverage((show) => !show)}
                >
                  <span
                    aria-hidden="true"
                    style={{ borderColor: coverageColor }}
                  />{" "}
                  {locationBoundary ? "Location extent" : "Data boundary"}
                </button>
                <button
                  type="button"
                  title={
                    locationBoundary
                      ? "Show the full extent of published transit locations"
                      : "Show the full boarding-stop study area"
                  }
                  onClick={fitCoverage}
                >
                  {locationBoundary ? "Fit location extent" : "Fit data area"}
                </button>
              </div>
            )}
            {city.source?.mapCredit && city.source.notice && coverage && (
              <a className="map-data-credit" href={city.source.notice}>
                {city.source.mapCredit}
              </a>
            )}
            {network && (
              <div className="coverage-controls">
                <button
                  type="button"
                  aria-pressed={showNetwork}
                  onClick={() => setShowNetwork((show) => !show)}
                >
                  <span aria-hidden="true" /> Network map
                </button>
                <button type="button" onClick={fitNetwork}>
                  Fit network
                </button>
              </div>
            )}
            {tileWarning && (
              <div className="tile-warning" role="status">
                Some map resources didn’t load.
              </div>
            )}
          </div>
          <div className="map-tools">
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => map.current?.zoomIn({ duration: 0 })}
            >
              <Plus size={20} />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => map.current?.zoomOut({ duration: 0 })}
            >
              <Minus size={20} />
            </button>
            <button
              type="button"
              aria-label="Reset map view and origin"
              title="Reset map view and origin"
              onClick={reset}
            >
              <RotateCcw size={17} />
            </button>
            {!!routeLines.features.length && (
              <button
                type="button"
                aria-label="Fit visible routes"
                title="Fit visible routes"
                onClick={fitRoutes}
              >
                <Frame size={19} />
              </button>
            )}
          </div>
          <button type="button" className="map-centre" onClick={selectCentre}>
            <Crosshair size={16} aria-hidden="true" /> Use map centre
          </button>
          {selectedStop && (
            <a className="map-stop-card" href="#selected-stop-details">
              <strong>{selectedStop.name}</strong>
              <span>
                {Math.round(selectedStop.metres)} m ·{" "}
                {city.locations ? "Location details" : "Stop details"}
              </span>
            </a>
          )}
          {!!routeLines.features.length && (
            <figure className="distance-legend">
              <figcaption className="font-bold">
                Distance on board{" "}
                <span className="sr-only">(not travel time)</span>
              </figcaption>
              <div
                className="distance-ramp"
                style={{
                  background: `linear-gradient(90deg, ${distanceColors.map(([metres, color]) => `${color} ${(metres / 12000) * 100}%`).join(", ")})`,
                }}
              />
              <div className="distance-ticks">
                {distanceLabels.map((label, index) => (
                  <span
                    key={label}
                    style={{
                      left: `${((distanceColors[index]?.[0] ?? 0) / 12000) * 100}%`,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </figure>
          )}
        </>
      ) : status === "loading" ? (
        <div className="map-message" role="status">
          Loading map…
        </div>
      ) : (
        <div className="map-message">
          <p role="alert">
            The map couldn’t load. Check your connection and browser WebGL
            support.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setTileWarning(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
    </>
  );
}

function currentCamera(map: MapLibreMap): MapCamera {
  const { lng, lat } = map.getCenter().wrap();
  return { center: [lng, lat], zoom: map.getZoom() };
}

function stopFeatures(
  stops: Marker[],
  selectedId: string | undefined,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: [...stops].reverse().map((stop) => ({
      type: "Feature",
      properties: { stopId: stop.id, selected: stop.id === selectedId },
      geometry: { type: "Point", coordinates: stop.coordinates },
    })),
  };
}

function addSelectionLayers(
  map: MapLibreMap,
  data: ReturnType<typeof catchmentFeatures>,
) {
  map.addSource(sourceId, { type: "geojson", data });
  const firstLabel = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: "catchment-fill",
      type: "fill",
      source: sourceId,
      filter: ["==", ["get", "kind"], "catchment"],
      paint: { "fill-color": "#7956d8", "fill-opacity": 0.19 },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: "catchment-outline",
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "catchment"],
      paint: {
        "line-color": "#6841ce",
        "line-width": 2.5,
        "line-dasharray": [2, 1],
      },
    },
    firstLabel,
  );
  map.addLayer({
    id: "selected-origin",
    type: "circle",
    source: sourceId,
    filter: ["==", ["get", "kind"], "origin"],
    paint: {
      "circle-radius": 8,
      "circle-color": "#6138c8",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 3,
    },
  });
}
