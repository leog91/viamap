import { dublin } from "../../src/config/dublin";

const base = "https://www.transportforireland.ie/transitData/Data/";

export const dublinImport = {
  id: "dublin",
  coverage: dublin.coverage,
  feeds: [
    { id: "dublin-bus", operator: "Dublin Bus", file: "GTFS_Dublin_Bus.zip" },
    { id: "go-ahead", operator: "Go-Ahead Ireland", file: "GTFS_GoAhead.zip" },
    { id: "luas", operator: "Luas", file: "GTFS_LUAS.zip" },
    { id: "irish-rail", operator: "Irish Rail", file: "GTFS_Irish_Rail.zip" },
  ].map((feed) => ({ ...feed, url: `${base}${feed.file}` })),
};
