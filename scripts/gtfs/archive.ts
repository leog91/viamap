import { Readable } from "node:stream";
import { parse } from "csv-parse";

export type Row = Record<string, string>;
export type GtfsFeed = {
  files: ReadonlySet<string>;
  rows: (file: string, columns: string[]) => AsyncIterable<Row>;
};

export async function openArchive(path: string): Promise<GtfsFeed> {
  const listing = Bun.spawn(["unzip", "-Z", "-1", path], { stderr: "inherit" });
  const files = new Set(
    (await new Response(listing.stdout).text()).split(/\r?\n/),
  );
  if (await listing.exited) throw new Error(`Could not list archive: ${path}`);

  return {
    files,
    async *rows(file, columns) {
      if (!files.has(file)) throw new Error(`Missing ${file} in ${path}`);
      const unzip = Bun.spawn(["unzip", "-p", path, file], {
        stderr: "inherit",
      });
      const input = Readable.from(unzip.stdout.values(), { objectMode: false });
      const csv = parse({
        bom: true,
        trim: true,
        skip_empty_lines: true,
        columns: (header: string[]) => {
          if (new Set(header).size !== header.length)
            throw new Error(`${file}: duplicate columns`);
          for (const field of columns) {
            if (!header.includes(field))
              throw new Error(`${file}: missing ${field} column`);
          }
          return header;
        },
      });
      input.on("error", (error) => csv.destroy(error));
      input.pipe(csv);
      try {
        for await (const row of csv) yield row as Row;
        if (await unzip.exited)
          throw new Error(`Failed extracting ${file} from ${path}`);
      } finally {
        input.destroy();
        csv.destroy();
        if (unzip.exitCode === null) unzip.kill();
        await unzip.exited;
      }
    },
  };
}
