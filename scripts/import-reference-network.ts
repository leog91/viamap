import { mkdir } from "node:fs/promises";
import { parseReferenceNetwork } from "../src/transit/reference-network";
import { openArchive } from "./gtfs/archive";

const [city, local] = Bun.argv.slice(2);
if (city !== "caba" && city !== "quilmes" && city !== "barcelona")
  throw new Error(
    "Usage: bun scripts/import-reference-network.ts <caba|quilmes|barcelona> <official JSON or ZIP>",
  );
if (!local) throw new Error("Pass the official source file (see the README)");
const parsed = parseReferenceNetwork(
  city === "caba"
    ? await subte(local)
    : city === "quilmes"
      ? await roca(local)
      : await fgc(local),
);
const directory = `public/data/${city}`;
await mkdir(directory, { recursive: true });
await Bun.write(`${directory}/network.geojson`, `${JSON.stringify(parsed)}\n`);
console.log(
  `Wrote ${parsed.features.length} reference line features for ${city}`,
);

async function fgc(path: string) {
  const source = await Bun.file(path).json();
  if (
    !Array.isArray(source.results) ||
    source.total_count !== source.results.length
  )
    throw new Error("Expected the complete FGC route export");
  const regional = new Set([
    "L6",
    "L7",
    "L8",
    "L12",
    "S1",
    "S2",
    "S3",
    "S4",
    "S8",
    "S9",
    "R5",
    "R6",
    "FV",
  ]);
  const features = [];
  for (const row of source.results) {
    if (!regional.has(row.route_short_name)) continue;
    const { type, coordinates } = row.shape?.geometry ?? {};
    const parts =
      type === "MultiLineString"
        ? coordinates
        : type === "LineString"
          ? [coordinates]
          : undefined;
    if (!Array.isArray(parts) || !parts.length)
      throw new Error(`Missing geometry for FGC ${row.route_short_name}`);
    for (const part of parts) {
      features.push({
        type: "Feature",
        properties: {
          name: `FGC ${row.route_short_name}`,
          color: `#${row.route_color}`,
        },
        geometry: { type: "LineString", coordinates: part },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

async function subte(path: string) {
  const source = await Bun.file(path).json();
  if (source.type !== "FeatureCollection" || !Array.isArray(source.features))
    throw new Error("Invalid Subte geometry");
  const colors = new Map([
    ["A", "#137cb4"],
    ["B", "#ba243d"],
    ["C", "#233eb2"],
    ["D", "#008054"],
    ["E", "#9941a3"],
    ["H", "#a6710b"],
  ]);
  const seen = new Set<string>();
  const features = source.features.map(
    (item: {
      type: string;
      properties: { nombre: string };
      geometry: unknown;
    }) => {
      const line = /^Linea ([A-EH])$/i
        .exec(item.properties.nombre)?.[1]
        ?.toUpperCase();
      const color = line && colors.get(line);
      if (!color || !line)
        throw new Error(`Unrecognized Subte line: ${item.properties.nombre}`);
      seen.add(line);
      return {
        type: item.type,
        properties: { name: `Subte ${line}`, color },
        geometry: item.geometry,
      };
    },
  );
  if (seen.size !== colors.size)
    throw new Error("Subte source does not contain all six lines");
  return { type: "FeatureCollection", features };
}

async function roca(path: string) {
  const branches = new Map([
    ["11", "Constitución–La Plata"],
    ["13", "Constitución–Bosques (vía Quilmes)"],
  ]);
  const feed = await openArchive(path);
  const tripByShape = new Map<string, string>();
  const branchByShape = new Map<string, string>();
  const foundBranches = new Set<string>();
  for await (const row of feed.rows("trips.txt", [
    "route_id",
    "shape_id",
    "direction_id",
    "trip_id",
  ])) {
    const branch = row.route_id && branches.get(row.route_id);
    if (!branch || row.direction_id !== "0" || !row.shape_id || !row.trip_id)
      continue;
    tripByShape.set(row.shape_id, row.trip_id);
    branchByShape.set(row.shape_id, branch);
    foundBranches.add(branch);
  }
  if (
    foundBranches.size !== branches.size ||
    tripByShape.size !== branches.size
  )
    throw new Error(
      "Unexpected branch or shape count; verify before updating this archive",
    );
  const quilmesStops = new Set<string>();
  for await (const row of feed.rows("stops.txt", ["stop_id", "stop_name"])) {
    if (row.stop_name === "Quilmes" && row.stop_id)
      quilmesStops.add(row.stop_id);
  }
  const boards = new Set<string>();
  const tripIds = new Set(tripByShape.values());
  for await (const row of feed.rows("stop_times.txt", ["stop_id", "trip_id"])) {
    if (
      row.stop_id &&
      row.trip_id &&
      quilmesStops.has(row.stop_id) &&
      tripIds.has(row.trip_id)
    )
      boards.add(row.trip_id);
  }
  if (boards.size !== branches.size)
    throw new Error("Both archived branch shapes must serve Quilmes");
  const shapes = new Map(
    [...tripByShape.keys()].map((id) => [id, [] as [number, number, number][]]),
  );
  for await (const row of feed.rows("shapes.txt", [
    "shape_id",
    "shape_pt_sequence",
    "shape_pt_lon",
    "shape_pt_lat",
  ])) {
    const shape = row.shape_id && shapes.get(row.shape_id);
    if (!shape) continue;
    const point: [number, number, number] = [
      Number(row.shape_pt_sequence),
      Number(row.shape_pt_lon),
      Number(row.shape_pt_lat),
    ];
    if (
      !row.shape_pt_sequence ||
      !row.shape_pt_lon ||
      !row.shape_pt_lat ||
      !point.every(Number.isFinite)
    )
      throw new Error("Invalid archived shape point");
    shape.push(point);
  }
  return {
    type: "FeatureCollection",
    features: [...shapes].map(([id, points]) => ({
      type: "Feature",
      properties: { name: `Roca: ${branchByShape.get(id)}`, color: "#147858" },
      geometry: {
        type: "LineString",
        coordinates: points
          .sort((a, b) => a[0] - b[0])
          .map(([, lon, lat]) => [lon, lat]),
      },
    })),
  };
}
