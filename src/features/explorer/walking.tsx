import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "../../geo/catchment";
import {
  fetchWalkingArea,
  fetchWalkingDistance,
  type WalkingArea,
} from "../../geo/walking";

export function Walking({
  origin,
  metres,
  area,
  onArea,
  target,
}: {
  origin: Coordinates;
  metres: number;
  area: WalkingArea | undefined;
  onArea: (area: WalkingArea | undefined) => void;
  target: { name: string; coordinates: Coordinates } | undefined;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [distance, setDistance] = useState<{
    metres: number;
    seconds: number;
  }>();
  const [distanceError, setDistanceError] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const lastRequest = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  async function calculate() {
    if (status === "loading" || Date.now() - lastRequest.current < 1000) return;
    lastRequest.current = Date.now();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    try {
      const geometry = await fetchWalkingArea(
        origin,
        metres,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      );
      if (controller.signal.aborted) return;
      onArea(geometry);
      setStatus("idle");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }
  async function measureToStop() {
    if (
      !target ||
      status === "loading" ||
      Date.now() - lastRequest.current < 1000
    )
      return;
    lastRequest.current = Date.now();
    const controller = new AbortController();
    request.current = controller;
    setDistanceError(false);
    setStatus("loading");
    try {
      const result = await fetchWalkingDistance(
        origin,
        target.coordinates,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      );
      if (!controller.signal.aborted) setDistance(result);
    } catch {
      if (!controller.signal.aborted) setDistanceError(true);
    } finally {
      if (!controller.signal.aborted) setStatus("idle");
    }
  }
  return (
    <>
      <p>
        Estimate how far {metres.toLocaleString("en-IE")} m gets you on the
        pedestrian network. The shaded area is approximate, not an audited
        accessibility map. The stop list and comparison still use straight-line
        distance.
      </p>
      <div className="analysis-actions">
        <button
          type="button"
          disabled={status === "loading"}
          onClick={calculate}
        >
          {area ? "Recalculate walking area" : "Calculate walking area"}
        </button>
        {area && (
          <button type="button" onClick={() => onArea(undefined)}>
            Hide walking area
          </button>
        )}
        {target && (
          <button
            type="button"
            disabled={status === "loading"}
            onClick={measureToStop}
          >
            Measure walk to selected stop
          </button>
        )}
      </div>
      <p>
        Calculating sends the origin and distance or selected stop coordinates
        to <a href="https://valhalla.openstreetmap.de/">Valhalla / FOSSGIS</a>{" "}
        using{" "}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
      </p>
      {status === "loading" && (
        <p role="status">Checking the pedestrian network…</p>
      )}
      {status === "error" && (
        <p role="alert">
          No walking area could be calculated. No straight-line estimate was
          substituted.
        </p>
      )}
      {area && (
        <p role="status">
          The amber shaded area on the map is the walking estimate.
        </p>
      )}
      {distanceError && (
        <p role="alert">No walking route could be calculated to this stop.</p>
      )}
      {distance && target && (
        <p role="status">
          {Math.round(distance.metres)} m · about{" "}
          {Math.max(1, Math.round(distance.seconds / 60))} min to {target.name}{" "}
          on the pedestrian network.
        </p>
      )}
    </>
  );
}
