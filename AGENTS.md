# ViaMap project conventions

- Read `docs/development-plan.md` before expanding scope. Build the current milestone only.
- Use Bun for installs and project scripts; commit `bun.lock` and the generated TanStack route tree. Do not hand-edit the route tree.
- Keep TypeScript strict. Run `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build` before handing off.
- Keep MapLibre client-only. React owns selection; MapLibre owns camera and GeoJSON rendering. Prefer layers over individual markers for larger datasets.
- Store coordinates in `[longitude, latitude]` order. Name distance units explicitly and never label a straight-line radius as walking distance or travel time.
- Keep city-specific configuration separate. Process real GTFS offline, keep provenance and licence with generated data, and never substitute invented transport services.
- Follow official docs. Do not install agent skills or add major infrastructure without approval.
