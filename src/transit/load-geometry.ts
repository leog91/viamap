import type { RouteGeometry } from "./route-data";
import { decodeShape } from "./shape-codec";

export async function loadRouteGeometry(
  url: string,
  routeId: string,
): Promise<RouteGeometry> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`Route geometry returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  const geometry = parseRouteGeometry(value, routeId);
  if (!geometry) throw new Error("Invalid route geometry");
  return geometry;
}

export function parseRouteGeometry(
  value: unknown,
  routeId: string,
): RouteGeometry | undefined {
  if (
    !record(value) ||
    value.route !== routeId ||
    !Array.isArray(value.shapes) ||
    !value.shapes.length ||
    !Array.isArray(value.patterns) ||
    !value.patterns.length
  )
    return;
  const shapes: RouteGeometry["shapes"] = [];
  for (const encoded of value.shapes) {
    const decoded =
      typeof encoded === "string" ? decodeShape(encoded) : undefined;
    if (!decoded) return;
    shapes.push(decoded);
  }
  const patterns: RouteGeometry["patterns"] = [];
  for (const pattern of value.patterns) {
    if (
      !record(pattern) ||
      !finite(pattern.shape) ||
      !Number.isInteger(pattern.shape) ||
      !finite(pattern.end) ||
      pattern.end <= 0 ||
      pattern.end > (shapes[pattern.shape]?.at(-1)?.[2] ?? -1) ||
      !Array.isArray(pattern.boardings) ||
      !pattern.boardings.length
    )
      return;
    const end = pattern.end;
    const boardings: RouteGeometry["patterns"][number]["boardings"] = [];
    for (const board of pattern.boardings) {
      if (
        !Array.isArray(board) ||
        board.length !== 2 ||
        typeof board[0] !== "string" ||
        !finite(board[1]) ||
        board[1] < 0 ||
        board[1] >= end
      )
        return;
      boardings.push([board[0], board[1]]);
    }
    patterns.push({ shape: pattern.shape, end, boardings });
  }
  return { route: routeId, shapes, patterns };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
