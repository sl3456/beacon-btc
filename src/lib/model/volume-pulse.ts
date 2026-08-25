import type { Candle } from "@/lib/types";

/** Closed candles only. Last bar must already be finished. */
export function volumePulse(candles: Candle[]): {
  vdelta: number;
  volr: number;
  p: number;
  label: string;
} {
  const end = candles.length - 1;
  const empty = { vdelta: 0, volr: 1, p: 0.5, label: "成交量还少" };
  if (end < 24) return empty;
  let mean = 0;
  for (let i = end - 20; i < end; i++) mean += candles[i]!.volume || 0;
  mean /= 20;
  const last = candles[end]!;
  const volr = mean > 0 ? last.volume / mean : 1;
  let buy = 0;
  let sell = 0;
  for (let i = Math.max(0, end - 5); i <= end; i++) {
    const c = candles[i]!;
    if (c.close >= c.open) buy += c.volume || 0;
    else sell += c.volume || 0;
  }
  const den = buy + sell;
  const vdelta = den > 0 ? (buy - sell) / den : 0;
  const p = Math.min(0.72, Math.max(0.28, 0.5 + 0.45 * Math.max(-0.45, Math.min(0.45, vdelta))));
  const label =
    vdelta >= 0.18 && volr >= 1.2
      ? "刚收的量偏买、也比较大"
      : vdelta <= -0.18 && volr >= 1.2
        ? "刚收的量偏卖、也比较大"
        : vdelta >= 0.18
          ? "刚收的量偏买"
          : vdelta <= -0.18
            ? "刚收的量偏卖"
            : volr >= 1.4
              ? "刚收的量比较大，方向一般"
              : "刚收的量两边都有";
  return { vdelta, volr, p, label };
}
