import type { Coordinates } from "../../src/geo/catchment";
import { withinBounds } from "../../src/transit/accessibility";
import type {
  Bounds,
  FeedSummary,
  TransitRoute,
  TransitStop,
} from "../../src/transit/model";
import type { GtfsFeed } from "./archive";
import { readCalendars } from "./calendar";
import {
  coordinates,
  decimal,
  field,
  gtfsSeconds,
  routeMode,
  sequence,
  unique,
} from "./values";

type FeedSource = Pick<FeedSummary, "id" | "operator" | "url">;
type Stop = Omit<TransitStop, "routeIds" | "platformIds"> & {
  inCoverage: boolean;
};
type Trip = {
  route: TransitRoute;
  serviceId: string;
  direction: string | null;
  headsign: string;
  shape: string | null;
};
type Call = [
  stopId: string,
  sequence: number,
  pickup: number,
  dropOff: number,
  shapeDistance: number | null,
];
type TimedCall = [
  call: Call,
  arrival: number | null,
  departure: number | null,
  headsign: string,
];
type ShapePoint = [
  sequence: number,
  coordinates: Coordinates,
  shapeDistance: number | null,
];
type Pattern = {
  routeId: string;
  direction: string | null;
  headsign: string;
  shapeId: string | null;
  calls: Call[];
};

export async function transformFeed(
  feed: GtfsFeed,
  source: FeedSource,
  coverage: Bounds,
) {
  for (const name of [
    "agency.txt",
    "stops.txt",
    "routes.txt",
    "trips.txt",
    "stop_times.txt",
  ]) {
    if (!feed.files.has(name))
      throw new Error(`Missing required file: ${name}`);
  }
  if (
    !feed.files.has("calendar.txt") &&
    !feed.files.has("calendar_dates.txt")
  ) {
    throw new Error("At least one GTFS calendar file is required");
  }
  if (feed.files.has("frequencies.txt")) {
    throw new Error("Frequency-based feeds are not supported by this importer");
  }
  const namespace = (id: string) => `${source.id}:${id}`;
  const calendars = await readCalendars(feed);
  const agencies = new Map<string, string>();
  for await (const row of feed.rows("agency.txt", [
    "agency_name",
    "agency_timezone",
  ])) {
    unique(agencies, row.agency_id || "", field(row, "agency_timezone"));
    field(row, "agency_name");
  }
  const stops = new Map<string, Stop | null>();
  for await (const row of feed.rows("stops.txt", ["stop_id"])) {
    const id = field(row, "stop_id");
    if (row.location_type && row.location_type !== "0") {
      unique(stops, id, null);
      continue;
    }
    const point = coordinates(field(row, "stop_lon"), field(row, "stop_lat"));
    unique(stops, id, {
      id: namespace(id),
      name: field(row, "stop_name"),
      code: row.stop_code || "",
      coordinates: point,
      inCoverage: withinBounds(point, coverage),
    });
  }

  const routes = new Map<string, TransitRoute>();
  const routeTimezones = new Map<string, string>();
  for await (const row of feed.rows("routes.txt", ["route_id", "route_type"])) {
    const id = field(row, "route_id");
    const name = row.route_short_name || field(row, "route_long_name");
    const timezone = row.agency_id
      ? agencies.get(row.agency_id)
      : agencies.size === 1
        ? agencies.values().next().value
        : undefined;
    if (!timezone)
      throw new Error(`Route ${id} references an unknown or ambiguous agency`);
    routeTimezones.set(namespace(id), timezone);
    unique(routes, id, {
      id: namespace(id),
      name,
      description:
        row.route_long_name && row.route_long_name !== name
          ? row.route_long_name
          : "",
      mode: routeMode(field(row, "route_type")),
      operator: source.operator,
    });
  }

  const trips = new Map<string, Trip>();
  for await (const row of feed.rows("trips.txt", [
    "trip_id",
    "route_id",
    "service_id",
  ])) {
    const id = field(row, "trip_id");
    const route = routes.get(field(row, "route_id"));
    const serviceId = field(row, "service_id");
    if (!route || !calendars.has(serviceId))
      throw new Error(`Trip ${id} references an unknown route or service`);
    const direction = row.direction_id || null;
    if (direction !== null && direction !== "0" && direction !== "1")
      throw new Error(`Invalid direction on trip ${id}`);
    unique(trips, id, {
      route,
      serviceId,
      direction,
      headsign: row.trip_headsign || "",
      shape: row.shape_id || null,
    });
  }

  // Keep only trip IDs and sequence extrema in the first scan. GTFS does not
  // require rows to be grouped by trip or sorted by stop sequence.
  const firstBoard = new Map<string, number>();
  const lastAlight = new Map<string, number>();
  const stopTimeColumns = [
    "trip_id",
    "stop_id",
    "stop_sequence",
    "arrival_time",
    "departure_time",
  ];
  for await (const row of feed.rows("stop_times.txt", stopTimeColumns)) {
    const tripId = field(row, "trip_id");
    const trip = trips.get(tripId);
    const stopId = field(row, "stop_id");
    const stop = stops.get(stopId);
    if (!trip || !stop)
      throw new Error(
        `Invalid stop time: trip ${tripId}, boarding point ${stopId}`,
      );
    if (!calendars.get(trip.serviceId)?.start) continue;
    const order = sequence(field(row, "stop_sequence"), "stop_sequence");
    const pickup = boardingType(row.pickup_type);
    const dropOff = boardingType(row.drop_off_type);
    if (
      pickup !== 1 &&
      stop.inCoverage &&
      order < (firstBoard.get(tripId) ?? Infinity)
    )
      firstBoard.set(tripId, order);
    if (dropOff !== 1 && order > (lastAlight.get(tripId) ?? -1))
      lastAlight.set(tripId, order);
  }

  const callsByTrip = new Map<string, TimedCall[]>();
  for (const [id, order] of firstBoard) {
    if (order < (lastAlight.get(id) ?? -1)) callsByTrip.set(id, []);
  }
  for await (const row of feed.rows("stop_times.txt", stopTimeColumns)) {
    const calls = row.trip_id ? callsByTrip.get(row.trip_id) : undefined;
    if (!calls) continue;
    calls.push([
      [
        namespace(field(row, "stop_id")),
        sequence(field(row, "stop_sequence"), "stop_sequence"),
        boardingType(row.pickup_type),
        boardingType(row.drop_off_type),
        optionalDecimal(row.shape_dist_traveled),
      ],
      gtfsSeconds(row.arrival_time),
      gtfsSeconds(row.departure_time),
      row.stop_headsign || "",
    ]);
  }

  const stopsById = new Map(
    [...stops.values()].flatMap((stop) =>
      stop ? [[stop.id, stop] as const] : [],
    ),
  );
  const boardableRoutes = new Map<string, Set<string>>();
  const selectedRoutes = new Map<string, TransitRoute>();
  const patternIds = new Map<string, number>();
  const patterns: Pattern[] = [];
  const schedules = [];
  const usedShapes = new Map<string, ShapePoint[]>();
  const usedServices = new Set<string>();
  const usedStops = new Set<string>();

  for (const [tripId, calls] of callsByTrip) {
    const trip = trips.get(tripId);
    if (!trip) throw new Error(`Missing trip ${tripId}`);
    calls.sort((a, b) => a[0][1] - b[0][1]);
    if (calls.some(([call], i) => i > 0 && call[1] === calls[i - 1]?.[0][1]))
      throw new Error(`Duplicate stop sequence in ${tripId}`);
    const pattern: Pattern = {
      routeId: trip.route.id,
      direction: trip.direction,
      headsign: trip.headsign,
      shapeId: trip.shape ? namespace(trip.shape) : null,
      calls: calls.map(([call]) => call),
    };
    const key = JSON.stringify(pattern);
    let patternId = patternIds.get(key);
    if (patternId === undefined) {
      patternId = patterns.push(pattern) - 1;
      patternIds.set(key, patternId);
      const alight = lastAlight.get(tripId) ?? -1;
      for (const [stopId, order, pickup] of pattern.calls) {
        usedStops.add(stopId);
        if (
          pickup === 1 ||
          order >= alight ||
          !stopsById.get(stopId)?.inCoverage
        )
          continue;
        const ids = boardableRoutes.get(stopId) ?? new Set<string>();
        ids.add(trip.route.id);
        boardableRoutes.set(stopId, ids);
      }
      selectedRoutes.set(trip.route.id, trip.route);
      if (trip.shape && !usedShapes.has(trip.shape))
        usedShapes.set(trip.shape, []);
    }
    schedules.push({
      tripId: namespace(tripId),
      serviceId: namespace(trip.serviceId),
      patternId,
      times: calls.map(([, arrival, departure, headsign]) => [
        arrival,
        departure,
        headsign,
      ]),
    });
    usedServices.add(trip.serviceId);
    callsByTrip.delete(tripId);
  }

  if (usedShapes.size && feed.files.has("shapes.txt")) {
    for await (const row of feed.rows("shapes.txt", [
      "shape_id",
      "shape_pt_lon",
      "shape_pt_lat",
      "shape_pt_sequence",
    ])) {
      const points = usedShapes.get(field(row, "shape_id"));
      if (!points) continue;
      points.push([
        sequence(field(row, "shape_pt_sequence"), "shape_pt_sequence"),
        coordinates(field(row, "shape_pt_lon"), field(row, "shape_pt_lat")),
        optionalDecimal(row.shape_dist_traveled),
      ]);
    }
  }

  const shapes = [...usedShapes].flatMap(([id, points]) => {
    points.sort((a, b) => a[0] - b[0]);
    if (points.some(([order], i) => i > 0 && order === points[i - 1]?.[0]))
      throw new Error(`Duplicate shape sequence in ${id}`);
    return points.length >= 2 ? [[namespace(id), points] as const] : [];
  });
  const services = [...usedServices].map(
    (id) => [namespace(id), calendars.get(id)] as const,
  );
  const starts = services
    .flatMap(([, calendar]) => calendar?.start ?? [])
    .sort();
  const ends = services.flatMap(([, calendar]) => calendar?.end ?? []).sort();
  const start = starts[0];
  const end = ends.at(-1);
  if (!start || !end)
    throw new Error("No boardable service found in the study bounds");
  const summary: FeedSummary = {
    ...source,
    serviceStart: iso(start),
    serviceEnd: iso(end),
  };

  return {
    summary,
    routes: [...selectedRoutes.values()],
    stops: [...boardableRoutes].map(([id, ids]): TransitStop => {
      const stop = stopsById.get(id);
      if (!stop) throw new Error(`Missing selected stop ${id}`);
      const { name, code, coordinates } = stop;
      return {
        id,
        name,
        code,
        coordinates,
        platformIds: [id],
        routeIds: [...ids].sort(),
      };
    }),
    offline: {
      schemaVersion: 1,
      summary,
      patterns,
      schedules,
      services: Object.fromEntries(services),
      routeTimezones: Object.fromEntries(
        [...selectedRoutes].map(([id]) => [id, routeTimezones.get(id)]),
      ),
      stops: [...usedStops].map((id) => {
        const stop = stopsById.get(id);
        if (!stop) throw new Error(`Missing downstream stop ${id}`);
        return {
          id,
          coordinates: stop.coordinates,
          name: stop.name,
          code: stop.code,
        };
      }),
      shapes: Object.fromEntries(shapes),
    },
    missingShapes: usedShapes.size - shapes.length,
    patternsWithoutShape: patterns.filter((pattern) => !pattern.shapeId).length,
  };
}

function boardingType(value: string | undefined) {
  if (!value) return 0;
  if (!/^[0-3]$/.test(value))
    throw new Error(`Invalid pickup or drop-off type: ${value}`);
  return Number(value);
}

function optionalDecimal(value: string | undefined) {
  return value ? decimal(value, "shape_dist_traveled") : null;
}

function iso(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}
