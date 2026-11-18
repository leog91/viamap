import { expect, test } from "bun:test";
import { cities } from "../src/config/cities";
import { findNearbyPoints, withinBounds } from "../src/transit/accessibility";
import { locationExtent, parseLocations } from "../src/transit/locations";

for (const [id, kind] of [
  ["caba", /^Subte [A-H] entrance$/],
  ["barcelona", /Metro|FGC|Rail|Tram/],
] as const) {
  test(`${id} publishes real location-only points near the default origin`, async () => {
    const city = cities.find((item) => item.id === id);
    if (!city) throw new Error(`Unknown city ${id}`);
    const points = parseLocations(
      await Bun.file(
        `${import.meta.dir}/../public/data/${id}/locations.json`,
      ).json(),
    );
    const nearby = findNearbyPoints(points, city.center, 500);
    const extent = locationExtent(points);
    if (!extent) throw new Error("Missing published bounds");
    expect(
      points.every((point) => withinBounds(point.coordinates, extent)),
    ).toBe(true);
    if (id === "caba") expect(city.transitIndex).toBeUndefined();
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby[0]?.kind).toMatch(kind);
  });
}

test("location data rejects missing coordinates or duplicate IDs", () => {
  const item = {
    id: "1",
    name: "Example",
    coordinates: [1, 2],
    kind: "Entrance",
    detail: "",
  };
  expect(() => parseLocations([{ ...item, coordinates: [null, 2] }])).toThrow();
  expect(() => parseLocations([item, item])).toThrow();
});

test("location extent uses all published points and not routes or the origin", () => {
  const points = parseLocations([
    {
      id: "1",
      name: "A",
      coordinates: [2.17, 41.38],
      kind: "Entrance",
      detail: "",
    },
    {
      id: "2",
      name: "B",
      coordinates: [2.1, 41.41],
      kind: "Entrance",
      detail: "",
    },
  ]);
  expect(locationExtent(points)).toEqual([2.1, 41.38, 2.17, 41.41]);
  expect(locationExtent([])).toBeUndefined();
});
