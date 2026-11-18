import { mkdir } from "node:fs/promises";
import type { TransitIndex } from "../../src/transit/model";
import { exportTimetables } from "./export-timetables";

const city = Bun.argv[2];
if (city !== "dublin" && city !== "amsterdam")
  throw new Error("Pass dublin or amsterdam (after importing GTFS)");
const path = `public/data/${city}`;
const index: TransitIndex = await Bun.file(`${path}/index.json`).json();
await mkdir(`${path}/schedule`, { recursive: true });
for (const feed of index.feeds) {
  const packed = await Bun.file(
    `.gtfs/${city}/${feed.id}.json.gz`,
  ).arrayBuffer();
  const data = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(packed)));
  await exportTimetables(
    data,
    index.routes.filter((route) => route.id.startsWith(`${feed.id}:`)),
    `${path}/schedule`,
  );
}
await Bun.write(`${path}/index.json`, `${JSON.stringify(index)}\n`);
