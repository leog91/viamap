import type { Coordinates } from "../geo/catchment";

export type Bounds = [west: number, south: number, east: number, north: number];
export type Mode = "bus" | "tram" | "rail" | "metro" | "ferry" | "other";

export interface TransitRoute {
  id: string;
  name: string;
  description: string;
  operator: string;
  mode: Mode;
  geometry?: string;
  timetable?: string;
}

export interface TransitStop {
  id: string;
  name: string;
  code: string;
  coordinates: Coordinates;
  platformIds: string[];
  routeIds: string[];
}

export interface FeedSummary {
  id: string;
  operator: string;
  url: string;
  serviceStart: string;
  serviceEnd: string;
}

export interface TransitIndex {
  schemaVersion: 1;
  coverage: Bounds;
  feeds: FeedSummary[];
  routes: TransitRoute[];
  stops: TransitStop[];
}
