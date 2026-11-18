import { distance } from "@turf/distance";
import type { Coordinates } from "../../src/geo/catchment";
import { type MeasuredPoint, pointAt } from "../../src/transit/route-data";

type RawPoint = [
  sequence: number,
  coordinates: Coordinates,
  shapeDistance: number | null,
];
export type ShapeCall = { point: Coordinates; hint: number | null };
type Candidate = { at: number; error: number };
const snapLimit = 85;
const minimumAdvance = 0.5;

export function measureShape(raw: readonly RawPoint[]) {
  const points: MeasuredPoint[] = [];
  const hints: number[] = [];
  let validHints = true;
  let cumulative = 0;
  for (const [, point, hint] of raw) {
    const prev = points.at(-1);
    if (prev) {
      const length = distance([prev[0], prev[1]], point, { units: "meters" });
      if (length < 0.01) continue;
      cumulative += length;
    }
    if (hint === null || hint <= (hints.at(-1) ?? -Infinity))
      validHints = false;
    hints.push(hint ?? 0);
    points.push([...point, cumulative]);
  }
  return { points, hints: validHints ? hints : undefined };
}

export function alignCalls(
  shape: ReturnType<typeof measureShape>,
  calls: ShapeCall[],
): number[] | undefined {
  if (shape.points.length < 2 || calls.length < 2) return;
  const candidates = calls.map((call) => projections(shape.points, call.point));
  const hintMatches = calls.map((call) => hintedProjection(shape, call));
  if (hintMatches.some(Boolean)) {
    const hinted = orderedMatch(
      candidates.map((options, i) => {
        const hint = hintMatches[i];
        return hint ? [hint] : options;
      }),
    );
    if (hinted) return hinted;
  }
  return orderedMatch(candidates);
}

function projections(points: MeasuredPoint[], point: Coordinates): Candidate[] {
  const cosine = Math.cos((point[1] * Math.PI) / 180);
  const candidates: Candidate[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const [t, error] = project(point, a, b, cosine);
    if (error <= snapLimit ** 2)
      candidates.push({ at: a[2] + (b[2] - a[2]) * t, error });
  }
  // Keep local minima along the shape, not many neighboring vertex snaps.
  // Separate visits to the same stop remain candidates on a loop.
  const minima: Candidate[] = [];
  for (const item of candidates.sort((a, b) => a.error - b.error)) {
    if (!minima.some((other) => Math.abs(other.at - item.at) < 30))
      minima.push(item);
  }
  return minima;
}

function orderedMatch(rows: Candidate[][]): number[] | undefined {
  if (rows.some((row) => !row.length)) return;
  const transition = (prior: Candidate, next: Candidate) =>
    next.at - prior.at >= minimumAdvance;
  const forward: number[][] = [];
  const reverse: number[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    forward.push(
      row.map(
        (candidate) =>
          candidate.error +
          (i === 0
            ? 0
            : Math.min(
                ...(rows[i - 1] ?? []).map((prior, j) =>
                  transition(prior, candidate)
                    ? (forward[i - 1]?.[j] ?? Infinity)
                    : Infinity,
                ),
              )),
      ),
    );
  }
  const best = Math.min(...(forward.at(-1) ?? []));
  if (!Number.isFinite(best)) return;

  // Forward and backward costs identify other almost-equally plausible matches.
  // Reject a pattern when a call could belong to a materially different pass.
  for (let i = rows.length - 1; i >= 0; i--) {
    reverse[i] = (rows[i] ?? []).map(
      (candidate) =>
        candidate.error +
        (i === rows.length - 1
          ? 0
          : Math.min(
              ...(rows[i + 1] ?? []).map((next, j) =>
                transition(candidate, next)
                  ? (reverse[i + 1]?.[j] ?? Infinity)
                  : Infinity,
              ),
            )),
    );
  }
  const result: number[] = [];
  let last = -Infinity;
  let spent = 0;
  for (const [i, row] of rows.entries()) {
    const options = row.filter(
      (candidate, j) =>
        (forward[i]?.[j] ?? Infinity) +
          (reverse[i]?.[j] ?? Infinity) -
          candidate.error <=
        best + 12 ** 2,
    );
    const low = Math.min(...options.map((candidate) => candidate.at));
    const high = Math.max(...options.map((candidate) => candidate.at));
    if (high - low > 100) return;
    let chosen: Candidate | undefined;
    let cost = Infinity;
    for (const [j, candidate] of row.entries()) {
      const total = spent + (reverse[i]?.[j] ?? Infinity);
      if (candidate.at - last >= minimumAdvance && total < cost) {
        chosen = candidate;
        cost = total;
      }
    }
    if (!chosen) return;
    spent += chosen.error;
    last = chosen.at;
    result.push(last);
  }
  return result;
}

function hintedProjection(
  shape: ReturnType<typeof measureShape>,
  { point, hint }: ShapeCall,
): Candidate | undefined {
  const axis = shape.hints;
  if (
    hint === null ||
    !axis?.length ||
    hint < (axis[0] ?? Infinity) ||
    hint > (axis.at(-1) ?? -Infinity)
  )
    return;
  let lo = 0;
  let hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if ((axis[mid] ?? Infinity) <= hint) lo = mid;
    else hi = mid;
  }
  const a = shape.points[lo]?.[2];
  const b = shape.points[hi]?.[2];
  const from = axis[lo];
  const to = axis[hi];
  if (
    a === undefined ||
    b === undefined ||
    from === undefined ||
    to === undefined ||
    to <= from
  )
    return;
  const at = a + (b - a) * ((hint - from) / (to - from));
  const error =
    distance(point, pointAt(shape.points, at), { units: "meters" }) ** 2;
  if (error <= snapLimit ** 2) return { at, error };
}

// Local metric projection is used for snapping/simplification only; cumulative
// metres come from the original vertices and are not shortened by simplification.
function project(
  point: Coordinates | MeasuredPoint,
  a: MeasuredPoint,
  b: MeasuredPoint,
  cosine: number,
) {
  const metresPerDegree = 111_195;
  const x = (point[0] - a[0]) * cosine * metresPerDegree;
  const y = (point[1] - a[1]) * metresPerDegree;
  const dx = (b[0] - a[0]) * cosine * metresPerDegree;
  const dy = (b[1] - a[1]) * metresPerDegree;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, (x * dx + y * dy) / length2)) : 0;
  return [t, (x - dx * t) ** 2 + (y - dy * t) ** 2] as const;
}

export function simplifyShape(points: MeasuredPoint[]): MeasuredPoint[] {
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop() ?? [0, 0];
    const a = points[start];
    const b = points[end];
    if (!a || !b || end - start < 2) continue;
    const cosine = Math.cos(((a[1] + b[1]) * Math.PI) / 360);
    let furthest = 4 ** 2;
    let selected = -1;
    for (let i = start + 1; i < end; i++) {
      const point = points[i];
      if (!point) continue;
      const [t, error] = project(point, a, b, cosine);
      // Preserve accurate placement of distance markers even around meanders.
      const measureError = Math.abs(point[2] - (a[2] + (b[2] - a[2]) * t));
      const score = Math.max(error, (measureError / 3) ** 2);
      if (score > furthest) {
        furthest = score;
        selected = i;
      }
    }
    if (selected >= 0) {
      keep.add(selected);
      stack.push([start, selected], [selected, end]);
    }
  }
  return points
    .filter((_, i) => keep.has(i))
    .map(([lon, lat, metres]) => [
      round(lon, 1e5),
      round(lat, 1e5),
      round(metres, 100),
    ]);
}

function round(value: number, factor: number) {
  return Math.round(value * factor) / factor;
}
