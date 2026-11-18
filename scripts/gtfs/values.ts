import type { Coordinates } from "../../src/geo/catchment";
import type { Mode } from "../../src/transit/model";
import type { Row } from "./archive";

export function field(row: Row, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

export function decimal(value: string, label: string): number {
  if (
    !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Number(value);
}

export function sequence(value: string, label: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Number(value);
}

export function coordinates(lon: string, lat: string): Coordinates {
  const x = decimal(lon, "longitude");
  const y = decimal(lat, "latitude");
  if (Math.abs(x) > 180 || Math.abs(y) > 90)
    throw new Error(`Out-of-range coordinates: ${lon}, ${lat}`);
  return [x, y];
}

export function gtfsSeconds(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value))
    throw new Error(`Invalid GTFS time: ${value}`);
  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function routeMode(value: string): Mode {
  const type = sequence(value, "route_type");
  if (type === 1 || type === 401 || (type >= 500 && type < 600)) return "metro";
  if (type === 4 || (type >= 1000 && type < 1100) || type === 1200)
    return "ferry";
  if (type === 0 || (type >= 900 && type < 1000)) return "tram";
  if (type === 2 || (type >= 100 && type < 200)) return "rail";
  if (
    type === 3 ||
    type === 11 ||
    (type >= 200 && type < 300) ||
    (type >= 700 && type < 900)
  )
    return "bus";
  return "other";
}

export function unique<T>(map: Map<string, T>, id: string, value: T) {
  if (map.has(id)) throw new Error(`Duplicate ID: ${id}`);
  map.set(id, value);
}
