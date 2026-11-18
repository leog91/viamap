# ViaMap · Public transport explorer

ViaMap is a personal map for exploring public transport accessibility. Dublin, Amsterdam and Barcelona have scheduled data for selected operators. Barcelona also shows official transit locations and an FGC network overlay. Buenos Aires shows Subte entrances, the Subte network and both Línea Roca branches through Quilmes. Dashed network lines are not reachable routes or travel times. The notice below each city heading explains coverage and flags when imported schedule dates don’t cover today.

## Run locally

Install [Bun](https://bun.sh/) (developed with 1.4.4) and Node.js 24 LTS for the Vite and Wrangler CLIs.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000`. The app opens in Dublin with a 500 m radius. Click or tap the map to move the point, use **Find a place** to search, and adjust the radius with the slider or presets. Select a stop marker or a stop in the sidebar for details. With a keyboard, focus the map canvas, pan with the arrow keys and select **Use map centre**. The reset button resets the origin and view, not the radius.

Use **Fit data area** to see the dashed blue boundary of the boarding-stop study area. **Data boundary** hides or shows the outline. It marks where the app looks for boarding stops from the imported feeds, not an administrative boundary or a guarantee that all local operators are included.

In Buenos Aires, **Location extent** outlines the published Subte entrances instead. It does not represent service coverage; reference lines can extend beyond it. In Barcelona the boundary shows the Renfe search area, not the full FGC network. Use **Fit network** for the reference lines.

You can move between cities without using the selector. Select an origin inside another supported area and the dataset switches without changing your map view or radius. If you only pan into another area, **Use [city] data here** selects that map centre without silently changing the origin. Browsing elsewhere does not imply ViaMap coverage.

### Search, compare, walk and check a direct trip

- **Find a place:** submit an address, station or neighbourhood. The query goes directly to [Photon](https://github.com/komoot/photon) (OpenStreetMap data); there is no search-as-you-type or server-side storage. Set `VITE_PLACE_SEARCH_URL` at build time to use a different Photon-compatible instance.
- **Compare two locations:** save the current origin as A, then move the origin to B in the same city. Both use the same straight-line radius. Counts show the imported dataset, not every service. The saved pin is session-only.
- **Walking catchment:** explicitly request an approximate walking-distance polygon or measure the pedestrian route to a selected stop. The stop list and comparison still use straight-line distance. The routing provider receives the origin plus the budget or destination. The default [Valhalla/FOSSGIS demo](https://github.com/valhalla/valhalla#demo-server) is for light personal use; follow its notification and identifying header guidance before publishing a public app, or set `VITE_VALHALLA_BASE_URL` to an approved endpoint. Neither remote demo has an uptime guarantee.
- **Scheduled direct trips:** in Dublin, Amsterdam or Barcelona, save A, select B, and enter the local date and time you can be at a boarding stop. ViaMap checks departures in the next four hours and shows the wait after that ready time and the scheduled ride duration. It checks several nearby boarding and alighting stops, not a door-to-door route. If more than 12 route IDs are available from A, choose one to limit downloads. Transfers, walking connections, live delays, dates around daylight-saving changes, and conditional pickups/drop-offs are excluded.

Use **Route lines** to toggle modes or individual routes; this only changes map visibility, not the stop and schedule results. **Fit visible routes** zooms to their full extent, which can include trips outside Dublin. Green, yellow, orange and red correspond to 0, 2.5, 6, and 12+ km on board. Each directional trip pattern starts at an eligible boarding point; where another nearby stop allows boarding, that path’s distance starts over. Overlapping directions may show the shorter-distance colour on top. Lines follow the vehicle's path, not the area you can reach on foot, and a passing line doesn't imply that you can get off there.

```sh
bun test
bun run lint
bun run typecheck
bun run build
bun run preview
```

The basemap requires an internet connection and WebGL. The radius is geographic distance as the crow flies, not a pedestrian service area. Origin and radius are session UI state, not persisted or sent to ViaMap's Worker.

## Sources and attribution

- **Basemap:** [OpenFreeMap Positron](https://openfreemap.org/quick_start/), © [OpenMapTiles](https://www.openmaptiles.org/), data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL. Keep the provider-supplied MapLibre attribution. See the [service terms](https://openfreemap.org/tos/) (as-is hosted service, no scraping; limited offline downloads only within the provider's rules). ViaMap uses normal interactive tiles only; it does not prefetch areas or host a tile cache.
- **Transit:** [National Transport Authority / Transport for Ireland static GTFS](https://www.transportforireland.ie/transitData/PT_Data.html), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), filtered and transformed for ViaMap. The bundled snapshot covers Dublin Bus, Go-Ahead Ireland, Luas and Irish Rail services in the study box (roughly greater Dublin; not an administrative boundary). Other operators are not included. Results mean a service boards there on at least one date in the imported schedule, not necessarily today or at the selected time. The UI distinguishes out-of-area searches, outdated feeds, and data loading errors from genuine zero results.
- **Amsterdam:** GVB bus, tram, metro and ferry plus domestic NS trains from [openOV / OVapi](https://gtfs.ovapi.nl/nl/). Other operators and international NS services are not included. See the [schedule and shape licence notices](public/data/amsterdam/NOTICE.txt); the adapted route-shape database is available under ODbL 1.0.
- **Barcelona:** [Renfe/Rodalies schedules](https://data.renfe.com/dataset/horarios-cercanias), [Open Data BCN transit locations](https://opendata-ajuntament.barcelona.cat/data/dataset/transports) and [FGC reference geometry](https://dadesobertes.fgc.cat/explore/assets/gtfs_routes/) (CC BY 4.0). TMB’s scheduled feed has separate reuse terms; the national access point’s applicable downloads require an API key. No TMB or general bus schedules are bundled.
- **Buenos Aires (CABA):** [BA Data / SBASE Subte entrances](https://data.buenosaires.gob.ar/dataset/bocas-subte) and [Subte line alignments](https://data.buenosaires.gob.ar/dataset/subte-estaciones) (CC BY 2.5 Argentina). The published geometry is reference only; the timetable archive ends in 2021 and the portal marks GTFS datasets suspended for review.
- **Quilmes:** [BA Data / Trenes Argentinos](https://data.buenosaires.gob.ar/dataset/trenes-gtfs) (CC BY 2.5 Argentina) provides the archived 2020 alignments for the La Plata and Bosques branches via Quilmes. Branches were cross-checked against [official Línea Roca information](https://www.argentina.gob.ar/transporte/trenes-argentinos/horarios-tarifas-y-recorridos/areametropolitana/linearoca); archived schedules, bus coverage, and live status are not used.

## Refresh the transit dataset

With `unzip` on your `PATH`, run:

```sh
bun run gtfs:import
# Or reuse official archives saved under their original filenames:
bun run gtfs:import --from /path/to/gtfs-archives
# Amsterdam: use a saved OVapi national archive named gtfs-nl.zip
bun run gtfs:import amsterdam --from /path/to/gtfs-archives
```

Amsterdam can also be refreshed with `bun run gtfs:import amsterdam`. The national ZIP is large; download it once per needed refresh, not per request. Check `licenses.txt` for any changes to redistribution terms on replacement snapshots.
Barcelona's Renfe snapshot refreshes with `bun run gtfs:import barcelona` (or `--from` a directory containing `fomento_transit.zip`). The importer stages gzip-compressed timetables per route; they are fetched on demand only when a direct-trip search is submitted.

Refresh the location-only files with `bun scripts/import-locations.ts barcelona` and `bun scripts/import-locations.ts caba`. Both commands accept an optional local copy of the official source file.

To regenerate network overlays, download [SBASE `red_subte.geojson`](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/sbase/subte-estaciones/red_subte.geojson) or the [Trenes Argentinos rail archive](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/transporte-y-obras-publicas/trenes-gtfs/trenes-gtfs.zip), then run `bun scripts/import-reference-network.ts caba red_subte.geojson` or `bun scripts/import-reference-network.ts quilmes trenes-gtfs.zip`.
For Barcelona, download the [FGC routes JSON](https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/gtfs_routes/records?limit=100) and run `bun scripts/import-reference-network.ts barcelona fgc-routes.json`.

The importer downloads or opens each archive, validates CSV/relationships, publishes content-addressed files under `public/data/dublin/geometry/`, then replaces `public/data/dublin/index.json` only after all four feeds succeed. Keep the generated index and its referenced geometry assets in the project so a fresh checkout works without a separate download. The browser requests the index once per production page load, then loads geometry only for enabled nearby routes. Cloudflare can cache fingerprinted assets without caching an old index indefinitely. Importing leaves prior content-addressed assets in place so already-open pages can still find them; unreferenced older assets can be removed before a release if backward continuity isn’t needed. Compressed full patterns, shapes, calendars, timing outputs and archive checksums go under ignored `.gtfs/dublin/`; they are not deployed. Regenerate before deploying if the bundled schedule dates are outdated.

Some variants have ambiguous or inconsistent shape-to-stop matches and are omitted from the map. Their services remain in the schedule results. The app reports when an enabled route has no reliable geometry from current boarding stops.

See the [development plan](docs/development-plan.md) for the verified download links, coverage, import design and later phases.

## Deploy to Cloudflare Workers

The Vite plugin builds the browser and Worker bundles; the Start server entry handles page rendering. No bindings, database, or external data ingestion run on the Worker.

```sh
bun run build
bun run preview
bun run deploy
```

Deployment requires your own authenticated Wrangler session and Cloudflare account. To validate packaging without publishing, run `bun run build` followed by `bunx wrangler deploy --dry-run`. For the next phases and their acceptance criteria, see the [development plan](docs/development-plan.md).
