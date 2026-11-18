import { expect, test } from "bun:test";
import { distance } from "@turf/distance";
import { cities } from "../src/config/cities";
import type { Coordinates } from "../src/geo/catchment";
import { withinBounds } from "../src/transit/accessibility";
import { parseReferenceNetwork } from "../src/transit/reference-network";

test("Barcelona has the official FGC reference lines near Plaça de Catalunya", async () => {
  const city = cities.find(({ id }) => id === "barcelona");
  const url = city?.network?.urls[0];
  if (!city || !url) throw new Error("Missing FGC reference layer");
  const data = parseReferenceNetwork(
    await Bun.file(`${import.meta.dir}/../public${url}`).json(),
  );
  const nearby = data.features.filter(({ geometry }) =>
    geometry.coordinates.some(
      (point) => distance(city.center, point, { units: "meters" }) < 500,
    ),
  );
  expect(nearby.some(({ properties }) => properties.name === "FGC L6")).toBe(
    true,
  );
  expect(nearby.some(({ properties }) => properties.name === "FGC L7")).toBe(
    true,
  );
});

test("CABA has the six geographical Subte lines, separate from schedules", async () => {
  const city = cities.find(({ id }) => id === "caba");
  const url = city?.network?.sources.find(({ name }) => name === "Subte")?.url;
  if (!url) throw new Error("Missing Subte reference layer");
  const data = parseReferenceNetwork(
    await Bun.file(`${import.meta.dir}/../public${url}`).json(),
  );
  expect(
    [
      ...new Set(data.features.map((feature) => feature.properties.name)),
    ].sort(),
  ).toEqual(["Subte A", "Subte B", "Subte C", "Subte D", "Subte E", "Subte H"]);
  expect(city?.transitIndex).toBeUndefined();
});

test("both archived Roca branch alignments pass Quilmes station", async () => {
  const city = cities.find(({ id }) => id === "caba");
  const url = city?.network?.sources.find(
    ({ name }) => name === "Línea Roca",
  )?.url;
  if (!city?.overview || !url)
    throw new Error("Missing Quilmes reference layer");
  const quilmes: Coordinates = [-58.26026, -34.72501];
  expect(cities.some(({ id }) => id === "quilmes")).toBe(false);
  expect(withinBounds(city.center, city.overview)).toBe(true);
  expect(withinBounds(quilmes, city.overview)).toBe(true);
  const data = parseReferenceNetwork(
    await Bun.file(`${import.meta.dir}/../public${url}`).json(),
  );
  expect(
    data.features.map((feature) => feature.properties.name).sort(),
  ).toEqual([
    "Roca: Constitución–Bosques (vía Quilmes)",
    "Roca: Constitución–La Plata",
  ]);
  for (const { geometry } of data.features) {
    expect(
      geometry.coordinates.some(
        (point) => distance(quilmes, point, { units: "meters" }) < 50,
      ),
    ).toBe(true);
  }
  expect(city.transitIndex).toBeUndefined();
});
