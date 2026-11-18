import type { GtfsFeed } from "./archive";
import { field } from "./values";

// Keep only one operator's trip rows before allocating stop-time arrays.
export async function selectAgency(
  feed: GtfsFeed,
  id: string,
): Promise<GtfsFeed> {
  const routes = new Set<string>();
  const trips = new Set<string>();
  const services = new Set<string>();
  const shapes = new Set<string>();
  for await (const row of feed.rows("routes.txt", ["route_id", "agency_id"])) {
    if (row.agency_id === id) routes.add(field(row, "route_id"));
  }
  if (!routes.size) throw new Error(`No routes for agency ${id}`);
  for await (const row of feed.rows("trips.txt", [
    "route_id",
    "trip_id",
    "service_id",
  ])) {
    if (!routes.has(field(row, "route_id"))) continue;
    trips.add(field(row, "trip_id"));
    services.add(field(row, "service_id"));
    if (row.shape_id) shapes.add(row.shape_id);
  }
  return {
    files: feed.files,
    async *rows(file, columns) {
      for await (const row of feed.rows(file, columns)) {
        if (file === "agency.txt" && row.agency_id !== id) continue;
        if (file === "routes.txt" && !routes.has(row.route_id ?? "")) continue;
        if (
          (file === "trips.txt" || file === "stop_times.txt") &&
          !trips.has(row.trip_id ?? "")
        )
          continue;
        if (
          (file === "calendar.txt" || file === "calendar_dates.txt") &&
          !services.has(row.service_id ?? "")
        )
          continue;
        if (file === "shapes.txt" && !shapes.has(row.shape_id ?? "")) continue;
        yield row;
      }
    },
  };
}
