export const INTERVALS = ["1m", "5m", "15m", "1h", "6h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_LABEL: Record<Interval, string> = {
  "1m": "1分",
  "5m": "5分",
  "15m": "15分",
  "1h": "1小时",
  "6h": "6小时",
  "1d": "1日",
};

export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Snapshot = {
  price: number;
  bid: number;
  ask: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  time: string;
  source: "coinbase";
};

export type CandlePack = {
  interval: Interval;
  granularity: number;
  candles: Candle[];
  rsi: number | null;
  sma7: number | null;
  sma25: number | null;
};

export type SidePlan = {
  entryLow: number;
  entryHigh: number;
  target: number;
  stop: number;
  note: string;
};

export type TradeTicket = {
  action: "long" | "short" | "wait";
  entry: number;
  target: number | null;
  stop: number | null;
  sizeUsd: number;
  atMarket: boolean;
};

export type Signal = {
  bias: "long" | "short" | "neutral";
  confidence: number;
  summary: string;
  why: string;
  horizon: string;
  risk: string;
  long: SidePlan;
  short: SidePlan;
  ticket: TradeTicket;
  priceAt: number;
  interval: Interval;
  createdAt: number;
  source: "grok" | "local" | "model";
  probs?: { up: number; down: number };
  nextPx?: number;
  recap?: {
    n: number;
    hits: number;
    acc: number | null;
    biasBps: number | null;
    warn: boolean;
    rows: Array<{
      time: number;
      predPx: number;
      actualPx: number;
      ok: boolean;
      side: "long" | "short" | "flat";
    }>;
  };
  tape?: { label: string; er: number; volp: number };
  growNote?: string;
  confidenceLabel?: string;
  book?: {
    label: string;
    flow: string;
    stance: "agree" | "against" | "neutral";
    led: boolean;
    imb: number;
    tradeImb: number;
    spreadBps: number;
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  };
};

export type PositionSide = "long" | "short";

export type Position = {
  id: string;
  side: PositionSide;
  entryPrice: number;
  sizeUsd: number;
  qty: number;
  openedAt: number;
  stopLoss?: number;
  takeProfit?: number;
  closedAt?: number;
  closePrice?: number;
  closeReason?: "manual" | "stop" | "tp";
};

export function parseInterval(value: unknown): Interval {
  return INTERVALS.includes(value as Interval) ? (value as Interval) : "1h";
}

export function change24h(snapshot: Snapshot) {
  if (!snapshot.open24h) return 0;
  return ((snapshot.price - snapshot.open24h) / snapshot.open24h) * 100;
}

export function pnlUsd(position: Position, mark: number) {
  if (position.side === "long") {
    return position.qty * (mark - position.entryPrice);
  }
  return position.qty * (position.entryPrice - mark);
}

export function pnlPct(position: Position, mark: number) {
  if (!position.entryPrice) return 0;
  if (position.side === "long") {
    return ((mark - position.entryPrice) / position.entryPrice) * 100;
  }
  return ((position.entryPrice - mark) / position.entryPrice) * 100;
}
