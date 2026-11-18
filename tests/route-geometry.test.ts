import { expect, test } from "bun:test";
import {
  alignCalls,
  measureShape,
  simplifyShape,
} from "../scripts/gtfs/align-shape";
import type { Coordinates } from "../src/geo/catchment";
import { parseRouteGeometry } from "../src/transit/load-geometry";
import type { MeasuredPoint, RouteGeometry } from "../src/transit/route-data";
import { makeRouteLines } from "../src/transit/route-lines";
import { decodeShape, encodeShape } from "../src/transit/shape-codec";

function shape(points: Coordinates[]) {
  return measureShape(points.map((point, i) => [i, point, null]));
}

function calls(points: Coordinates[]) {
  return points.map((point) => ({ point, hint: null }));
}

const west: Coordinates = [-6.25, 53.35];
const middle: Coordinates = [-6.24, 53.35];
const east: Coordinates = [-6.23, 53.35];
const south: Coordinates = [-6.24, 53.34];

test("trip order determines whether a directional shape can be used", () => {
  const geometry = shape([west, middle, east]);
  const forward = alignCalls(geometry, calls([west, middle, east]));
  expect(forward?.[0]).toBe(0);
  expect(forward?.at(-1)).toBeCloseTo(1327.61, 0);
  expect(alignCalls(geometry, calls([east, middle, west]))).toBeUndefined();
  const inbound = alignCalls(
    shape([east, middle, west]),
    calls([east, middle, west]),
  );
  expect(inbound?.[0]).toBe(0);
});

test("ordered visits disambiguate a repeated stop on a loop", () => {
  const loop = shape([west, middle, east, middle, south]);
  const match = alignCalls(loop, calls([west, middle, east, middle, south]));
  expect(match).toHaveLength(5);
  expect((match?.[3] ?? 0) - (match?.[1] ?? 0)).toBeGreaterThan(1000);
  expect(alignCalls(loop, calls([west, middle, south]))).toBeUndefined();
});

test("validated GTFS offsets can disambiguate an overlapping loop", () => {
  const loop = measureShape(
    [west, middle, east, middle, south].map((point, i) => [i, point, i * 0.5]),
  );
  const match = alignCalls(loop, [
    { point: west, hint: 0 },
    { point: middle, hint: 1.5 },
    { point: south, hint: 2 },
  ]);
  expect(match?.[1]).toBeCloseTo(loop.points[3]?.[2] ?? 0, 2);
  expect(alignCalls(loop, calls([west, [-6.18, 53.5], south]))).toBeUndefined();
});

test("route geometries compactly round-trip measured vertices and reject corrupt data", () => {
  const points = simplifyShape(shape([west, middle, east]).points);
  expect(points).toHaveLength(2);
  const encoded = encodeShape(points);
  expect(decodeShape(encoded)).toEqual(points);
  expect(decodeShape(encoded.slice(0, -1))).toBeUndefined();
  const fixture = {
    route: "R",
    shapes: [encoded],
    patterns: [{ shape: 0, end: 1200, boardings: [["A", 100]] }],
  };
  expect(parseRouteGeometry(fixture, "R")?.shapes[0]).toEqual(points);
  expect(parseRouteGeometry(fixture, "other")).toBeUndefined();
  expect(
    parseRouteGeometry(
      {
        ...fixture,
        patterns: [{ shape: 0, end: 1200, boardings: [["A", 1250]] }],
      },
      "R",
    ),
  ).toBeUndefined();
});

test("clips at boarding and last alighting, resets at a later boarding, and ignores other platforms", () => {
  const points: MeasuredPoint[] = [
    [-6.25, 53.35, 0],
    [-6.24, 53.35, 1000],
    [-6.23, 53.35, 2000],
  ];
  const geometry: RouteGeometry = {
    route: "R",
    shapes: [points],
    patterns: [
      {
        shape: 0,
        end: 1800,
        boardings: [
          ["A", 500],
          ["X", 750],
          ["B", 1000],
        ],
      },
    ],
  };
  const { lines, mapped } = makeRouteLines([geometry], new Set(["A", "B"]));
  expect([...mapped]).toEqual(["R"]);
  expect(lines.features.map(({ properties }) => properties.metres)).toEqual([
    125, 375, 125, 375, 625, 775,
  ]);
  expect(lines.features[0]?.geometry.coordinates[0]?.[0]).toBeCloseTo(
    -6.245,
    7,
  );
  expect(lines.features.at(-1)?.geometry.coordinates.at(-1)?.[0]).toBeCloseTo(
    -6.232,
    7,
  );
  expect(makeRouteLines([geometry], new Set()).lines.features).toHaveLength(0);
});

test("beyond 12 km remains a single red-distance band", () => {
  const geometry: RouteGeometry = {
    route: "R",
    shapes: [
      [
        [0, 0, 0],
        [0.18, 0, 20_000],
      ],
    ],
    patterns: [{ shape: 0, end: 19_000, boardings: [["A", 1000]] }],
  };
  const { lines } = makeRouteLines([geometry], new Set(["A"]));
  expect(lines.features).toHaveLength(49);
  expect(lines.features.at(-1)?.properties.metres).toBe(15_000);
});
