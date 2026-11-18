import { expect, test } from "bun:test";
import { cities, cityAt, cityLabel } from "../src/config/cities";

test("supported city centres resolve to their data without using the current city", () => {
  for (const city of cities) expect(cityAt(city.center)?.id).toBe(city.id);
  expect(cityAt([-58.26026, -34.72501])?.id).toBe("caba");
  expect(cityAt([-57.95017, -34.90389])?.id).toBe("caba");
  expect(cityAt([0, 0])).toBeUndefined();
  expect(cities.map(cityLabel)).toEqual([
    "Dublin",
    "Amsterdam",
    "Barcelona",
    "Buenos Aires",
  ]);
});
