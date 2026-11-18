import { useEffect, useState } from "react";
import { loadTransitIndex } from "../../transit/load";

type TransitState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; index: T };

export function useTransit(url: string | undefined) {
  return useDataset(url, loadTransitIndex);
}

export function useDataset<Key, T>(
  key: Key | undefined,
  load: (key: Key, signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<TransitState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry starts a new request.
  useEffect(() => {
    if (key === undefined) return;
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(15_000);
    load(key, AbortSignal.any([controller.signal, timeout])).then(
      (index) => {
        if (!controller.signal.aborted) setState({ status: "ready", index });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [key, load, attempt]);
  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }
  return { state, retry };
}
