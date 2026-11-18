import type { Coordinates } from "../geo/catchment";
import { withinBounds } from "../transit/accessibility";
import type { Bounds } from "../transit/model";
import { dublin } from "./dublin";

type Source = {
  publisher: string;
  url: string;
  terms: string;
  termsUrl: string;
  scope: string;
  notice?: string;
  mapCredit?: string;
};
type NetworkSource = {
  url: string;
  sourceUrl: string;
  name: string;
  description: string;
};
export interface CityView {
  id: string;
  name: string;
  center: Coordinates;
  overview?: Bounds;
  zoom: number;
  style: string;
  coverage?: Bounds;
  detectBounds?: Bounds;
  transitIndex?: string;
  locations?: string;
  network?: { urls: readonly string[]; sources: readonly NetworkSource[] };
  geometryDirectory?: string;
  source?: Source;
  locationSource?: Source;
  travelInfo?: { url: string; label: string };
}

export const amsterdam = {
  id: "amsterdam",
  name: "Amsterdam, Netherlands",
  center: [4.8925, 52.34167],
  zoom: 14,
  style: dublin.style,
  coverage: [4.77, 52.28, 5.01, 52.43],
  transitIndex: "/data/amsterdam/index.json",
  geometryDirectory: "/data/amsterdam/geometry/",
  source: {
    publisher: "openOV / OVapi",
    url: "https://gtfs.ovapi.nl/nl/",
    terms: "Open-data terms",
    termsUrl: "https://gtfs.ovapi.nl/README",
    scope:
      "GVB bus, tram, metro and ferry services, plus domestic NS trains. Other operators and international NS services are not included.",
    notice: "/data/amsterdam/NOTICE.txt",
    mapCredit: "openOV / OVapi · Route shapes ODbL",
  },
} satisfies CityView;

const buenosAiresOverview: Bounds = [-58.44, -34.74, -58.245, -34.57];
const buenosAiresNetworkSources = [
  {
    name: "Subte",
    url: "/data/caba/network.geojson",
    sourceUrl: "https://data.buenosaires.gob.ar/dataset/subte-estaciones",
    description:
      "Lines A–E and H from SBASE / BA Data (CC BY 2.5 Argentina). Reference geometry may not reflect closures or changes.",
  },
  {
    name: "Línea Roca",
    url: "/data/quilmes/network.geojson",
    sourceUrl: "https://data.buenosaires.gob.ar/dataset/trenes-gtfs",
    description:
      "Trenes Argentinos / BA Data geometry from 2020 (CC BY 2.5 Argentina), for Constitución–La Plata and Constitución–Bosques via Quilmes. Older alignments may differ from today.",
  },
] as const satisfies readonly NetworkSource[];
const buenosAiresNetwork = {
  urls: buenosAiresNetworkSources.map(({ url }) => url),
  sources: buenosAiresNetworkSources,
};

export const barcelona = {
  id: "barcelona",
  name: "Barcelona, Spain",
  center: [2.17089, 41.38739],
  zoom: 14,
  style: dublin.style,
  locations: "/data/barcelona/locations.json",
  coverage: [1.99, 41.28, 2.29, 41.51],
  transitIndex: "/data/barcelona/index.json",
  geometryDirectory: "/data/barcelona/geometry/",
  network: {
    urls: ["/data/barcelona/network.geojson"],
    sources: [
      {
        name: "FGC",
        url: "/data/barcelona/network.geojson",
        sourceUrl: "https://dadesobertes.fgc.cat/explore/assets/gtfs_routes/",
        description:
          "Selected Barcelona-area Ferrocarrils de la Generalitat de Catalunya alignments (CC BY 4.0). Not the full TMB metro, Rodalies, tram or bus networks.",
      },
    ],
  },
  locationSource: {
    publisher: "Ajuntament de Barcelona / Open Data BCN",
    url: "https://opendata-ajuntament.barcelona.cat/data/dataset/transports",
    terms: "CC BY 4.0",
    termsUrl: "https://creativecommons.org/licenses/by/4.0/",
    scope: "Published metro, FGC, rail and tram access points.",
  },
  source: {
    publisher: "Renfe Data",
    url: "https://data.renfe.com/dataset/horarios-cercanias",
    terms: "CC BY 4.0",
    termsUrl: "https://creativecommons.org/licenses/by/4.0/",
    scope:
      "Renfe/Rodalies schedules only, plus official access points and FGC reference lines. No TMB or general bus schedules.",
  },
} satisfies CityView;

export const cities: readonly CityView[] = [
  dublin,
  amsterdam,
  barcelona,
  {
    id: "caba",
    name: "Buenos Aires, Argentina",
    center: [-58.38162, -34.60374],
    overview: buenosAiresOverview,
    detectBounds: [-58.56, -34.92, -57.91, -34.52],
    zoom: 14,
    style: dublin.style,
    locations: "/data/caba/locations.json",
    network: buenosAiresNetwork,
    source: {
      publisher: "Subterráneos de Buenos Aires (SBASE) / BA Data",
      url: "https://data.buenosaires.gob.ar/dataset/bocas-subte",
      terms: "CC BY 2.5 Argentina",
      termsUrl: "https://creativecommons.org/licenses/by/2.5/ar/",
      scope:
        "Published Subte entrances plus Subte and Línea Roca reference lines. No buses or schedules.",
    },
    travelInfo: {
      url: "https://www.argentina.gob.ar/transporte/trenes-argentinos/horarios-tarifas-y-recorridos/areametropolitana/linearoca",
      label: "Official Línea Roca schedules and route information",
    },
  },
];

// Detection zones pick a dataset; they are not a promise of operator coverage.
export function cityAt(coordinates: Coordinates) {
  return cities.find((city) => {
    const bounds = city.detectBounds ?? city.coverage;
    return bounds && withinBounds(coordinates, bounds);
  });
}

export function cityLabel(city: CityView) {
  return city.name.split(",")[0] ?? city.name;
}
