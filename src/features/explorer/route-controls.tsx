import type { Mode, TransitRoute } from "../../transit/model";

const modeNames: Record<Mode, string> = {
  bus: "Bus",
  tram: "Tram",
  rail: "Rail",
  metro: "Metro",
  ferry: "Ferry",
  other: "Other",
};
const modes = Object.keys(modeNames) as Mode[];

export function RouteControls({
  routes,
  disabledModes,
  hiddenRoutes,
  toggleMode,
  toggleRoute,
  setAll,
  visible,
  mapped,
  loading,
  failed,
  retry,
}: {
  routes: TransitRoute[];
  disabledModes: ReadonlySet<Mode>;
  hiddenRoutes: ReadonlySet<string>;
  toggleMode: (mode: Mode) => void;
  toggleRoute: (id: string) => void;
  setAll: (show: boolean) => void;
  visible: number;
  mapped: number;
  loading: number;
  failed: number;
  retry: () => void;
}) {
  if (!routes.length) return null;
  const unavailable = visible - mapped - loading - failed;
  return (
    <section className="panel route-controls" aria-labelledby="routes-title">
      <h2 id="routes-title">Route lines</h2>
      <fieldset className="mode-toggles">
        <legend className="sr-only">Transport modes on map</legend>
        {modes
          .filter((mode) => routes.some((route) => route.mode === mode))
          .map((mode) => (
            <label key={mode}>
              <input
                type="checkbox"
                checked={!disabledModes.has(mode)}
                onChange={() => toggleMode(mode)}
              />
              {modeNames[mode]}
            </label>
          ))}
      </fieldset>
      <p role="status">
        {visible
          ? `${mapped} of ${visible} enabled services drawn${loading ? ` · ${loading} loading` : ""}`
          : "All route lines are hidden."}
      </p>
      {unavailable > 0 && (
        <p className="coverage-note">
          {unavailable} {unavailable === 1 ? "service has" : "services have"} no
          reliable geometry from these boarding stops.
        </p>
      )}
      {failed > 0 && (
        <p className="coverage-note">
          {failed} {failed === 1 ? "route couldn’t" : "routes couldn’t"} load.{" "}
          <button type="button" onClick={retry}>
            Retry route lines
          </button>
        </p>
      )}
      <details className="transit-results">
        <summary>Filter individual routes ({routes.length})</summary>
        <div className="route-bulk">
          <button type="button" onClick={() => setAll(true)}>
            Show all routes
          </button>
          <button type="button" onClick={() => setAll(false)}>
            Hide all routes
          </button>
        </div>
        <ul className="result-scroll route-toggles">
          {routes.map((route) => (
            <li key={route.id}>
              <label>
                <input
                  type="checkbox"
                  checked={
                    !hiddenRoutes.has(route.id) &&
                    !disabledModes.has(route.mode)
                  }
                  disabled={disabledModes.has(route.mode)}
                  onChange={() => toggleRoute(route.id)}
                />
                <span>
                  <strong>{route.name}</strong>
                  {route.description && ` · ${route.description}`}
                  <small>
                    {route.operator} · {modeNames[route.mode]}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>
      <p>
        Some trip variants may be missing where their published geometry cannot
        be matched to stops.
      </p>
    </section>
  );
}
