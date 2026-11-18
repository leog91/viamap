import { ClientOnly } from "@tanstack/react-router";
import {
  CircleHelp,
  Crosshair,
  Flag,
  MapPin,
  Radio,
  Route,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { type CityView, cities, cityAt, cityLabel } from "../../config/cities";
import { dublin } from "../../config/dublin";
import { type Coordinates, radiusMetres } from "../../geo/catchment";
import type { WalkingArea } from "../../geo/walking";
import {
  findNearbyPoints,
  findNearbyStops,
  type NearbyStop,
  radiusCoverage,
} from "../../transit/accessibility";
import { loadLocations, locationExtent } from "../../transit/locations";
import type { Mode, TransitRoute } from "../../transit/model";
import { loadReferenceNetworks } from "../../transit/reference-network";
import { makeRouteLines } from "../../transit/route-lines";
import { Comparison } from "./comparison";
import { DirectJourney } from "./direct-journey";
import type { MapCamera } from "./explorer-map";
import { LocationResults } from "./location-results";
import { PlaceSearch } from "./place-search";
import { RouteControls } from "./route-controls";
import { TransitHeading, TransitResults } from "./transit-results";
import { useRouteGeometries } from "./use-route-geometries";
import { useDataset, useTransit } from "./use-transit";
import { Walking } from "./walking";

const ExplorerMap = lazy(() => import("./explorer-map"));
const presets = [250, 500, 1000];
const noStops: NearbyStop[] = [];
const routeSort = new Intl.Collator("en-IE", { numeric: true });

type CitySelection = {
  city: CityView;
  origin?: Coordinates;
  metres?: number;
  camera?: MapCamera;
};

export function Explorer() {
  const [selection, setSelection] = useState<CitySelection>({ city: dublin });
  const { city } = selection;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Route size={21} aria-hidden="true" />
          </span>
          <span>
            via<span className="brand-accent">map</span>
            <small>TRANSPORT EXPLORER</small>
          </span>
        </div>
        <label className="city-badge">
          <MapPin size={15} aria-hidden="true" />
          <span className="sr-only">City</span>
          <select
            value={city.id}
            onChange={(event) => {
              const next = cities.find(({ id }) => id === event.target.value);
              if (next) setSelection({ city: next });
            }}
          >
            {cities.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <CityExplorer
        key={city.id}
        selection={selection}
        onCityChange={setSelection}
      />
    </div>
  );
}

function CityExplorer({
  selection,
  onCityChange,
}: {
  selection: CitySelection;
  onCityChange: (selection: CitySelection) => void;
}) {
  const { city, camera } = selection;
  const [origin, setOrigin] = useState<Coordinates>(
    selection.origin ?? city.center,
  );
  const [metres, setMetres] = useState(
    selection.metres ?? radiusMetres.initial,
  );
  const [stopId, setStopId] = useState<string>();
  const [baseline, setBaseline] = useState<Coordinates>();
  const [placeCamera, setPlaceCamera] = useState<MapCamera>();
  const [walking, setWalking] = useState<{ key: string; area: WalkingArea }>();
  const walkingKey = `${origin.join(",")}:${metres}`;
  const walkingArea = walking?.key === walkingKey ? walking.area : undefined;
  const [disabledModes, setDisabledModes] = useState<ReadonlySet<Mode>>(
    () => new Set(),
  );
  const [hiddenRoutes, setHiddenRoutes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { state: transit, retry } = useTransit(city.transitIndex);
  const index = transit.status === "ready" ? transit.index : undefined;
  const { state: networkState, retry: retryNetwork } = useDataset(
    city.network?.urls,
    loadReferenceNetworks,
  );
  const network =
    networkState.status === "ready" ? networkState.index : undefined;
  const networkLegend = new Map(
    network?.features.map(({ properties }) => [
      properties.name,
      properties.color,
    ]),
  );
  const { state: locations, retry: retryLocations } = useDataset(
    city.locations,
    loadLocations,
  );
  const publishedExtent = useMemo(
    () =>
      locations.status === "ready"
        ? locationExtent(locations.index)
        : undefined,
    [locations],
  );
  const nearbyLocations = useMemo(
    () =>
      locations.status === "ready"
        ? findNearbyPoints(locations.index, origin, metres)
        : [],
    [locations, origin, metres],
  );
  const selectedLocation = nearbyLocations.find((point) => point.id === stopId);
  const today = new Date().toISOString().slice(0, 10);
  const stale =
    index?.feeds.filter(
      (feed) => today < feed.serviceStart || today > feed.serviceEnd,
    ) ?? [];
  const nearby = useMemo(
    () => (index ? findNearbyStops(index.stops, origin, metres) : noStops),
    [index, origin, metres],
  );
  const routes = useMemo(
    () => new Map(index?.routes.map((route) => [route.id, route])),
    [index],
  );
  const selected = nearby.find((stop) => stop.id === stopId);
  const baselineStops = useMemo(
    () =>
      index && baseline
        ? findNearbyStops(index.stops, baseline, metres)
        : noStops,
    [index, baseline, metres],
  );
  const locationsIndex =
    locations.status === "ready" ? locations.index : undefined;
  const comparison = useMemo(() => {
    if (!baseline) return {};
    if (index) {
      return { a: summarize(baselineStops), b: summarize(nearby) };
    }
    if (locationsIndex) {
      const saved = findNearbyPoints(locationsIndex, baseline, metres);
      return {
        a: { count: saved.length, nearest: saved[0]?.metres },
        b: {
          count: nearbyLocations.length,
          nearest: nearbyLocations[0]?.metres,
        },
      };
    }
    return {};
  }, [
    baseline,
    baselineStops,
    index,
    locationsIndex,
    metres,
    nearby,
    nearbyLocations,
  ]);
  const available = useMemo(() => {
    const list: TransitRoute[] = [];
    for (const id of new Set(nearby.flatMap((stop) => stop.routeIds))) {
      const route = routes.get(id);
      if (route) list.push(route);
    }
    return list.sort(
      (a, b) =>
        routeSort.compare(a.name, b.name) ||
        routeSort.compare(a.description, b.description),
    );
  }, [nearby, routes]);
  const enabled = useMemo(
    () =>
      available.filter(
        (route) =>
          !disabledModes.has(route.mode) && !hiddenRoutes.has(route.id),
      ),
    [available, disabledModes, hiddenRoutes],
  );
  const geometry = useRouteGeometries(enabled, city.geometryDirectory ?? "");
  const { lines, mapped } = useMemo(
    () =>
      makeRouteLines(
        geometry.data,
        new Set(nearby.flatMap((stop) => stop.platformIds)),
      ),
    [geometry.data, nearby],
  );

  function setAllRoutes(show: boolean) {
    if (show) {
      setDisabledModes(new Set());
      setHiddenRoutes(new Set());
    } else {
      setHiddenRoutes(
        (previous) =>
          new Set([...previous, ...available.map((route) => route.id)]),
      );
    }
  }

  function selectOrigin(coordinates: Coordinates, camera?: MapCamera) {
    const next = cityAt(coordinates);
    if (next && next.id !== city.id) {
      onCityChange({ city: next, origin: coordinates, metres, camera });
      return;
    }
    setStopId(undefined);
    setOrigin(coordinates);
  }

  function selectPlace(coordinates: Coordinates) {
    const camera = { center: coordinates, zoom: 15 };
    selectOrigin(coordinates, camera);
    setPlaceCamera(camera);
  }

  return (
    <main className="workspace">
      <aside className="sidebar" aria-labelledby="explorer-title">
        <div className="intro">
          <span className="eyebrow">
            <Radio size={15} aria-hidden="true" />{" "}
            {cityLabel(city).toUpperCase()} EXPLORER
          </span>
          <h1 id="explorer-title">
            How connected
            <br className="desktop-break" /> is this spot?
          </h1>
          <p>
            Pick a point on the map to see the area within reach of your
            selected radius.
          </p>
          <a className="map-jump" href="#explorer-map">
            Jump to map
          </a>
        </div>

        <PlaceSearch onSelect={selectPlace} />

        {!cityAt(origin) && (
          <p className="data-flag" role="status">
            No ViaMap dataset for the selected origin. Choose a supported city
            or select a point in one of its study areas.
          </p>
        )}

        <div className="data-flag" role="status">
          <Flag size={17} aria-hidden="true" />
          <div>
            <strong>
              {stale.length
                ? "Schedule dates don’t cover today"
                : city.network && !city.transitIndex
                  ? "Network map — no travel times"
                  : city.locations && !city.transitIndex
                    ? "Locations only"
                    : "Limited operator coverage"}
            </strong>
            <p>
              {stale.length
                ? `${stale.map((feed) => feed.operator).join(", ")}. Results may be out of date. `
                : ""}
              {city.source?.scope}
            </p>
          </div>
        </div>

        {city.network && (
          <section
            className="panel network-panel"
            aria-labelledby="network-title"
          >
            <h2 id="network-title">Reference lines</h2>
            <p>
              Dashed lines show published alignments, not routes reachable from
              your origin.
            </p>
            {networkState.status === "loading" && (
              <p role="status">Loading reference lines…</p>
            )}
            {networkState.status === "error" && (
              <>
                <p role="alert">The reference lines couldn’t be loaded.</p>
                <button
                  type="button"
                  className="retry-transit"
                  onClick={retryNetwork}
                >
                  Retry reference lines
                </button>
              </>
            )}
            {!!networkLegend.size && (
              <ul className="network-legend">
                {[...networkLegend]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, color]) => (
                    <li key={name}>
                      <span style={{ borderColor: color }} aria-hidden="true" />
                      {name}
                    </li>
                  ))}
              </ul>
            )}
            {city.network.sources.map((source) => (
              <p key={source.url}>
                <a
                  className="font-semibold text-accent underline"
                  href={source.sourceUrl}
                >
                  {source.name} source
                </a>
                {" · "}
                {source.description}
              </p>
            ))}
          </section>
        )}
        <section className="panel" aria-labelledby="origin-title">
          <div className="panel-heading">
            <span className="tile-icon">
              <Crosshair size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="origin-title">Selected origin</h2>
              <p>Click or tap to move the point</p>
            </div>
          </div>
          <output className="coordinates" aria-label="Selected coordinates">
            {formatCoordinate(origin[1], "N", "S")} <span>·</span>{" "}
            {formatCoordinate(origin[0], "E", "W")}
          </output>
        </section>

        <section className="panel" aria-labelledby="radius-title">
          <div className="radius-heading">
            <h2 id="radius-title">
              <label htmlFor="radius">Search radius</label>
            </h2>
            <output htmlFor="radius" className="radius-value">
              {metres.toLocaleString("en-IE")} <span>m</span>
            </output>
          </div>
          <input
            id="radius"
            className="radius-slider"
            type="range"
            min={radiusMetres.min}
            max={radiusMetres.max}
            step={radiusMetres.step}
            value={metres}
            aria-valuetext={`${metres} metres`}
            onChange={(event) => setMetres(event.currentTarget.valueAsNumber)}
          />
          <div className="range-labels">
            <span>100 m</span>
            <span>2 km</span>
          </div>
          <fieldset className="presets">
            <legend className="sr-only">Radius presets</legend>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={metres === preset}
                onClick={() => setMetres(preset)}
              >
                {preset === 1000 ? "1 km" : `${preset} m`}
              </button>
            ))}
          </fieldset>
        </section>

        <p className="distance-note">
          <CircleHelp size={16} aria-hidden="true" />{" "}
          <span>
            This is a straight-line radius, not walking distance or travel time.
          </span>
        </p>
        <Comparison
          baseline={baseline}
          onSave={() => setBaseline(origin)}
          onClear={() => setBaseline(undefined)}
          a={comparison.a}
          b={comparison.b}
        />
        {city.transitIndex && (
          <details className="panel analysis-panel">
            <summary>Scheduled direct trips</summary>
            {baseline?.some((value, i) => value !== origin[i]) ? (
              <DirectJourney
                key={`${baseline.join(",")}:${walkingKey}`}
                city={city.id}
                boarding={baselineStops}
                destination={origin}
                metres={metres}
                routes={routes}
              />
            ) : (
              <p>
                Save an origin as A in comparison, then choose a different
                destination B on the map or in place search.
              </p>
            )}
          </details>
        )}
        <details className="panel analysis-panel">
          <summary>Walking catchment</summary>
          <Walking
            key={`${walkingKey}:${stopId ?? ""}`}
            origin={origin}
            metres={metres}
            area={walkingArea}
            target={selected ?? selectedLocation}
            onArea={(area) =>
              setWalking(area ? { key: walkingKey, area } : undefined)
            }
          />
        </details>

        {!!available.length && (
          <RouteControls
            routes={available}
            disabledModes={disabledModes}
            hiddenRoutes={hiddenRoutes}
            toggleMode={(mode) =>
              setDisabledModes((previous) => toggled(previous, mode))
            }
            toggleRoute={(id) =>
              setHiddenRoutes((previous) => toggled(previous, id))
            }
            setAll={setAllRoutes}
            visible={enabled.length}
            mapped={mapped.size}
            loading={geometry.loading}
            failed={geometry.failed}
            retry={geometry.retry}
          />
        )}
        <section className="panel nearby-panel" aria-labelledby="transit-title">
          <TransitHeading
            locationsOnly={!city.transitIndex && !!city.locations}
          />
          {city.travelInfo && (
            <p>
              <a
                className="font-semibold text-accent underline"
                href={city.travelInfo.url}
              >
                {city.travelInfo.label}
              </a>
            </p>
          )}
          {city.locations && locations.status === "loading" && (
            <p role="status">Loading published locations…</p>
          )}
          {city.locations && locations.status === "error" && (
            <>
              <p role="alert">Location data couldn’t be loaded.</p>
              <button
                type="button"
                className="retry-transit"
                onClick={retryLocations}
              >
                Retry location data
              </button>
            </>
          )}
          {city.locations && locations.status === "ready" && (
            <LocationResults
              source={city.locationSource ?? city.source}
              points={nearbyLocations}
              coverage={
                publishedExtent
                  ? radiusCoverage(origin, metres, publishedExtent)
                  : undefined
              }
              selected={selectedLocation}
              onSelect={setStopId}
            />
          )}
          {city.transitIndex && transit.status === "loading" && (
            <p role="status">Loading transit data…</p>
          )}
          {transit.status === "error" && (
            <>
              <p role="alert">
                Transit data couldn’t be loaded. You can still use the map and
                radius.
              </p>
              <button className="retry-transit" type="button" onClick={retry}>
                Retry transit data
              </button>
            </>
          )}
          {index && city.source && (
            <TransitResults
              city={city}
              stops={nearby}
              routes={routes}
              feeds={index.feeds}
              coverage={radiusCoverage(origin, metres, index.coverage)}
              selected={selected}
              onSelect={setStopId}
            />
          )}
        </section>
      </aside>
      <section
        className="map-frame"
        id="explorer-map"
        tabIndex={-1}
        aria-label="Explore the map"
      >
        <ClientOnly fallback={<MapLoading />}>
          <Suspense fallback={<MapLoading />}>
            <ExplorerMap
              city={city}
              initialCamera={camera}
              placeCamera={placeCamera}
              baseline={baseline}
              walkingArea={walkingArea}
              origin={origin}
              metres={metres}
              onSelect={selectOrigin}
              stops={[...nearby, ...nearbyLocations]}
              selectedStop={selected ?? selectedLocation}
              onSelectStop={setStopId}
              routeLines={lines}
              coverage={index?.coverage ?? publishedExtent}
              locationBoundary={!index && !!publishedExtent}
              network={network}
            />
          </Suspense>
        </ClientOnly>
      </section>
    </main>
  );
}

function summarize(stops: NearbyStop[]) {
  return {
    count: stops.length,
    nearest: stops[0]?.metres,
    services: new Set(stops.flatMap((stop) => stop.routeIds)).size,
  };
}

function toggled<T>(previous: ReadonlySet<T>, value: T) {
  const next = new Set(previous);
  if (!next.delete(value)) next.add(value);
  return next;
}

function MapLoading() {
  return (
    <div className="map-message" role="status">
      Loading map…
    </div>
  );
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
}
