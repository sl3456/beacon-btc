export type BookLevel = { price: number; size: number };

export type OrderFlow = {
  mid: number;
  spreadBps: number;
  imb: number;
  tradeImb: number;
  bookLabel: string;
  flowLabel: string;
  bids: BookLevel[];
  asks: BookLevel[];
  hot: "buy" | "sell" | null;
  emaScore?: number;
  at: number;
};

function n(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function fromBookAndTrades(
  bids: unknown[],
  asks: unknown[],
  trades: Array<{ price?: unknown; size?: unknown; side?: unknown }>,
): OrderFlow | null {
  const bidLv = levels(bids).sort((a, b) => b.price - a.price).slice(0, 12);
  const askLv = levels(asks).sort((a, b) => a.price - b.price).slice(0, 12);
  if (!bidLv.length || !askLv.length) return null;
  const mid = (bidLv[0]!.price + askLv[0]!.price) / 2;
  if (!(mid > 0)) return null;
  const spreadBps = ((askLv[0]!.price - bidLv[0]!.price) / mid) * 10_000;
  const band = mid * 0.0012;
  let bidNear = 0;
  let askNear = 0;
  for (const lv of bidLv) if (lv.price >= mid - band) bidNear += lv.size;
  for (const lv of askLv) if (lv.price <= mid + band) askNear += lv.size;
  const den = bidNear + askNear;
  const imb = den > 0 ? (bidNear - askNear) / den : 0;
  let buy = 0;
  let sell = 0;
  for (const t of trades.slice(0, 100)) {
    const sz = n(t.size);
    // Coinbase public trade `side` is the maker. Taker buy = maker sell.
    if (t.side === "sell") buy += sz;
    else if (t.side === "buy") sell += sz;
  }
  const td = buy + sell;
  const tradeImb = td > 0 ? (buy - sell) / td : 0;
  const sizes = trades.slice(0, 100).map((t) => n(t.size)).filter((s) => s > 0).sort((a, b) => a - b);
  const med = sizes.length ? sizes[Math.floor(sizes.length / 2)]! : 0;
  let hotBuy = 0;
  let hotSell = 0;
  if (med > 0) {
    for (const t of trades.slice(0, 40)) {
      const sz = n(t.size);
      if (sz < 2 * med) continue;
      if (t.side === "sell") hotBuy += 1;
      else if (t.side === "buy") hotSell += 1;
    }
  }
  const hot: "buy" | "sell" | null =
    hotBuy >= 2 && hotBuy > hotSell ? "buy" : hotSell >= 2 && hotSell > hotBuy ? "sell" : null;
  return {
    mid,
    spreadBps,
    imb,
    tradeImb,
    bookLabel: imb >= 0.12 ? "买盘更厚" : imb <= -0.12 ? "卖盘更厚" : "两边差不多",
    flowLabel:
      tradeImb >= 0.15 ? "刚成交偏有人在买" : tradeImb <= -0.15 ? "刚成交偏有人在卖" : "刚成交两边都有",
    bids: bidLv.slice(0, 6),
    asks: askLv.slice(0, 6),
    hot,
    at: Date.now(),
  };
}

function levels(rows: unknown[]): BookLevel[] {
  const out: BookLevel[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = n(row[0]);
    const size = n(row[1]);
    if (price > 0 && size > 0) out.push({ price, size });
  }
  return out;
}

export type FlowVote = {
  p: number;
  score: number;
  side: "long" | "short";
  confirmed: boolean;
};

export type FlowGate = { side: 1 | -1; run: number; want: 0 | 1 | -1 };

export function flowScore(flow: OrderFlow) {
  if (typeof flow.emaScore === "number" && Number.isFinite(flow.emaScore)) return flow.emaScore;
  return 0.5 * flow.imb + 0.5 * flow.tradeImb;
}

export function flowP(flow: OrderFlow) {
  const s = Math.min(0.45, Math.max(-0.45, flowScore(flow)));
  return Math.min(0.72, Math.max(0.28, 0.5 + s));
}

export function stepFlowGate(prev: FlowGate | null, flow: OrderFlow): { gate: FlowGate; vote: FlowVote } {
  const score = flowScore(flow);
  const p = flowP(flow);
  const lean: 1 | -1 = score >= 0 ? 1 : -1;
  const enter = 0.555;
  const persist = flow.hot ? 1 : 2;
  let gate: FlowGate = prev ?? { side: lean, run: 0, want: 0 };
  const hit = gate.side > 0 ? p <= 1 - enter : p >= enter;
  if (hit) {
    if (gate.want === -gate.side) gate = { ...gate, run: gate.run + 1 };
    else gate = { ...gate, want: -gate.side as 1 | -1, run: 1 };
    if (gate.run >= persist) gate = { side: -gate.side as 1 | -1, run: 0, want: 0 };
  } else {
    gate = { ...gate, run: 0, want: 0 };
  }
  if (flow.hot === "buy" && gate.side < 0 && p >= enter) gate = { side: 1, run: 0, want: 0 };
  if (flow.hot === "sell" && gate.side > 0 && p <= 1 - enter) gate = { side: -1, run: 0, want: 0 };
  const confirmed = Math.abs(score) >= 0.1 || Boolean(flow.hot);
  return {
    gate,
    vote: { p, score, side: gate.side > 0 ? "long" : "short", confirmed },
  };
}

export function flowStance(side: "long" | "short" | "neutral", flow: OrderFlow | null): "agree" | "against" | "neutral" {
  if (!flow || side === "neutral") return "neutral";
  const score = flowScore(flow);
  if (side === "long") {
    if (score >= 0.1) return "agree";
    if (score <= -0.12) return "against";
    return "neutral";
  }
  if (score <= -0.1) return "agree";
  if (score >= 0.12) return "against";
  return "neutral";
}

export function snapHang(
  side: "long" | "short",
  hang: number,
  price: number,
  atr: number,
  flow: OrderFlow | null,
  step: number,
): number {
  if (!flow || !(atr > 0)) return hang;
  const lo = hang - 0.35 * atr;
  const hi = hang + 0.35 * atr;
  if (side === "long") {
    let wall: BookLevel | null = null;
    for (const lv of flow.bids) {
      if (lv.price < lo || lv.price > Math.min(hi, price - step)) continue;
      if (!wall || lv.size > wall.size) wall = lv;
    }
    if (wall && wall.size > 0) return Math.round(wall.price / step) * step;
  } else {
    let wall: BookLevel | null = null;
    for (const lv of flow.asks) {
      if (lv.price > hi || lv.price < Math.max(lo, price + step)) continue;
      if (!wall || lv.size > wall.size) wall = lv;
    }
    if (wall && wall.size > 0) return Math.round(wall.price / step) * step;
  }
  return hang;
}
