import { Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Coordinates } from "../../geo/catchment";
import { type Place, searchPlaces } from "../../geo/place-search";

export function PlaceSearch({
  onSelect,
}: {
  onSelect: (coordinates: Coordinates) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const request = useRef<AbortController | undefined>(undefined);
  const lastRequest = useRef(0);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (
      term.length < 3 ||
      status === "loading" ||
      Date.now() - lastRequest.current < 1000
    )
      return;
    lastRequest.current = Date.now();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    setResults([]);
    try {
      const places = await searchPlaces(
        term,
        AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      );
      if (controller.signal.aborted) return;
      setResults(places);
      setStatus("ready");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }

  return (
    <section
      className="panel search-panel"
      aria-labelledby="place-search-title"
    >
      <h2 id="place-search-title">Find a place</h2>
      <search>
        <form className="place-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="place-search">
            Address, station or neighbourhood
          </label>
          <input
            id="place-search"
            type="search"
            placeholder="Street, station or neighbourhood"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={160}
            minLength={3}
            required
            autoComplete="off"
          />
          <button type="submit" disabled={status === "loading"}>
            <Search size={16} aria-hidden="true" /> Search
          </button>
        </form>
      </search>
      <p>
        Submitted searches are sent to{" "}
        <a href="https://photon.komoot.io/">Photon</a> using{" "}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{" "}
        data.
      </p>
      {status === "loading" && <p role="status">Searching…</p>}
      {status === "error" && (
        <p role="alert">
          Place search is unavailable. You can still select an origin on the
          map.
        </p>
      )}
      {status === "ready" && !results.length && (
        <p role="status">No results. Try adding the city name.</p>
      )}
      {!!results.length && (
        <ul className="result-scroll">
          {results.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.coordinates);
                  setResults([]);
                  setStatus("idle");
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
