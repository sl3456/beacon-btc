import type { Candle } from "./types";

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period - 1;
  for (let i = start + 1; i <= start + period; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = start + period + 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function smaSeries(closes: number[], period: number): Array<number | null> {
  return closes.map((_, i) => {
    if (i + 1 < period) return null;
    const slice = closes.slice(i + 1 - period, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function packFromCandles(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  return {
    rsi: rsi(closes, 14),
    sma7: sma(closes, 7),
    sma25: sma(closes, 25),
  };
}

export function lastAtr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    sum += tr;
  }
  return sum / period;
}

export function applyLiveCandle(
  candles: Candle[],
  price: number,
  granularity: number,
  nowSec = Math.floor(Date.now() / 1000),
): Candle[] {
  if (!candles.length || !Number.isFinite(price)) return candles;
  const bucket = Math.floor(nowSec / granularity) * granularity;
  const last = candles[candles.length - 1]!;
  if (last.time === bucket) {
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        close: price,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
      },
    ];
  }
  if (bucket > last.time) {
    return [
      ...candles,
      {
        time: bucket,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: 0,
      },
    ];
  }
  return candles;
}
