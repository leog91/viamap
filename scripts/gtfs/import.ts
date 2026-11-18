import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { amsterdam, barcelona } from "../../src/config/cities";
import type { TransitIndex } from "../../src/transit/model";
import { openArchive } from "./archive";
import { dublinImport } from "./dublin";
import { exportRoutes } from "./export-routes";
import { exportTimetables } from "./export-timetables";
import { selectAgency } from "./select-agency";
import { mergeSharedStops } from "./shared-stops";
import { transformFeed } from "./transform";

const cwd = process.cwd();
const args = Bun.argv.slice(2);
const city =
  args[0] === "amsterdam" || args[0] === "barcelona" ? args.shift() : "dublin";
if (args.length && (args.length !== 2 || args[0] !== "--from" || !args[1])) {
  throw new Error(
    "Usage: bun run gtfs:import [amsterdam|barcelona] [--from <directory of source zip files>]",
  );
}
const config: typeof dublinImport & {
  feeds: ((typeof dublinImport.feeds)[number] & { agency?: string })[];
} =
  city === "amsterdam"
    ? {
        id: amsterdam.id,
        coverage: amsterdam.coverage,
        feeds: [
          {
            id: "gvb",
            operator: "GVB",
            file: "gtfs-nl.zip",
            url: "https://gtfs.ovapi.nl/nl/gtfs-nl.zip",
            agency: "GVB",
          },
          {
            id: "ns",
            operator: "NS",
            file: "gtfs-nl.zip",
            url: "https://gtfs.ovapi.nl/nl/gtfs-nl.zip",
            agency: "IFF:NS",
          },
        ],
      }
    : city === "barcelona"
      ? {
          id: barcelona.id,
          coverage: barcelona.coverage,
          feeds: [
            {
              id: "renfe",
              operator: "Renfe",
              file: "fomento_transit.zip",
              url: "https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip",
            },
          ],
        }
      : dublinImport;
const indexPath = resolve(cwd, "public", "data", config.id);
const offlinePath = resolve(cwd, ".gtfs", config.id);
const localPath = args[1] ? resolve(cwd, args[1]) : undefined;
await mkdir(offlinePath, { recursive: true });
await mkdir(indexPath, { recursive: true });
const staging = await mkdtemp(join(offlinePath, "import-"));
const geometryStaging = join(staging, "geometry");
const geometryPath = join(indexPath, "geometry");
const timetableStaging = join(staging, "schedule");
const timetablePath = join(indexPath, "schedule");
const index: TransitIndex = {
  schemaVersion: 1,
  coverage: config.coverage,
  feeds: [],
  routes: [],
  stops: [],
};
const provenance = [];

try {
  await mkdir(geometryStaging);
  await mkdir(timetableStaging);
  for (const { file, agency, ...feed } of config.feeds) {
    const archive = localPath ? join(localPath, file) : join(staging, file);
    if (!localPath && !(await Bun.file(archive).exists())) {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(300_000),
        headers: {
          "User-Agent": "ViaMap/0.1 (personal public-transport explorer)",
          "Accept-Encoding": "gzip",
        },
      });
      if (!response.ok || !response.body)
        throw new Error(`${feed.url}: HTTP ${response.status}`);
      await pipeline(
        Readable.from(response.body.values(), { objectMode: false }),
        createWriteStream(archive),
      );
    }
    console.log(`Processing ${feed.operator}…`);
    try {
      const zip = await openArchive(archive);
      const result = await transformFeed(
        agency ? await selectAgency(zip, agency) : zip,
        feed,
        config.coverage,
      );
      const { published, omitted } = await exportRoutes(
        result,
        geometryStaging,
      );
      await exportTimetables(result.offline, result.routes, timetableStaging);
      index.feeds.push(result.summary);
      index.routes.push(...result.routes);
      index.stops.push(...result.stops);
      await Bun.write(
        join(staging, `${feed.id}.json.gz`),
        Bun.gzipSync(JSON.stringify(result.offline)),
      );
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(archive)) hash.update(chunk);
      provenance.push({ ...result.summary, sha256: hash.digest("hex") });
      console.log(
        `  ${result.stops.length} stops, ${result.routes.length} routes, ${result.offline.patterns.length} patterns; ${result.missingShapes} invalid/missing referenced shapes, ${result.patternsWithoutShape} patterns without a shape ID`,
      );
      console.log(
        `  Geometry exported for ${published} routes; ${omitted} patterns without a reliable boarding-to-alighting match`,
      );
    } catch (cause) {
      throw new Error(`Could not import ${feed.operator}`, { cause });
    }
  }
  if (city === "dublin") index.stops = mergeSharedStops(index.stops);
  index.routes.sort((a, b) => a.id.localeCompare(b.id));
  index.stops.sort((a, b) => a.id.localeCompare(b.id));
  await Bun.write(
    join(staging, "provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  for (const feed of index.feeds) {
    await rename(
      join(staging, `${feed.id}.json.gz`),
      join(offlinePath, `${feed.id}.json.gz`),
    );
  }
  await rename(
    join(staging, "provenance.json"),
    join(offlinePath, "provenance.json"),
  );
  const indexStaging = join(staging, "index.json");
  await Bun.write(indexStaging, `${JSON.stringify(index)}\n`);
  await mkdir(geometryPath, { recursive: true });
  await mkdir(timetablePath, { recursive: true });
  for (const route of index.routes) {
    if (route.timetable) {
      await rename(
        join(timetableStaging, route.timetable),
        join(timetablePath, route.timetable),
      );
    }
    if (route.geometry) {
      await rename(
        join(geometryStaging, route.geometry),
        join(geometryPath, route.geometry),
      );
    }
  }
  await rename(indexStaging, join(indexPath, "index.json"));
  console.log(
    `Wrote ${index.stops.length} stops and ${index.routes.length} routes to ${indexPath}.`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
