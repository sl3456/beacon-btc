import { useEffect, useState } from "react";
import { getCandles } from "@/lib/market.functions";
import type { CandlePack, Interval } from "@/lib/types";

export function useCandlePack(interval: Interval, refreshMs: number) {
  const [pack, setPack] = useState<CandlePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let first = true;

    const load = async () => {
      try {
        const data = await getCandles({ data: { interval } });
        if (cancelled) return;
        setPack(data);
        setError(null);
      } catch {
        if (cancelled) return;
        if (first) setError("K 线暂时读不到，稍后会再试。");
      } finally {
        if (!cancelled && first) {
          setLoading(false);
          first = false;
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [interval, refreshMs]);

  return { pack, error, loading };
}
