import type { Coordinates } from "../geo/catchment";
import type { Bounds } from "../transit/model";

// Public neighbourhood centre, not a residential address.
export const dublin = {
  id: "dublin",
  name: "Dublin, Ireland",
  center: [-6.2302, 53.3656] satisfies Coordinates,
  zoom: 14,
  style: "https://tiles.openfreemap.org/styles/positron",
  // Study bounds for nearby boarding, not a limit on downstream trip geometry.
  coverage: [-6.53, 53.17, -5.98, 53.57] satisfies Bounds,
  transitIndex: "/data/dublin/index.json",
  geometryDirectory: "/data/dublin/geometry/",
  source: {
    publisher: "National Transport Authority",
    url: "https://www.transportforireland.ie/transitData/PT_Data.html",
    terms: "CC BY 4.0",
    termsUrl: "https://creativecommons.org/licenses/by/4.0/",
    scope:
      "Dublin Bus, Go-Ahead Ireland, Luas and Irish Rail. Other operators are not included.",
  },
};
