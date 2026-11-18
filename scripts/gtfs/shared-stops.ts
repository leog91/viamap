import type { TransitStop } from "../../src/transit/model";

// Use only for feeds known to share a stop ID authority (NTA in Dublin).
export function mergeSharedStops(stops: TransitStop[]): TransitStop[] {
  const groups = new Map<string, TransitStop>();
  for (const stop of stops) {
    const id = stop.id.slice(stop.id.indexOf(":") + 1);
    const key = JSON.stringify([id, stop.coordinates]);
    const group = groups.get(key);
    if (group) {
      group.platformIds.push(...stop.platformIds);
      group.routeIds = [
        ...new Set([...group.routeIds, ...stop.routeIds]),
      ].sort();
      group.code ||= stop.code;
    } else {
      groups.set(key, { ...stop, platformIds: [...stop.platformIds] });
    }
  }
  return [...groups.values()];
}
