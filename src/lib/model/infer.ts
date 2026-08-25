import type { GrowAdapter, LiveRules } from "@/lib/grow";
import { EMPTY_ADAPTER } from "@/lib/grow";
import type { Candle } from "@/lib/types";
import weights from "./weights.json";

const rules = weights.rules as {
  kind: string;
  htfGate?: boolean;
  mode?: string;
  confCut?: number;
  hangK?: number;
  tpK?: number;
  slK?: number;
  enter?: number;
  persistBars?: number;
  hangDead?: number;
  keys: string[];
  mean: number[];
  std: number[];
  w: number[];
};

const reflect = (weights as { reflect?: { window: number; cut: number; minN: number; enabled?: boolean } }).reflect;

export const MODEL_KEYS = rules.keys;

export function frozenLive(): LiveRules {
  return {
    w: (rules.w ?? []).slice(),
    enter: rules.enter ?? 0.51,
    hangDeadDelta: 0,
    hangK: rules.hangK ?? 0.18,
    tpK: rules.tpK ?? 0.9,
    slK: rules.slK ?? 1.1,
    sizeUsd: 50,
    nFits: 0,
    updatedAt: 0,
  };
}

function granSec() {
  return 300;
}

export function dropForming(candles: Candle[], gran: number): Candle[] {
  if (!candles.length) return [];
  const copy = candles.slice();
  const last = copy[copy.length - 1]!;
  const now = Math.floor(Date.now() / 1000);
  if (now < last.time + gran) copy.pop();
  return copy;
}

function sma(values: number[], period: number, end: number): number | null {
  if (end + 1 < period) return null;
  let s = 0;
  for (let i = end + 1 - period; i <= end; i++) s += values[i]!;
  return s / period;
}

function rsiAt(closes: number[], end: number, period = 14): number | null {
  if (end < period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  const avgG = gain / period;
  const avgL = loss / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function rangePos(highs: number[], lows: number[], close: number, end: number, period: number): number | null {
  if (end + 1 < period) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = end + 1 - period; i <= end; i++) {
    hi = Math.max(hi, highs[i]!);
    lo = Math.min(lo, lows[i]!);
  }
  if (!(hi > lo)) return null;
  return (close - lo) / (hi - lo);
}

function stdev(values: number[], period: number, end: number): number | null {
  const m = sma(values, period, end);
  if (m == null) return null;
  let s = 0;
  for (let i = end + 1 - period; i <= end; i++) {
    const d = values[i]! - m;
    s += d * d;
  }
  return Math.sqrt(s / period);
}

function atrAt(candles: Candle[], end: number, period = 14): number | null {
  if (end < period) return null;
  let s = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    s += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  }
  return s / period;
}

function vwapDev(candles: Candle[], end: number): number | null {
  const day = Math.floor(candles[end]!.time / 86400);
  let pv = 0;
  let vv = 0;
  for (let i = 0; i <= end; i++) {
    const c = candles[i]!;
    if (Math.floor(c.time / 86400) !== day) continue;
    const typ = (c.high + c.low + c.close) / 3;
    pv += typ * (c.volume || 0);
    vv += c.volume || 0;
  }
  if (!(vv > 0)) return null;
  return candles[end]!.close / (pv / vv) - 1;
}

function featsAt(candles: Candle[], end: number): number[] | null {
  if (end < 24) return null;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const close = closes[end]!;
  const rsi = rsiAt(closes, end, 14);
  const pos = rangePos(highs, lows, close, end, 24);
  const mid = sma(closes, 20, end);
  const sd = stdev(closes, 20, end);
  const bb = mid != null && sd != null && sd > 0 ? (close - mid) / (2 * sd) : null;
  const prev = closes[end - 1];
  const ret1 = prev ? close / prev - 1 : null;
  const vd = vwapDev(candles, end);
  const atr = atrAt(candles, end, 14);
  const atrn = atr != null && close > 0 ? atr / close : null;
  const stoch = rangePos(highs, lows, close, end, 14);
  if (rsi == null || pos == null || bb == null || ret1 == null || vd == null || atrn == null || stoch == null) {
    return null;
  }
  const mr = ((50 - rsi) / 50) * (0.5 - pos);
  const span = candles[end]!.high - candles[end]!.low;
  const clv = span === 0 ? 0 : (2 * close - candles[end]!.high - candles[end]!.low) / span;
  return [rsi, pos, bb, ret1, vd, atrn, stoch, mr, clv];
}

function zRow(raw: number[], live: LiveRules | null): number[] | null {
  const mean = rules.mean;
  const std = rules.std;
  if (raw.length !== mean.length) return null;
  const x = [1];
  for (let i = 0; i < raw.length; i++) {
    const s = std[i] || 1;
    x.push((raw[i]! - mean[i]!) / s);
  }
  const w = live?.w ?? rules.w;
  if (x.length !== w.length) return x;
  return x;
}

function logitUp(candles: Candle[], _hourly: Candle[], live: LiveRules | null): number | null {
  const end = candles.length - 1;
  const raw = featsAt(candles, end);
  if (!raw) return null;
  const x = zRow(raw, live);
  if (!x) return null;
  const w = live?.w ?? rules.w;
  let z = 0;
  for (let j = 0; j < w.length && j < x.length; j++) z += (w[j] ?? 0) * (x[j] ?? 0);
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function designAt(candles: Candle[], hourly: Candle[], live: LiveRules | null): { x: number[] } | null {
  const p = logitUp(candles, hourly, live);
  if (p == null) return null;
  const raw = featsAt(candles, candles.length - 1);
  if (!raw) return null;
  const x = zRow(raw, live);
  if (!x) return null;
  return { x };
}

type HeldBar = {
  time: number;
  close: number;
  atr: number;
  p: number;
  side: 1 | -1;
  flipped: boolean;
};

function schmittSide(p: number, cur: 1 | -1, enter: number): 1 | -1 | 0 {
  if (cur > 0) return p <= 1 - enter ? -1 : 0;
  return p >= enter ? 1 : 0;
}

function walkHeld(
  closed: Candle[],
  hourly: Candle[],
  lookback: number,
  _adapter: GrowAdapter,
  live: LiveRules | null,
): HeldBar[] {
  const enter = live?.enter ?? rules.enter ?? 0.51;
  const persist = rules.persistBars ?? 1;
  const start = Math.max(40, closed.length - lookback);
  const out: HeldBar[] = [];
  let cur: 1 | -1 = 1;
  let run = 0;
  let want: 1 | -1 | 0 = 0;
  let seeded = false;
  for (let i = start; i < closed.length; i++) {
    const win = closed.slice(Math.max(0, i + 1 - 300), i + 1);
    const p = logitUp(win, hourly, live);
    const atr = atrAt(closed, i, 14) ?? closed[i]!.close * 0.002;
    if (p == null) continue;
    if (!seeded) {
      cur = p >= 0.5 ? 1 : -1;
      seeded = true;
    }
    const hit = schmittSide(p, cur, enter);
    let flipped = false;
    if (hit) {
      if (want === hit) run += 1;
      else {
        want = hit;
        run = 1;
      }
      if (run >= persist) {
        cur = hit;
        run = 0;
        want = 0;
        flipped = out.length > 0;
      }
    } else {
      run = 0;
      want = 0;
    }
    out.push({
      time: closed[i]!.time,
      close: closed[i]!.close,
      atr,
      p,
      side: cur,
      flipped,
    });
  }
  return out;
}

function tapeLabel(er: number, volp: number) {
  if (er >= 0.42 && volp >= 0.55) return "顺着走、波动也大";
  if (er >= 0.42) return "顺着走、波动一般";
  if (er <= 0.22 && volp <= 0.4) return "横着走、比较安静";
  if (er <= 0.22) return "横着走";
  return "不顺不横";
}

function tapeFromHeld(held: HeldBar[]) {
  const win = held.slice(-12);
  if (win.length < 8) return { er: 0.3, volp: 0.5, label: "K 线还少" };
  const a = win[0]!.close;
  const b = win[win.length - 1]!.close;
  let path = 0;
  for (let i = 1; i < win.length; i++) path += Math.abs(win[i]!.close - win[i - 1]!.close);
  const er = path > 0 ? Math.abs(b - a) / path : 0;
  const last = win[win.length - 1]!;
  let below = 0;
  for (const bar of win) if (bar.atr <= last.atr) below += 1;
  const volp = below / win.length;
  return { er, volp, label: tapeLabel(er, volp) };
}

function hangDead(er: number, volp: number, adapter: GrowAdapter, live: LiveRules | null) {
  const d =
    0.34 +
    0.42 * (1 - 0.4 * er - 0.6 * volp) +
    (adapter.hangDeadDelta ?? 0) +
    (live?.hangDeadDelta ?? 0);
  return Math.min(0.9, Math.max(0.32, d));
}

export type ModelProbs = {
  up: number;
  down: number;
  ready: boolean;
  speak: boolean;
  side: "long" | "short" | "flat";
  hang: number | null;
  target: number | null;
  stop: number | null;
  closeRef: number | null;
  tape: { er: number; volp: number; label: string } | null;
};

function noneQuote(): ModelProbs {
  return {
    up: 0.5,
    down: 0.5,
    ready: false,
    speak: false,
    side: "flat",
    hang: null,
    target: null,
    stop: null,
    closeRef: null,
    tape: null,
  };
}

function quoteFromHeld(held: HeldBar[], adapter: GrowAdapter = EMPTY_ADAPTER, live: LiveRules | null = null): ModelProbs {
  if (!held.length) return noneQuote();
  const last = held[held.length - 1]!;
  const hangK = live?.hangK ?? rules.hangK ?? 0.18;
  const tpK = live?.tpK ?? rules.tpK ?? 0.9;
  const slK = live?.slK ?? rules.slK ?? 1.1;
  const tape = tapeFromHeld(held);
  const dead = hangDead(tape.er, tape.volp, adapter, live);
  let hang: number | null = null;
  let hangAtr = last.atr;
  let pending = 0;
  for (const b of held) {
    const long = b.side > 0;
    const proposed = long ? b.close - hangK * b.atr : b.close + hangK * b.atr;
    if (hang == null || b.flipped) {
      hang = proposed;
      hangAtr = b.atr;
      pending = 0;
    } else if (Math.abs(proposed - hang) >= dead * b.atr) {
      pending += 1;
      if (pending >= 2) {
        hang = proposed;
        hangAtr = b.atr;
        pending = 0;
      }
    } else {
      pending = 0;
    }
  }
  const long = last.side > 0;
  const h = hang ?? last.close;
  const target = long ? h + tpK * hangAtr : h - tpK * hangAtr;
  const stop = long ? h - slK * hangAtr : h + slK * hangAtr;
  return {
    up: last.p,
    down: 1 - last.p,
    ready: true,
    speak: true,
    side: long ? "long" : "short",
    hang: h,
    target,
    stop,
    closeRef: last.close,
    tape,
  };
}

export type BookBar = {
  time: number;
  close: number;
  atr: number;
  side: 1 | -1;
  flipped: boolean;
  hang: number;
  target: number;
  stop: number;
};

export function buildBook(
  m15: Candle[],
  hourly: Candle[],
  adapter: GrowAdapter = EMPTY_ADAPTER,
  live: LiveRules | null = null,
  lookback = 220,
): BookBar[] {
  const closed = dropForming(m15, granSec());
  const held = walkHeld(closed, hourly, lookback, adapter, live);
  if (!held.length) return [];
  const hangK = live?.hangK ?? rules.hangK ?? 0.18;
  const tpK = live?.tpK ?? rules.tpK ?? 0.9;
  const slK = live?.slK ?? rules.slK ?? 1.1;
  const tape = tapeFromHeld(held);
  const dead = hangDead(tape.er, tape.volp, adapter, live);
  const out: BookBar[] = [];
  let hang: number | null = null;
  let hangAtr = held[0]!.atr;
  let pending = 0;
  for (const b of held) {
    const long = b.side > 0;
    const proposed = long ? b.close - hangK * b.atr : b.close + hangK * b.atr;
    if (hang == null || b.flipped) {
      hang = proposed;
      hangAtr = b.atr;
      pending = 0;
    } else if (Math.abs(proposed - hang) >= dead * b.atr) {
      pending += 1;
      if (pending >= 2) {
        hang = proposed;
        hangAtr = b.atr;
        pending = 0;
      }
    } else {
      pending = 0;
    }
    const h = hang;
    out.push({
      time: b.time,
      close: b.close,
      atr: b.atr,
      side: b.side,
      flipped: b.flipped,
      hang: h,
      target: long ? h + tpK * hangAtr : h - tpK * hangAtr,
      stop: long ? h - slK * hangAtr : h + slK * hangAtr,
    });
  }
  return out;
}

export function scorePacks(
  m15: Candle[],
  hourly: Candle[],
  adapter: GrowAdapter,
  live: LiveRules | null = null,
): ModelProbs {
  const closed = dropForming(m15, granSec());
  if (closed.length < 40) return noneQuote();
  const held = walkHeld(closed, hourly, 220, adapter, live);
  return quoteFromHeld(held, adapter, live);
}

export type RecapRow = {
  time: number;
  predPx: number;
  actualPx: number;
  ok: boolean;
  side: "long" | "short" | "flat";
};

export function buildRecap(
  m15: Candle[],
  hourly: Candle[],
  adapter: GrowAdapter,
  live: LiveRules | null = null,
) {
  const closed = dropForming(m15, granSec());
  const held = walkHeld(closed, hourly, 220, adapter, live);
  const rows: RecapRow[] = [];
  const flips = [0];
  for (let i = 1; i < held.length; i++) if (held[i]!.flipped) flips.push(i);
  flips.push(held.length - 1);
  for (let k = 0; k < flips.length - 1; k++) {
    const a = held[flips[k]!]!;
    const b = held[flips[k + 1]!]!;
    if (b.time <= a.time) continue;
    const long = a.side > 0;
    const ok = long ? b.close > a.close : b.close < a.close;
    rows.push({
      time: a.time,
      predPx: a.close,
      actualPx: b.close,
      ok,
      side: long ? "long" : "short",
    });
  }
  const window = reflect?.window ?? 16;
  const tail = rows.slice(-window);
  const n = tail.length;
  const hits = tail.filter((r) => r.ok).length;
  const acc = n ? hits / n : null;
  const warn = Boolean(reflect?.enabled) && n >= (reflect?.minN ?? 6) && acc != null && acc < (reflect?.cut ?? 0.48);
  let bias = 0;
  if (tail.length) {
    for (const r of tail) bias += (r.actualPx - r.predPx) / r.predPx;
    bias = (bias / tail.length) * 10_000;
  }
  return { n, hits, acc, biasBps: tail.length ? bias : null, warn, rows: tail };
}
