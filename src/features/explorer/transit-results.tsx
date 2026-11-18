import { ArrowUpRight, BusFront, MapPin } from "lucide-react";
import type { CityView } from "../../config/cities";
import type { NearbyStop, radiusCoverage } from "../../transit/accessibility";
import type { FeedSummary, TransitRoute } from "../../transit/model";

const labels = {
  bus: "Bus",
  rail: "Rail",
  tram: "Tram",
  metro: "Metro",
  ferry: "Ferry",
  other: "Other",
};
const routeSort = new Intl.Collator("en-IE", { numeric: true });

export function TransitResults({
  city,
  stops,
  routes,
  feeds,
  coverage,
  selected,
  onSelect,
}: {
  city: CityView;
  stops: NearbyStop[];
  routes: ReadonlyMap<string, TransitRoute>;
  feeds: FeedSummary[];
  coverage: ReturnType<typeof radiusCoverage>;
  selected: NearbyStop | undefined;
  onSelect: (id: string) => void;
}) {
  const services = routeList(
    new Set(stops.flatMap((stop) => stop.routeIds)),
    routes,
  );

  return (
    <>
      <p role="status">
        {stops.length} {stops.length === 1 ? "stop" : "stops"} ·{" "}
        {services.length} {services.length === 1 ? "service" : "services"} in
        the imported schedules
      </p>
      {coverage !== "inside" && (
        <p className="coverage-note">
          {coverage === "outside"
            ? "The origin is outside the study area."
            : "The radius extends beyond the study area."}{" "}
          Stops are only listed where the import has coverage.
        </p>
      )}
      {selected && (
        <div
          className="stop-detail"
          id="selected-stop-details"
          tabIndex={-1}
          aria-live="polite"
        >
          <h3>
            <MapPin size={15} aria-hidden="true" />
            {selected.name}
          </h3>
          <p>
            {selected.code && `Stop ${selected.code} · `}
            {Math.round(selected.metres)} m straight-line
          </p>
          <ServiceList routes={routeList(selected.routeIds, routes)} />
        </div>
      )}
      {stops.length > 0 ? (
        <details className="transit-results" open>
          <summary>Nearby stops ({stops.length})</summary>
          <ul className="result-scroll">
            {stops.map((stop) => (
              <li key={stop.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === stop.id}
                  onClick={() => onSelect(stop.id)}
                >
                  <span>
                    {stop.name}
                    {stop.code && <small> · {stop.code}</small>}
                  </span>
                  <span className="stop-distance">
                    {Math.round(stop.metres)} m
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="empty-results">
          No boarding stops from the imported feeds were found in the search
          radius.
        </p>
      )}
      {!!services.length && (
        <details className="transit-results">
          <summary>Available services ({services.length})</summary>
          <ServiceList routes={services} />
        </details>
      )}
      <details className="transit-results source-details">
        <summary>Coverage and data sources</summary>
        <p>
          Services may run only on certain dates, or require advance
          arrangements. No departure times or live status are shown. The dashed
          map boundary marks where we search for boarding stops. Routes may
          continue beyond it.
        </p>
        <ul>
          {feeds.map((feed) => (
            <li key={feed.id}>
              {feed.operator}: <time>{feed.serviceStart}</time> to{" "}
              <time>{feed.serviceEnd}</time>
            </li>
          ))}
        </ul>
        {city.source && (
          <p>
            Schedule data:{" "}
            <a href={city.source.url}>
              {city.source.publisher}{" "}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            , <a href={city.source.termsUrl}>{city.source.terms}</a>. Filtered
            and transformed for ViaMap. {city.source.scope}
            {city.source.notice && (
              <>
                {" "}
                <a href={city.source.notice}>Dataset notices</a>.
              </>
            )}
          </p>
        )}
      </details>
    </>
  );
}

export function TransitHeading({
  locationsOnly = false,
}: {
  locationsOnly?: boolean;
}) {
  return (
    <div className="panel-heading">
      <span className="tile-icon">
        <BusFront size={18} aria-hidden="true" />
      </span>
      <div>
        <h2 id="transit-title">
          {locationsOnly ? "Transit locations" : "Nearby transit"}
        </h2>
        <p>
          {locationsOnly
            ? "Official geographic data"
            : "Based on published schedules"}
        </p>
      </div>
    </div>
  );
}

function routeList(
  ids: Iterable<string>,
  routes: ReadonlyMap<string, TransitRoute>,
) {
  const list = [];
  for (const id of ids) {
    const route = routes.get(id);
    if (route) list.push(route);
  }
  return list.sort(
    (a, b) =>
      routeSort.compare(a.name, b.name) ||
      routeSort.compare(a.description, b.description),
  );
}

function ServiceList({ routes }: { routes: TransitRoute[] }) {
  return (
    <ul className="result-scroll service-list">
      {routes.map((route) => (
        <li key={route.id}>
          <span className="mode-chip">{labels[route.mode]}</span>
          <span>
            <strong>{route.name}</strong>
            {route.description && ` · ${route.description}`}
            <small>{route.operator}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
