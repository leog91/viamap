import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Coordinates } from "../../geo/catchment";
import type { NearbyStop } from "../../transit/accessibility";
import { findNearbyPoints } from "../../transit/accessibility";
import {
  type DirectTrip,
  findDirectTrips,
  isClockChange,
  loadTimetable,
} from "../../transit/direct-trips";
import type { TransitRoute } from "../../transit/model";

type Ride = DirectTrip & {
  label: string;
  fromName: string;
  toName: string;
  wait: number;
};
const maxRoutes = 12;

export function DirectJourney({
  city,
  boarding,
  destination,
  metres,
  routes,
}: {
  city: string;
  boarding: NearbyStop[];
  destination: Coordinates;
  metres: number;
  routes: ReadonlyMap<string, TransitRoute>;
}) {
  const choices = useMemo(
    () =>
      [...new Set(boarding.flatMap((stop) => stop.routeIds))]
        .flatMap((id) => {
          const route = routes.get(id);
          return route?.timetable ? [route] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true })),
    [boarding, routes],
  );
  const [routeId, setRouteId] = useState("");
  const [rides, setRides] = useState<Ride[]>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setMessage("");
    setRides(undefined);
    const form = new FormData(event.currentTarget);
    const date = String(form.get("day"));
    const [hour = 0, minute = 0] = String(form.get("time"))
      .split(":")
      .map(Number);
    const after = hour * 3600 + minute * 60;
    const selected = choices.filter(
      (route) => !routeId || route.id === routeId,
    );
    if (selected.length > maxRoutes) {
      setMessage(
        "Choose a route to limit the timetable download for this busy area.",
      );
      return;
    }
    const request = new AbortController();
    pending.current = request;
    setLoading(true);
    const boardIds = new Set(boarding.flatMap((stop) => stop.platformIds));
    const result: Ride[] = [];
    let clockChange = false;
    let failed = 0;
    try {
      for (let i = 0; i < selected.length; i += 4) {
        const rows = await Promise.allSettled(
          selected.slice(i, i + 4).map(async (route) => {
            const table = await loadTimetable(
              `/data/${city}/schedule/${route.timetable}`,
              route.id,
              AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
            );
            if (isClockChange(date, table.timezone)) {
              clockChange = true;
              return;
            }
            const targets = findNearbyPoints(
              Object.entries(table.places).map(([id, point]) => ({
                id,
                ...point,
              })),
              destination,
              metres,
            );
            const label = [route.name, route.description]
              .filter(Boolean)
              .join(" · ");
            for (const trip of findDirectTrips(
              [table],
              boardIds,
              new Set(targets.map(({ id }) => id)),
              date,
              after,
            )) {
              result.push({
                ...trip,
                label,
                wait: trip.departure - after,
                fromName: table.places[trip.from]?.name ?? trip.from,
                toName: table.places[trip.to]?.name ?? trip.to,
              });
            }
          }),
        );
        if (request.signal.aborted) return;
        failed += rows.filter((row) => row.status === "rejected").length;
      }
      if (clockChange || failed) {
        setMessage(
          [
            clockChange ? "Dates around a clock change are not supported." : "",
            failed ? "Some timetables couldn’t be checked." : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      if (failed < selected.length && !clockChange) {
        result.sort(
          (a, b) => a.arrival - b.arrival || a.departure - b.departure,
        );
        // Nearby alternate stops often produce several results for the same vehicle.
        const seen = new Set<string>();
        setRides(
          result
            .filter((trip) => {
              const key = `${trip.route}:${trip.arrival}:${trip.to}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 6),
        );
      }
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      <p>
        From saved A to current B. Enter the local date and the time you can be
        at a boarding stop. Looks for departures in the next four hours. No
        transfers, walking time, or live delays.
      </p>
      {choices.length ? (
        <form className="schedule-form" onSubmit={search}>
          <label>
            Date <input required type="date" name="day" />
          </label>
          <label>
            Ready to board <input required type="time" name="time" />
          </label>
          <label>
            Route{" "}
            <select
              value={routeId}
              onChange={(event) => setRouteId(event.target.value)}
              disabled={loading}
            >
              {choices.length <= maxRoutes ? (
                <option value="">All nearby routes</option>
              ) : (
                <option value="">Choose a route</option>
              )}
              {choices.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} · {route.description || route.operator}
                </option>
              ))}
            </select>
          </label>
          <div className="analysis-actions">
            <button
              type="submit"
              disabled={loading || (choices.length > maxRoutes && !routeId)}
            >
              Find direct trips
            </button>
          </div>
        </form>
      ) : (
        <p>No published timetable for a boarding stop near A.</p>
      )}
      {loading && <p role="status">Checking scheduled trips…</p>}
      {message && <p role="alert">{message}</p>}
      {rides && !rides.length && (
        <p role="status">
          No matching direct trips in the schedules checked. Try another date,
          route or radius.
        </p>
      )}
      {!!rides?.length && (
        <ul className="result-scroll direct-results">
          {rides.map((ride) => (
            <li
              key={`${ride.route}:${ride.from}:${ride.to}:${ride.departure}:${ride.arrival}`}
            >
              <strong>{ride.label}</strong>
              <p>
                {clock(ride.departure)} {ride.fromName} → {clock(ride.arrival)}{" "}
                {ride.toName}
              </p>
              <p>
                {Math.round(ride.wait / 60)} min after your ready time ·{" "}
                {Math.round((ride.arrival - ride.departure) / 60)} min on board
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function clock(seconds: number) {
  const hhmm = `${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}`;
  return seconds >= 86_400
    ? `${hhmm} (+${Math.floor(seconds / 86_400)}d)`
    : hhmm;
}
