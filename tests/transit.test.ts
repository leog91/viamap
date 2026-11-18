import { expect, test } from "bun:test";
import type { GtfsFeed, Row } from "../scripts/gtfs/archive";
import { mergeSharedStops } from "../scripts/gtfs/shared-stops";
import { transformFeed } from "../scripts/gtfs/transform";
import { gtfsSeconds } from "../scripts/gtfs/values";
import { findNearbyStops, radiusCoverage } from "../src/transit/accessibility";
import type { Bounds, TransitStop } from "../src/transit/model";

const bounds: Bounds = [-6.5, 53.2, -6, 53.5];
const source = {
  id: "fixture",
  url: "https://example.test/feed.zip",
  operator: "Test operator",
};

function fixture() {
  const tables: Record<string, Row[]> = {
    "agency.txt": [{ agency_name: "Test", agency_timezone: "Europe/Dublin" }],
    "stops.txt": [
      {
        stop_id: "A",
        stop_name: "Origin stop",
        stop_lon: "-6.2",
        stop_lat: "53.36",
      },
      {
        stop_id: "B",
        stop_name: "Drop-off only",
        stop_lon: "-6.21",
        stop_lat: "53.36",
      },
      {
        stop_id: "C",
        stop_name: "Outside study bounds",
        stop_lon: "-6.7",
        stop_lat: "53.36",
      },
      {
        stop_id: "D",
        stop_name: "Terminal",
        stop_lon: "-6.22",
        stop_lat: "53.36",
      },
      {
        stop_id: "E",
        stop_name: "Cancelled service stop",
        stop_lon: "-6.23",
        stop_lat: "53.36",
      },
    ],
    "routes.txt": [
      { route_id: "R", route_short_name: "7", route_type: "3" },
      { route_id: "X", route_short_name: "8", route_type: "3" },
    ],
    "calendar.txt": [
      {
        service_id: "normal",
        start_date: "20261116",
        end_date: "20261116",
        sunday: "0",
        monday: "1",
        tuesday: "0",
        wednesday: "0",
        thursday: "0",
        friday: "0",
        saturday: "0",
      },
      {
        service_id: "removed",
        start_date: "20261116",
        end_date: "20261116",
        sunday: "0",
        monday: "1",
        tuesday: "0",
        wednesday: "0",
        thursday: "0",
        friday: "0",
        saturday: "0",
      },
    ],
    "calendar_dates.txt": [
      { service_id: "normal", date: "20261118", exception_type: "1" },
      { service_id: "removed", date: "20261116", exception_type: "2" },
    ],
    "trips.txt": [
      {
        trip_id: "out",
        route_id: "R",
        service_id: "normal",
        direction_id: "0",
        shape_id: "s1",
      },
      {
        trip_id: "out2",
        route_id: "R",
        service_id: "normal",
        direction_id: "0",
        shape_id: "s1",
      },
      {
        trip_id: "back",
        route_id: "R",
        service_id: "normal",
        direction_id: "1",
        shape_id: "s2",
      },
      { trip_id: "removed", route_id: "X", service_id: "removed" },
    ],
    "stop_times.txt": [
      call("out", "D", 60),
      call("back", "A", 20),
      call("out", "B", 20, "1"),
      call("out", "A", 10),
      call("out2", "C", 30),
      call("out", "C", 30),
      call("back", "C", 10),
      call("out", "A", 40),
      call("back", "B", 30, "1"),
      call("removed", "E", 10),
      call("removed", "D", 20),
      call("out2", "B", 20, "1"),
      call("out2", "D", 60),
      call("out2", "A", 10),
      call("out2", "A", 40),
    ],
    "shapes.txt": [
      shape("s1", "-6.7", "2"),
      shape("s1", "-6.2", "1"),
      shape("s1", "-6.22", "3"),
      shape("s2", "-6.21", "3"),
      shape("s2", "-6.7", "1"),
      shape("s2", "-6.2", "2"),
    ],
  };
  const feed: GtfsFeed = {
    files: new Set(Object.keys(tables)),
    async *rows(file) {
      yield* tables[file] ?? [];
    },
  };
  return { feed, tables };
}

function call(trip: string, stop: string, order: number, pickup = "0"): Row {
  return {
    trip_id: trip,
    stop_id: stop,
    stop_sequence: String(order),
    pickup_type: pickup,
    arrival_time: "25:00:00",
    departure_time: "25:01:00",
  };
}
function shape(id: string, lon: string, order: string): Row {
  return {
    shape_id: id,
    shape_pt_lon: lon,
    shape_pt_lat: "53.36",
    shape_pt_sequence: order,
  };
}

test("trip-level boarding honors sequence, downstream alighting, and calendar exceptions", async () => {
  const result = await transformFeed(fixture().feed, source, bounds);
  expect(result.stops.map(({ id, routeIds }) => [id, routeIds])).toEqual([
    ["fixture:A", ["fixture:R"]],
  ]);
  expect(result.routes.map((route) => route.id)).toEqual(["fixture:R"]);
  expect(result.summary.serviceEnd).toBe("2026-11-18");
  expect(result.offline.services["fixture:normal"]?.exceptions).toEqual([
    { date: "20261118", added: true },
  ]);
});

test("deduplicates equivalent patterns but preserves directions, loops and downstream shapes", async () => {
  const { offline } = await transformFeed(fixture().feed, source, bounds);
  expect(offline.patterns.map((pattern) => pattern.direction).sort()).toEqual([
    "0",
    "1",
  ]);
  const outbound = offline.patterns.find(
    (pattern) => pattern.direction === "0",
  );
  expect(outbound?.calls.map(([id]) => id)).toEqual([
    "fixture:A",
    "fixture:B",
    "fixture:C",
    "fixture:A",
    "fixture:D",
  ]);
  expect(
    offline.shapes["fixture:s1"]?.map(([order, point]) => [order, ...point]),
  ).toEqual([
    [1, -6.2, 53.36],
    [2, -6.7, 53.36],
    [3, -6.22, 53.36],
  ]);
  const outwardTrips = offline.schedules.filter((schedule) =>
    schedule.tripId.startsWith("fixture:out"),
  );
  expect(new Set(outwardTrips.map((trip) => trip.patternId)).size).toBe(1);
  expect(outwardTrips[0]?.times[0]).toEqual([90_000, 90_060, ""]);
});

test("keeps service results when a referenced shape is missing", async () => {
  const { feed, tables } = fixture();
  tables["shapes.txt"] =
    tables["shapes.txt"]?.filter((row) => row.shape_id !== "s2") ?? [];
  const result = await transformFeed(feed, source, bounds);
  expect(result.missingShapes).toBe(1);
  expect(result.stops[0]?.routeIds).toEqual(["fixture:R"]);
  expect(result.offline.shapes["fixture:s2"]).toBeUndefined();
});

test("fails rather than dropping a broken trip reference", async () => {
  const { feed, tables } = fixture();
  tables["stop_times.txt"]?.push(call("missing", "A", 1));
  await expect(transformFeed(feed, source, bounds)).rejects.toThrow(
    "Invalid stop time: trip missing",
  );
});

test("GTFS accepts times beyond midnight but rejects invalid clock fields", () => {
  expect(gtfsSeconds("27:15:03")).toBe(98_103);
  expect(gtfsSeconds("")).toBeNull();
  expect(() => gtfsSeconds("25:90:00")).toThrow();
});

test("shared platforms merge only on identical upstream stop ID and position", () => {
  const a: TransitStop = {
    id: "a:1",
    name: "Test",
    code: "1",
    coordinates: [-6.2, 53.36],
    platformIds: ["a:1"],
    routeIds: ["a:9"],
  };
  const b: TransitStop = {
    ...a,
    id: "b:1",
    platformIds: ["b:1"],
    routeIds: ["b:7"],
  };
  const opposite: TransitStop = {
    ...a,
    id: "b:2",
    platformIds: ["b:2"],
    coordinates: [-6.2001, 53.36],
  };
  const merged = mergeSharedStops([a, b, opposite]);
  expect(merged.map((stop) => stop.platformIds)).toEqual([
    ["a:1", "b:1"],
    ["b:2"],
  ]);
  expect(merged[0]?.routeIds).toEqual(["a:9", "b:7"]);
  expect(a.platformIds).toEqual(["a:1"]);
});

test("nearby filtering uses metres, includes the boundary and sorts nearest first", () => {
  const stop: TransitStop = {
    id: "test",
    name: "Test",
    code: "",
    coordinates: [-6.203, 53.36],
    platformIds: ["test"],
    routeIds: [],
  };
  const origin = {
    ...stop,
    id: "origin",
    coordinates: [-6.2, 53.36],
  } satisfies TransitStop;
  const hits = findNearbyStops([stop, origin], origin.coordinates, 250);
  expect(hits.map(({ id }) => id)).toEqual(["origin", "test"]);
  expect(hits[1]?.metres).toBeCloseTo(199.1, 0);
  const boundary = hits[1]?.metres ?? 0;
  expect(findNearbyStops([stop], origin.coordinates, boundary)).toHaveLength(1);
  expect(findNearbyStops([stop], origin.coordinates, 100)).toHaveLength(0);
  expect(radiusCoverage(origin.coordinates, 500, bounds)).toBe("inside");
  expect(radiusCoverage([-6.499, 53.36], 500, bounds)).toBe("edge");
  expect(radiusCoverage([-6.51, 53.36], 500, bounds)).toBe("outside");
});
