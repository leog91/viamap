import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
  MeasuredPoint,
  RouteGeometry,
  RoutePattern,
} from "../../src/transit/route-data";
import { encodeShape } from "../../src/transit/shape-codec";
import { alignCalls, measureShape, simplifyShape } from "./align-shape";
import type { transformFeed } from "./transform";

type Feed = Awaited<ReturnType<typeof transformFeed>>;

export function buildRouteGeometry({ stops, offline }: Feed) {
  const platforms = new Set(stops.map((stop) => stop.id));
  const points = new Map(
    offline.stops.map((stop) => [stop.id, stop.coordinates]),
  );
  const measured = new Map<string, ReturnType<typeof measureShape>>();
  const simplified = new Map<string, MeasuredPoint[]>();
  const routes = new Map<
    string,
    {
      data: RouteGeometry;
      shapeIndices: Map<string, number>;
      seenPatterns: Set<string>;
    }
  >();
  const matches = new Map<string, number[] | undefined>();
  let omitted = 0;

  for (const { routeId, shapeId, calls } of offline.patterns) {
    const raw = shapeId ? offline.shapes[shapeId] : undefined;
    if (!raw || !shapeId) {
      omitted++;
      continue;
    }
    let shape = measured.get(shapeId);
    if (!shape) {
      shape = measureShape(raw);
      measured.set(shapeId, shape);
    }
    const key = JSON.stringify([
      shapeId,
      calls.map(([id, , , , hint]) => [id, hint]),
    ]);
    if (!matches.has(key)) {
      const shapeCalls = calls.map(([id, , , , hint]) => {
        const point = points.get(id);
        if (!point) throw new Error(`Missing stop coordinate: ${id}`);
        return { point, hint };
      });
      matches.set(key, alignCalls(shape, shapeCalls));
    }
    const positions = matches.get(key);
    if (!positions) {
      omitted++;
      continue;
    }
    let last = calls.length - 1;
    while (last >= 0 && calls[last]?.[3] === 1) last--;
    const end = positions[last];
    if (end === undefined) {
      omitted++;
      continue;
    }
    const boardings = calls.flatMap(
      ([id, , pickup], i): RoutePattern["boardings"] => {
        const position = positions[i];
        return i < last &&
          pickup !== 1 &&
          platforms.has(id) &&
          position !== undefined
          ? [[id, roundMeasure(position)]]
          : [];
      },
    );
    if (!boardings.length) {
      omitted++;
      continue;
    }

    let route = routes.get(routeId);
    if (!route) {
      route = {
        data: { route: routeId, shapes: [], patterns: [] },
        shapeIndices: new Map(),
        seenPatterns: new Set(),
      };
      routes.set(routeId, route);
    }
    let shapeIndex = route.shapeIndices.get(shapeId);
    if (shapeIndex === undefined) {
      let geometry = simplified.get(shapeId);
      if (!geometry) {
        geometry = simplifyShape(shape.points);
        simplified.set(shapeId, geometry);
      }
      shapeIndex = route.data.shapes.push(geometry) - 1;
      route.shapeIndices.set(shapeId, shapeIndex);
    }
    const pattern = { shape: shapeIndex, end: roundMeasure(end), boardings };
    const fingerprint = JSON.stringify(pattern);
    if (!route.seenPatterns.has(fingerprint)) {
      route.seenPatterns.add(fingerprint);
      route.data.patterns.push(pattern);
    }
  }
  return {
    routes: new Map([...routes].map(([id, { data }]) => [id, data])),
    omitted,
  };
}

export async function exportRoutes(feed: Feed, directory: string) {
  const { routes, omitted } = buildRouteGeometry(feed);
  for (const route of feed.routes) {
    const geometry = routes.get(route.id);
    if (!geometry) continue;
    const content = `${JSON.stringify({ ...geometry, shapes: geometry.shapes.map(encodeShape) })}\n`;
    const hash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 24);
    route.geometry = `r-${hash}.json`;
    await Bun.write(join(directory, route.geometry), content);
  }
  return { published: routes.size, omitted };
}

function roundMeasure(metres: number) {
  return Math.round(metres * 100) / 100;
}
