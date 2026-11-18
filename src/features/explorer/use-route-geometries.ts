import { useEffect, useMemo, useRef, useState } from "react";
import { loadRouteGeometry } from "../../transit/load-geometry";
import type { TransitRoute } from "../../transit/model";
import type { RouteGeometry } from "../../transit/route-data";

export function useRouteGeometries(routes: TransitRoute[], directory: string) {
  const requests = useRef(new Map<string, Promise<RouteGeometry | null>>());
  const [results, setResults] = useState(
    new Map<string, RouteGeometry | null>(),
  );
  const assets = useMemo(
    () =>
      routes.flatMap((route) =>
        route.geometry
          ? [
              {
                url: `${directory}${route.geometry}`,
                route: route.id,
              },
            ]
          : [],
      ),
    [routes, directory],
  );
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry re-runs this request batch.
  useEffect(() => {
    let current = true;
    let frame: number | undefined;
    const pending = new Map<string, RouteGeometry | null>();
    const cache = requests.current;
    for (const asset of assets) {
      let request = cache.get(asset.url);
      if (!request) {
        request = loadRouteGeometry(asset.url, asset.route).catch(() => null);
        cache.set(asset.url, request);
      }
      void request.then((geometry) => {
        if (!current) return;
        pending.set(asset.url, geometry);
        if (frame !== undefined) return;
        frame = requestAnimationFrame(() => {
          frame = undefined;
          const updates = [...pending];
          pending.clear();
          setResults((previous) => {
            if (
              updates.every(
                ([key, value]) =>
                  previous.has(key) && previous.get(key) === value,
              )
            )
              return previous;
            return new Map([...previous, ...updates]);
          });
        });
      });
    }
    return () => {
      current = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [assets, attempt]);

  return useMemo(() => {
    const data = [];
    let loading = 0;
    let failed = 0;
    for (const { url } of assets) {
      const result = results.get(url);
      if (result === undefined) loading++;
      else if (result === null) failed++;
      else data.push(result);
    }
    return {
      data,
      loading,
      failed,
      retry: () => {
        const failures = new Set(
          assets
            .filter(({ url }) => results.get(url) === null)
            .map(({ url }) => url),
        );
        for (const url of failures) requests.current.delete(url);
        setResults(
          (previous) =>
            new Map([...previous].filter(([url]) => !failures.has(url))),
        );
        setAttempt((value) => value + 1);
      },
    };
  }, [assets, results]);
}
