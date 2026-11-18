import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Timetable } from "../../src/transit/direct-trips";
import type { TransitRoute } from "../../src/transit/model";
import type { transformFeed } from "./transform";

type Offline = Awaited<ReturnType<typeof transformFeed>>["offline"];
const days = 86_400_000;

export async function exportTimetables(
  offline: Offline,
  routes: TransitRoute[],
  directory: string,
) {
  const byRoute = new Map<string, Timetable>();
  const places = new Map(offline.stops.map((stop) => [stop.id, stop]));
  const active = new Map(
    Object.entries(offline.services).map(([id, service]) => [
      id,
      datesFor(service),
    ]),
  );
  const patterns = offline.patterns.map((p) => ({
    calls: p.calls.map(
      ([
        id,
        ,
        pickup,
        dropOff,
      ]): Timetable["patterns"][number]["calls"][number] => [
        id,
        pickup,
        dropOff,
      ],
    ),
    runs: [] as Timetable["patterns"][number]["runs"],
  }));
  for (const schedule of offline.schedules) {
    const pattern = patterns[schedule.patternId];
    if (!pattern) throw new Error(`No pattern for ${schedule.tripId}`);
    const arrivals = schedule.times.map(([arrival]) =>
      typeof arrival === "number" ? arrival : null,
    );
    const departures = schedule.times.map(([, departure]) =>
      typeof departure === "number" ? departure : null,
    );
    pattern.runs.push([schedule.serviceId, arrivals, departures]);
  }
  for (const [i, { routeId }] of offline.patterns.entries()) {
    const pattern = patterns[i];
    if (!pattern?.runs.length) continue;
    let data = byRoute.get(routeId);
    if (!data) {
      const timezone = offline.routeTimezones[routeId];
      if (!timezone) continue;
      data = { route: routeId, timezone, dates: {}, places: {}, patterns: [] };
      byRoute.set(routeId, data);
    }
    data.patterns.push(pattern);
    for (const [id] of pattern.calls) {
      if (data.places[id]) continue;
      const stop = places.get(id);
      if (!stop) throw new Error(`No coordinates for stop ${id}`);
      data.places[id] = { name: stop.name, coordinates: stop.coordinates };
    }
    for (const [id] of pattern.runs) data.dates[id] ??= active.get(id) ?? [];
  }
  for (const route of routes) {
    const data = byRoute.get(route.id);
    if (!data) continue;
    const content = JSON.stringify(data);
    const hash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 24);
    route.timetable = `t-${hash}.json.gz`;
    const compressed = Bun.gzipSync(content);
    if (compressed.byteLength > 25 * 1024 * 1024)
      throw new Error(`Timetable too large for a static asset: ${route.id}`);
    await Bun.write(join(directory, route.timetable), compressed);
  }
}

function datesFor(service: Offline["services"][string]): string[] {
  const result = new Set<string>();
  if (service?.rule) {
    const { start, end, days: weekdays } = service.rule;
    for (
      let time = Date.parse(iso(start));
      time <= Date.parse(iso(end));
      time += days
    ) {
      const date = new Date(time);
      if (weekdays[date.getUTCDay()])
        result.add(date.toISOString().slice(0, 10));
    }
  }
  for (const exception of service?.exceptions ?? []) {
    if (exception.added) result.add(iso(exception.date));
    else result.delete(iso(exception.date));
  }
  return [...result].sort();
}

function iso(key: string) {
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;
}
