import type { Coordinates } from "../../geo/catchment";

export function Comparison({
  baseline,
  onSave,
  onClear,
  a,
  b,
}: {
  baseline: Coordinates | undefined;
  onSave: () => void;
  onClear: () => void;
  a: { count: number; nearest?: number; services?: number } | undefined;
  b: { count: number; nearest?: number; services?: number } | undefined;
}) {
  return (
    <details
      className="panel analysis-panel"
      open={baseline ? true : undefined}
    >
      <summary>Compare two locations</summary>
      <p>
        Save this origin as A, then choose another point in the same dataset.
        Both use the current straight-line radius.
      </p>
      <div className="analysis-actions">
        <button type="button" onClick={onSave}>
          {baseline
            ? "Replace A with current origin"
            : "Save current origin as A"}
        </button>
        {baseline && (
          <button type="button" onClick={onClear}>
            Clear A
          </button>
        )}
      </div>
      {baseline && a && b && (
        <table className="comparison-table">
          <caption>Selected dataset only, not total transit coverage</caption>
          <thead>
            <tr>
              <th scope="col">Within radius</th>
              <th scope="col">Saved A</th>
              <th scope="col">Current B</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                {a.services === undefined
                  ? "Published locations"
                  : "Boarding stops"}
              </th>
              <td>{a.count}</td>
              <td>{b.count}</td>
            </tr>
            {a.services !== undefined && (
              <tr>
                <th scope="row">Scheduled route IDs</th>
                <td>{a.services}</td>
                <td>{b.services}</td>
              </tr>
            )}
            <tr>
              <th scope="row">Nearest match</th>
              <td>
                {a.nearest === undefined ? "—" : `${Math.round(a.nearest)} m`}
              </td>
              <td>
                {b.nearest === undefined ? "—" : `${Math.round(b.nearest)} m`}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </details>
  );
}
