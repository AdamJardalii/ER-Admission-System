import { useCallback, useEffect, useState } from "react";

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useAsyncResource<T>(load: () => Promise<T>): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The request could not be completed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { data, loading, error, retry };
}
