import { createServerFn } from "@tanstack/react-start";
import { packFromCandles } from "./indicators";
import { buildLocalSignal, ticketFor } from "./local-signal";
import { fromBookAndTrades, type OrderFlow } from "./orderflow";
import {
  INTERVAL_SECONDS,
  parseInterval,
  type Candle,
  type CandlePack,
  type Interval,
  type SidePlan,
  type Signal,
  type Snapshot,
} from "./types";
import { xaiApiKey } from "./xai-key.server";

const COINBASE = "https://api.exchange.coinbase.com";
const UA = "Beacon/1.0 (BTC-USD monitor)";

async function coinbase<T>(path: string): Promise<T> {
  const res = await fetch(`${COINBASE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`行情源暂时不可用（${res.status}）`);
  return (await res.json()) as T;
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("行情数据不完整");
  return n;
}

async function fetchSnapshot(): Promise<Snapshot> {
  const [ticker, stats] = await Promise.all([
    coinbase<{ price: string; bid: string; ask: string; time: string }>("/products/BTC-USD/ticker"),
    coinbase<{ open: string; high: string; low: string; volume: string }>("/products/BTC-USD/stats"),
  ]);
  return {
    price: num(ticker.price),
    bid: num(ticker.bid),
    ask: num(ticker.ask),
    open24h: num(stats.open),
    high24h: num(stats.high),
    low24h: num(stats.low),
    volume24h: num(stats.volume),
    time: ticker.time,
    source: "coinbase",
  };
}

async function fetchCandles(interval: Interval): Promise<CandlePack> {
  const granularity = INTERVAL_SECONDS[interval];
  const now = Math.floor(Date.now() / 1000);
  const count = interval === "1d" ? 120 : 180;
  const start = new Date((now - granularity * count) * 1000).toISOString();
  const end = new Date(now * 1000).toISOString();
  const raw = await coinbase<number[][]>(
    `/products/BTC-USD/candles?granularity=${granularity}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  const candles: Candle[] = raw
    .map((row) => ({
      time: num(row[0]),
      low: num(row[1]),
      high: num(row[2]),
      open: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
    }))
    .sort((a, b) => a.time - b.time);
  const uniq: Candle[] = [];
  for (const c of candles) {
    const last = uniq[uniq.length - 1];
    if (last && last.time === c.time) uniq[uniq.length - 1] = c;
    else uniq.push(c);
  }
  return { interval, granularity, candles: uniq, ...packFromCandles(uniq) };
}

export const getSnapshot = createServerFn({ method: "GET" }).handler(async () => fetchSnapshot());

export const getCandles = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({
    interval: parseInterval(
      input && typeof input === "object" && "interval" in input
        ? (input as { interval?: unknown }).interval
        : "1h",
    ),
  }))
  .handler(async ({ data }): Promise<CandlePack> => fetchCandles(data.interval));

export const getOrderFlow = createServerFn({ method: "GET" }).handler(async (): Promise<OrderFlow | null> => {
  try {
    const [book, trades] = await Promise.all([
      coinbase<{ bids: unknown[]; asks: unknown[] }>("/products/BTC-USD/book?level=2"),
      coinbase<Array<{ price?: unknown; size?: unknown; side?: unknown }>>("/products/BTC-USD/trades?limit=100"),
    ]);
    return fromBookAndTrades(book.bids ?? [], book.asks ?? [], trades ?? []);
  } catch {
    return null;
  }
});

type RawPlan = { entry_low?: unknown; entry_high?: unknown; target?: unknown; stop?: unknown; note?: unknown };
type RawSignal = {
  bias?: unknown; confidence?: unknown; summary?: unknown; why?: unknown; horizon?: unknown; risk?: unknown;
  long?: RawPlan; short?: RawPlan;
};

function asNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function asText(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function roundPrice(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizePlan(raw: RawPlan | undefined, side: "long" | "short", price: number): SidePlan {
  const band = price * 0.012;
  const wide = price * 0.06;
  let entryLow = asNum(raw?.entry_low) ?? price - band;
  let entryHigh = asNum(raw?.entry_high) ?? price + band * 0.3;
  let target = asNum(raw?.target) ?? (side === "long" ? price * 1.035 : price * 0.965);
  let stop = asNum(raw?.stop) ?? (side === "long" ? price * 0.978 : price * 1.022);
  const lo = price * 0.85;
  const hi = price * 1.15;
  entryLow = clamp(entryLow, lo, hi);
  entryHigh = clamp(entryHigh, lo, hi);
  target = clamp(target, price - wide * 1.6, price + wide * 1.6);
  stop = clamp(stop, price - wide, price + wide);
  if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];
  if (side === "long") {
    if (stop >= entryLow) stop = entryLow * 0.985;
    if (target <= entryHigh) target = entryHigh * 1.02;
  } else {
    if (stop <= entryHigh) stop = entryHigh * 1.015;
    if (target >= entryLow) target = entryLow * 0.98;
  }
  return {
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    target: roundPrice(target),
    stop: roundPrice(stop),
    note: asText(raw?.note, side === "long" ? "等待回落到买入区间。" : "等待反弹到开空区间。"),
  };
}

function parseJsonObject(text: string): RawSignal {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回有效结论");
  return JSON.parse(raw.slice(start, end + 1)) as RawSignal;
}

let lastSignalAt = 0;

export const askSignal = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({
    interval: parseInterval(
      input && typeof input === "object" && "interval" in input
        ? (input as { interval?: unknown }).interval
        : "1h",
    ),
  }))
  .handler(async ({ data }): Promise<{ ok: true; signal: Signal } | { ok: false; error: string }> => {
    const apiKey = xaiApiKey();
    let snapshot: Snapshot;
    let pack: CandlePack;
    try {
      [snapshot, pack] = await Promise.all([fetchSnapshot(), fetchCandles(data.interval)]);
    } catch {
      return { ok: false, error: "行情读取失败。" };
    }
    if (!apiKey) return { ok: true, signal: buildLocalSignal(snapshot, pack) };
    const now = Date.now();
    if (now - lastSignalAt < 8000) return { ok: false, error: "请稍等几秒再推算。" };
    lastSignalAt = now;
    const tail = pack.candles.slice(-36).map((c) => ({
      t: c.time, o: roundPrice(c.open), h: roundPrice(c.high), l: roundPrice(c.low), c: roundPrice(c.close),
    }));
    const payload = {
      pair: "BTC-USD",
      interval: data.interval,
      price: snapshot.price,
      bid: snapshot.bid,
      ask: snapshot.ask,
      open24h: snapshot.open24h,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h,
      volume24h_btc: snapshot.volume24h,
      rsi14: pack.rsi,
      sma7: pack.sma7,
      sma25: pack.sma25,
      candles: tail,
    };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "你是面向加密货币新手的风控向导。只输出一个 JSON。bias(long|short|neutral), confidence, summary, why, horizon, risk, long, short。",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return { ok: true, signal: buildLocalSignal(snapshot, pack) };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      const raw = parseJsonObject(text);
      const bias = raw.bias === "long" || raw.bias === "short" || raw.bias === "neutral" ? raw.bias : "neutral";
      const confidence = clamp(Math.round(asNum(raw.confidence) ?? 50), 0, 100);
      const long = normalizePlan(raw.long, "long", snapshot.price);
      const short = normalizePlan(raw.short, "short", snapshot.price);
      const signal: Signal = {
        bias,
        confidence,
        summary: asText(raw.summary, "先看位置，再决定是否动手。"),
        why: asText(raw.why, "价格、均线与波动需要一起看。"),
        horizon: asText(raw.horizon, "先观察当前周期。"),
        risk: asText(raw.risk, "加密货币波动极大。"),
        long,
        short,
        ticket: ticketFor(bias, snapshot.price, long, short),
        priceAt: snapshot.price,
        interval: data.interval,
        createdAt: Date.now(),
        source: "grok",
      };
      return { ok: true, signal };
    } catch {
      return { ok: true, signal: buildLocalSignal(snapshot, pack) };
    }
  });
