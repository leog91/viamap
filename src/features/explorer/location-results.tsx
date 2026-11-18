import type { CityView } from "../../config/cities";
import type { radiusCoverage } from "../../transit/accessibility";
import type { NearbyLocation } from "../../transit/locations";

export function LocationResults({
  source,
  points,
  coverage,
  selected,
  onSelect,
}: {
  source: CityView["source"];
  points: NearbyLocation[];
  coverage: ReturnType<typeof radiusCoverage> | undefined;
  selected: NearbyLocation | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <p role="status">
        {points.length} published{" "}
        {points.length === 1 ? "location" : "locations"} within the radius
      </p>
      {coverage && coverage !== "inside" && (
        <p className="coverage-note">
          {coverage === "outside"
            ? "The origin is outside the published location extent."
            : "The search radius extends beyond the published location extent."}{" "}
          This doesn’t mean there is no transit there.
        </p>
      )}
      {selected && (
        <div
          className="stop-detail"
          id="selected-stop-details"
          tabIndex={-1}
          aria-live="polite"
        >
          <h3>{selected.name}</h3>
          <p>
            {selected.kind} · {Math.round(selected.metres)} m straight-line
          </p>
          {!!selected.detail && <p>{selected.detail}</p>}
        </div>
      )}
      {!!points.length && (
        <details className="transit-results" open>
          <summary>Nearby locations ({points.length})</summary>
          <ul className="result-scroll">
            {points.map((point) => (
              <li key={point.id}>
                <button
                  type="button"
                  aria-pressed={point.id === selected?.id}
                  onClick={() => onSelect(point.id)}
                >
                  <span>
                    {point.name} <small>· {point.kind}</small>
                  </span>
                  <span className="stop-distance">
                    {Math.round(point.metres)} m
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {source && (
        <p className="location-credit">
          Source: <a href={source.url}>{source.publisher}</a> ·{" "}
          <a href={source.termsUrl}>{source.terms}</a>. Filtered and formatted
          for ViaMap.
        </p>
      )}
    </>
  );
}
