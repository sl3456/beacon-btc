import type { Candle } from "@/lib/types";
import type { LiveRules, TrainRecipe } from "@/lib/grow";
import type { SimTrade } from "@/lib/sim-desk";
import { designAt, dropForming, frozenLive, MODEL_KEYS } from "@/lib/model/infer";

function sigmoid(z: number) {
  if (z > 12) return 1;
  if (z < -12) return 0;
  return 1 / (1 + Math.exp(-z));
}

function clipW(w: number[]) {
  return w.map((v) => Math.min(1.6, Math.max(-1.6, v)));
}

/** Train only on filled sim trades. Keep the update if it does not explode. */
export function growFitTrades(
  candles: Candle[],
  hourly: Candle[],
  live: LiveRules | null,
  recipe: TrainRecipe,
  trades: SimTrade[],
): LiveRules {
  const closed = dropForming(candles, 300);
  const cur: LiveRules = live ? { ...live, w: live.w.slice() } : frozenLive();
  const filled = trades.filter((t) => t.filled);
  if (!recipe.train || filled.length < 4) {
    return { ...cur, updatedAt: Date.now() };
  }
  const byTime = new Map(closed.map((c, i) => [c.time, i]));
  const rows: { x: number[]; y: number; wt: number }[] = [];
  for (const t of filled) {
    const i = byTime.get(t.entryTime);
    if (i == null || i < 40) continue;
    const win = closed.slice(Math.max(0, i + 1 - 300), i + 1);
    const got = designAt(win, hourly, cur);
    if (!got) continue;
    rows.push({ x: got.x, y: t.win ? 1 : 0, wt: recipe.correct && !t.win ? 2.4 : 1 });
  }
  let w = cur.w.slice();
  if (rows.length >= 4) {
    const d = w.length;
    const focusAt = recipe.focus ? MODEL_KEYS.indexOf(recipe.focus) + 1 : -1;
    for (let s = 0; s < recipe.steps; s++) {
      const g = new Array(d).fill(0);
      let wsum = 0;
      for (const row of rows) {
        const x = row.x.slice();
        if (focusAt > 0 && focusAt < x.length) x[focusAt] *= 1.25;
        let z = 0;
        for (let j = 0; j < d && j < x.length; j++) z += (w[j] ?? 0) * (x[j] ?? 0);
        const p = sigmoid(z);
        const err = (p - row.y) * row.wt;
        wsum += row.wt;
        for (let j = 0; j < d && j < x.length; j++) g[j] += err * (x[j] ?? 0);
      }
      const n = Math.max(1e-6, wsum);
      for (let j = 0; j < d; j++) {
        const reg = j === 0 ? 0 : recipe.l2 * (w[j] ?? 0);
        w[j] = (w[j] ?? 0) - recipe.lr * (g[j]! / n + reg);
      }
    }
  }
  return {
    w: clipW(w),
    enter: recipe.enter,
    hangDeadDelta: recipe.hangDeadDelta,
    hangK: cur.hangK,
    tpK: cur.tpK,
    slK: cur.slK,
    sizeUsd: cur.sizeUsd,
    nFits: (cur.nFits ?? 0) + 1,
    updatedAt: Date.now(),
  };
}
