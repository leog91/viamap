import { expect, test } from "bun:test";
import { distance } from "@turf/distance";
import { dublin } from "../src/config/dublin";
import { catchmentFeatures, radiusMetres } from "../src/geo/catchment";

test("the catchment is explicitly measured in metres from Marino", () => {
  const {
    features: [area, origin],
  } = catchmentFeatures(dublin.center, radiusMetres.initial);
  const ring = area.geometry.coordinates[0];
  expect(origin.geometry.coordinates).toEqual(dublin.center);
  expect(ring?.length).toBe(97);
  expect(ring?.at(-1)).toEqual(ring?.[0]);
  for (const vertex of ring ?? []) {
    expect(distance(dublin.center, vertex, { units: "meters" })).toBeCloseTo(
      500,
      5,
    );
  }
});

test("changing origin and radius produces a new circle in longitude–latitude order", () => {
  const center = [4.9, 52.37] satisfies [number, number];
  const {
    features: [area, origin],
  } = catchmentFeatures(center, radiusMetres.max);
  const north = area.geometry.coordinates[0]?.[0];
  if (!north) throw new Error("Circle is missing its northern vertex");
  expect(origin.geometry.coordinates).toEqual([4.9, 52.37]);
  expect(north[0]).toBeCloseTo(4.9, 5);
  expect(north[1]).toBeGreaterThan(52.37);
  expect(distance(center, north, { units: "meters" })).toBeCloseTo(2000, 5);
});
