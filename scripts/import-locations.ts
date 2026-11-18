import { mkdir } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { parseLocations } from "../src/transit/locations";

const cabaUrl =
  "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/sbase/bocas-subte/bocas-de-subte.geojson";
const barcelonaUrl =
  "https://opendata-ajuntament.barcelona.cat/data/dataset/e0c34739-823f-470d-8045-e10f28e80f2d/resource/e07dec0d-4aeb-40f3-b987-e1f35e088ce2/download";
const [city, local] = Bun.argv.slice(2);
if (city !== "caba" && city !== "barcelona") {
  throw new Error(
    "Usage: bun scripts/import-locations.ts <caba|barcelona> [local source file]",
  );
}

const text = local
  ? await Bun.file(local).text()
  : await download(city === "caba" ? cabaUrl : barcelonaUrl);
const locations = parseLocations(
  city === "caba" ? cabaEntries(text) : barcelonaEntries(text),
);
const directory = `public/data/${city}`;
await mkdir(directory, { recursive: true });
await Bun.write(
  `${directory}/locations.json`,
  `${JSON.stringify(locations)}\n`,
);
console.log(`Wrote ${locations.length} published locations for ${city}`);

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
}

function cabaEntries(text: string) {
  const data = JSON.parse(text);
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw new Error("Expected CABA GeoJSON");
  return data.features.map(
    (feature: {
      properties: {
        id: number;
        estacion: string;
        linea: string;
        calle?: string;
        altura?: number;
        destino_bo?: string;
      };
      geometry: { type: string; coordinates: unknown };
    }) => {
      const { id, estacion, linea, calle, altura, destino_bo } =
        feature.properties;
      if (
        feature.geometry.type !== "Point" ||
        !Number.isSafeInteger(id) ||
        !/^[ABCDEH]$/.test(linea) ||
        typeof estacion !== "string"
      )
        throw new Error("Invalid Subte entrance");
      const address = [calle, altura].filter(Boolean).join(" ");
      return {
        id: String(id),
        name: estacion.trim(),
        coordinates: feature.geometry.coordinates,
        kind: `Subte ${linea} entrance`,
        detail: [address, destino_bo].filter(Boolean).join(" · "),
      };
    },
  );
}

function barcelonaEntries(text: string) {
  const kinds = new Map([
    ["K001", "Metro / urban FGC"],
    ["K002", "FGC"],
    ["K003", "Rail"],
    ["K004", "Airport rail"],
    ["K011", "Tram"],
  ]);
  const rows: Record<string, string>[] = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  });
  const unique = new Map<string, unknown>();
  for (const row of rows) {
    const kind = kinds.get(row.CODI_CAPA ?? "");
    if (!kind) continue;
    if (!row.LONGITUD?.trim() || !row.LATITUD?.trim())
      throw new Error("Missing Barcelona coordinates");
    const coordinates = [Number(row.LONGITUD), Number(row.LATITUD)];
    const name = row.EQUIPAMENT?.trim().replace(/-+$/, "").trim();
    const key = JSON.stringify([row.CODI_CAPA, name, coordinates]);
    unique.set(key, {
      id: key,
      name,
      kind,
      coordinates,
      detail: row.ADRECA?.trim() ?? "",
    });
  }
  return [...unique.values()];
}
