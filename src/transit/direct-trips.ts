import type { Coordinates } from "../geo/catchment";

export type Timetable = {
  route: string;
  timezone: string;
  dates: Record<string, string[]>;
  places: Record<string, { name: string; coordinates: Coordinates }>;
  patterns: {
    calls: [platform: string, pickup: number, dropOff: number][];
    runs: [
      service: string,
      arrival: (number | null)[],
      departure: (number | null)[],
    ][];
  }[];
};

export type DirectTrip = {
  route: string;
  from: string;
  to: string;
  departure: number;
  arrival: number;
};
export const directWindow = 4 * 3600;

export function findDirectTrips(
  timetables: Timetable[],
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
  date: string,
  after: number,
): DirectTrip[] {
  const day = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(day.valueOf()) ||
    day.toISOString().slice(0, 10) !== date
  )
    return [];
  const previous = new Date(day.valueOf() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const following = new Date(day.valueOf() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const found = new Map<string, DirectTrip>();
  for (const { route, dates, patterns } of timetables) {
    for (const { calls, runs } of patterns) {
      const boards: [string, number][] = [];
      const alights: [string, number][] = [];
      calls.forEach(([id, pickup, dropOff], i) => {
        if (pickup === 0 && from.has(id)) boards.push([id, i]);
        if (dropOff === 0 && to.has(id)) alights.push([id, i]);
      });
      if (!boards.length || !alights.length) continue;
      for (const [service, arrivals, departures] of runs) {
        for (const [serviceDate, dayShift] of [
          [date, 0],
          [previous, -86_400],
          [following, 86_400],
        ] as const) {
          if (!dates[service]?.includes(serviceDate)) continue;
          for (const [board, i] of boards) {
            const dep = departures[i];
            if (dep == null) continue;
            const departure = dep + dayShift;
            if (departure < after || departure >= after + directWindow)
              continue;
            for (const [alight, j] of alights) {
              const arr = arrivals[j];
              if (j <= i || board === alight || arr == null || arr <= dep)
                continue;
              const arrival = arr + dayShift;
              const trip = {
                route,
                from: board,
                to: alight,
                departure,
                arrival,
              };
              found.set(JSON.stringify(trip), trip);
            }
          }
        }
      }
    }
  }
  return [...found.values()].sort(
    (a, b) => a.arrival - b.arrival || a.departure - b.departure,
  );
}

export function isClockChange(date: string, timezone: string) {
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start)) return true;
  const clock = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const offset = (time: number) =>
    clock.formatToParts(time).find((part) => part.type === "timeZoneName")
      ?.value;
  return offset(start - 86_400_000) !== offset(start + 86_400_000);
}

export async function loadTimetable(
  url: string,
  route: string,
  signal: AbortSignal,
): Promise<Timetable> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body)
    throw new Error(`Timetable returned HTTP ${response.status}`);
  // Vite serves .json.gz as Content-Encoding gzip; other static hosts may
  // serve the archive itself. Browsers already decode HTTP content encoding.
  const bytes = new Uint8Array(await response.arrayBuffer());
  const result = (
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(
          new Blob([bytes])
            .stream()
            .pipeThrough(new DecompressionStream("gzip")),
        ).json()
      : JSON.parse(new TextDecoder().decode(bytes))
  ) as Timetable;
  if (
    result.route !== route ||
    typeof result.timezone !== "string" ||
    !Array.isArray(result.patterns) ||
    !result.dates ||
    typeof result.dates !== "object" ||
    !result.places ||
    typeof result.places !== "object"
  )
    throw new Error("Unrecognized timetable");
  return result;
}
