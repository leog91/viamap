import { expect, test } from "bun:test";
import { parsePlaces } from "../src/geo/place-search";
import { parseWalkingArea } from "../src/geo/walking";
import {
  findDirectTrips,
  isClockChange,
  type Timetable,
} from "../src/transit/direct-trips";
import type { TransitIndex } from "../src/transit/model";

test("place search normalizes provider points and ignores unusable coordinates", () => {
  expect(
    parsePlaces({
      features: [
        {
          geometry: { type: "Point", coordinates: [4.89, 52.34] },
          properties: { name: "Europaplein", city: "Amsterdam" },
        },
        {
          geometry: { type: "Point", coordinates: [0, 91] },
          properties: { name: "Invalid" },
        },
      ],
    }),
  ).toEqual([
    {
      key: "4.89,52.34",
      label: "Europaplein, Amsterdam",
      coordinates: [4.89, 52.34],
    },
  ]);
});

test("walking response requires a real polygon, not a radius or a failure", () => {
  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  };
  expect(
    parseWalkingArea({ type: "FeatureCollection", features: [{ geometry }] })
      .features[0]?.geometry,
  ).toEqual(geometry);
  expect(() =>
    parseWalkingArea({
      type: "FeatureCollection",
      features: [{ geometry: { type: "Point", coordinates: [0, 0] } }],
    }),
  ).toThrow();
});

test("direct trips enforce service days, trip order, permissions and after-midnight times", () => {
  const timetable: Timetable = {
    route: "test",
    timezone: "Europe/Dublin",
    places: {},
    dates: { s: ["2026-11-18"] },
    patterns: [
      {
        calls: [
          ["A", 0, 1],
          ["B", 1, 0],
          ["request", 3, 0],
        ],
        runs: [["s", [89_100, 90_000, 90_600], [89_100, 90_000, 90_600]]],
      },
    ],
  };
  expect(
    findDirectTrips(
      [timetable],
      new Set(["A"]),
      new Set(["B"]),
      "2026-11-19",
      0,
    ),
  ).toEqual([
    { route: "test", from: "A", to: "B", departure: 2700, arrival: 3600 },
  ]);
  expect(
    findDirectTrips(
      [timetable],
      new Set(["B"]),
      new Set(["A"]),
      "2026-11-19",
      0,
    ),
  ).toEqual([]);
  expect(
    findDirectTrips(
      [timetable],
      new Set(["A"]),
      new Set(["B"]),
      "2026-11-20",
      0,
    ),
  ).toEqual([]);
  expect(isClockChange("2026-10-25", "Europe/Dublin")).toBe(true);
  expect(isClockChange("2026-11-19", "Europe/Dublin")).toBe(false);
});

test("bundled domestic NS routes have real timed trips", async () => {
  const root = `${import.meta.dir}/../public/data/amsterdam`;
  const index: TransitIndex = await Bun.file(`${root}/index.json`).json();
  const route = index.routes.find(
    (route) =>
      route.operator === "NS" && route.mode === "rail" && route.timetable,
  );
  if (!route?.timetable) throw new Error("No bundled NS timetable");
  const data: Timetable = JSON.parse(
    new TextDecoder().decode(
      Bun.gunzipSync(
        await Bun.file(`${root}/schedule/${route.timetable}`).arrayBuffer(),
      ),
    ),
  );
  expect(data.route).toBe(route.id);
  expect(data.patterns.some((pattern) => pattern.runs.length > 0)).toBe(true);
});

test("Barcelona's bundled schedule is Renfe only", async () => {
  const root = `${import.meta.dir}/../public/data/barcelona`;
  const index: TransitIndex = await Bun.file(`${root}/index.json`).json();
  expect(index.feeds.map((feed) => feed.operator)).toEqual(["Renfe"]);
  expect(
    index.routes.some(
      (route) => route.mode === "rail" && !!route.timetable && !!route.geometry,
    ),
  ).toBe(true);
});
