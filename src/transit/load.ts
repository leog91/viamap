import type { TransitIndex } from "./model";

export async function loadTransitIndex(
  url: string,
  signal: AbortSignal,
): Promise<TransitIndex> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Transit data returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!isTransitIndex(value))
    throw new Error("Unrecognized or invalid transit data");
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericTuple(value: unknown, size: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every(Number.isFinite)
  );
}

function isTransitIndex(value: unknown): value is TransitIndex {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !numericTuple(value.coverage, 4) ||
    !Array.isArray(value.feeds) ||
    !value.feeds.length ||
    !Array.isArray(value.routes) ||
    !Array.isArray(value.stops)
  )
    return false;
  const ids = new Set<string>();
  for (const route of value.routes) {
    if (
      !record(route) ||
      typeof route.id !== "string" ||
      ids.has(route.id) ||
      typeof route.name !== "string" ||
      typeof route.operator !== "string" ||
      typeof route.description !== "string" ||
      (route.timetable !== undefined &&
        (typeof route.timetable !== "string" ||
          !/^t-[a-f0-9]{24}\.json\.gz$/.test(route.timetable))) ||
      (route.geometry !== undefined &&
        (typeof route.geometry !== "string" ||
          !/^r-[a-f0-9]{24}\.json$/.test(route.geometry))) ||
      !["bus", "tram", "rail", "metro", "ferry", "other"].some(
        (mode) => mode === route.mode,
      )
    )
      return false;
    ids.add(route.id);
  }
  const stopIds = new Set<string>();
  for (const stop of value.stops) {
    if (
      !record(stop) ||
      typeof stop.id !== "string" ||
      stopIds.has(stop.id) ||
      typeof stop.name !== "string" ||
      typeof stop.code !== "string" ||
      !numericTuple(stop.coordinates, 2) ||
      !Array.isArray(stop.platformIds) ||
      !stop.platformIds.length ||
      !stop.platformIds.every((id) => typeof id === "string") ||
      !Array.isArray(stop.routeIds) ||
      !stop.routeIds.length ||
      !stop.routeIds.every((id) => ids.has(id))
    )
      return false;
    stopIds.add(stop.id);
  }
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  return value.feeds.every(
    (feed: unknown) =>
      record(feed) &&
      typeof feed.id === "string" &&
      typeof feed.operator === "string" &&
      typeof feed.url === "string" &&
      typeof feed.serviceStart === "string" &&
      isoDate.test(feed.serviceStart) &&
      typeof feed.serviceEnd === "string" &&
      isoDate.test(feed.serviceEnd) &&
      feed.serviceStart <= feed.serviceEnd,
  );
}
