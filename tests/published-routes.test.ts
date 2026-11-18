import { expect, test } from "bun:test";
import { amsterdam } from "../src/config/cities";
import { dublin } from "../src/config/dublin";
import { findNearbyStops } from "../src/transit/accessibility";
import { parseRouteGeometry } from "../src/transit/load-geometry";
import type { TransitIndex } from "../src/transit/model";
import type { RouteGeometry } from "../src/transit/route-data";
import { makeRouteLines } from "../src/transit/route-lines";

test("the bundled snapshot has valid geometry assets and draws bus and rail from Marino", async () => {
  const root = `${import.meta.dir}/../public/data/dublin`;
  const index: TransitIndex = await Bun.file(`${root}/index.json`).json();
  const routes = new Map<string, RouteGeometry>();
  for (const { id, geometry } of index.routes) {
    if (!geometry) continue;
    const path = `${root}/geometry/${geometry}`;
    const data = parseRouteGeometry(await Bun.file(path).json(), id);
    if (!data) throw new Error(`Invalid published route asset: ${path}`);
    routes.set(id, data);
  }
  const nearby = findNearbyStops(index.stops, dublin.center, 500);
  const { mapped } = makeRouteLines(
    [...routes.values()],
    new Set(nearby.flatMap((stop) => stop.platformIds)),
  );
  expect(
    index.routes.some((route) => route.mode === "bus" && mapped.has(route.id)),
  ).toBe(true);
  expect(
    index.routes.some((route) => route.mode === "rail" && mapped.has(route.id)),
  ).toBe(true);
});

test("Europaplein publishes boardable GVB metro 52 and tram 4", async () => {
  const root = `${import.meta.dir}/../public/data/amsterdam`;
  const index: TransitIndex = await Bun.file(`${root}/index.json`).json();
  const nearby = findNearbyStops(index.stops, amsterdam.center, 500);
  const platforms = new Set(nearby.flatMap((stop) => stop.platformIds));
  const routeIds = new Set(nearby.flatMap((stop) => stop.routeIds));
  for (const [mode, name] of [
    ["metro", "52"],
    ["tram", "4"],
  ] as const) {
    const route = index.routes.find(
      (item) =>
        item.name === name && item.mode === mode && routeIds.has(item.id),
    );
    if (!route?.geometry) throw new Error(`Missing nearby ${mode} ${name}`);
    expect(route.operator).toBe("GVB");
    const data = parseRouteGeometry(
      await Bun.file(`${root}/geometry/${route.geometry}`).json(),
      route.id,
    );
    if (!data) throw new Error(`Missing valid ${mode} geometry`);
    expect(makeRouteLines([data], platforms).mapped.has(route.id)).toBe(true);
  }
});
