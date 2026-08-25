import { useEffect, useRef } from "react";
import { HANG_ARMS, hintArm, learnKnobs, pickKnobs, SIZE_ARMS, SL_ARMS, TP_ARMS } from "@/lib/bandit";
import { EMPTY_ADAPTER, type TrainRecipe } from "@/lib/grow";
import { reviewGrow } from "@/lib/grow.functions";
import { useGrow } from "@/lib/grow-store";
import { buildBook, dropForming, frozenLive } from "@/lib/model/infer";
import { growFitTrades } from "@/lib/model/online";
import { replaySim, stepDesk, summarize } from "@/lib/sim-desk";
import type { Candle, Signal } from "@/lib/types";

const GROK_GAP_MS = 90 * 60 * 1000;
const LOW_GAP_MS = 10 * 60 * 1000;
const LOCAL_RECIPE: TrainRecipe = {
  train: true, correct: false, lr: 0.05, steps: 3, l2: 0.16, enter: 0.51,
  hangDeadDelta: 0, hangK: null, tpK: null, slK: null, sizeUsd: null, focus: null,
  note: "本地模拟成交后小步训练",
};

function nearest(arms: readonly number[], v: number | null) {
  if (v == null || !Number.isFinite(v)) return null;
  return arms.reduce((a, b) => (Math.abs(a - v) < Math.abs(b - v) ? a : b));
}

export function useGrowCoach(
  signal: Signal | null,
  closedBarTime: number | null,
  candles: Candle[] | null,
  hourly: Candle[] | null,
) {
  const live = useGrow((s) => s.live);
  const bandit = useGrow((s) => s.bandit);
  const deskPos = useGrow((s) => s.deskPos);
  const deskWorking = useGrow((s) => s.deskWorking);
  const lastSide = useGrow((s) => s.lastSide);
  const lastReviewAt = useGrow((s) => s.lastReviewAt);
  const setLive = useGrow((s) => s.setLive);
  const patchLive = useGrow((s) => s.patchLive);
  const setNote = useGrow((s) => s.setNote);
  const bumpFills = useGrow((s) => s.bumpFills);
  const clearFills = useGrow((s) => s.clearFills);
  const setBandit = useGrow((s) => s.setBandit);
  const setDesk = useGrow((s) => s.setDesk);
  const setSim = useGrow((s) => s.setSim);
  const markAttempt = useGrow((s) => s.markAttempt);
  const busy = useRef(false);
  const started = useRef(0);
  const lastSimBar = useRef<number | null>(null);

  useEffect(() => { void useGrow.persist.rehydrate(); started.current = Date.now(); }, []);

  useEffect(() => {
    if (!signal || !candles || candles.length < 80 || closedBarTime == null) return;
    if (lastSimBar.current === closedBarTime) return;
    lastSimBar.current = closedBarTime;
    const hour = hourly ?? [];
    const closed = dropForming(candles, 300);
    const bar = closed[closed.length - 1];
    if (!bar) return;
    const chop = (signal.tape?.er ?? 0.3) <= 0.22;
    let b = bandit;
    if (!b.last) {
      const k = pickKnobs(b, chop);
      b = { ...b, last: k };
      patchLive(k);
      setBandit(b);
    }
    const action = signal.ticket.action;
    const next =
      action === "long" || action === "short"
        ? { side: action, hang: signal.ticket.entry, target: signal.ticket.target ?? signal.ticket.entry, stop: signal.ticket.stop ?? signal.ticket.entry }
        : null;
    const flipped = lastSide != null && action !== "wait" && action !== lastSide;
    const stepped = stepDesk(deskPos, deskWorking, bar, next, flipped);
    if (stepped.closed?.filled) {
      b = learnKnobs(b, stepped.closed.pnl);
      const k = pickKnobs(b, chop);
      b = { ...b, last: k };
      patchLive(k);
      setBandit(b);
      const nFill = bumpFills();
      if (nFill >= 4) {
        const grownTrades = replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, live));
        const before = summarize(grownTrades);
        const recipe: TrainRecipe = { ...LOCAL_RECIPE, enter: live?.enter ?? 0.51, hangDeadDelta: live?.hangDeadDelta ?? 0 };
        const challenger = growFitTrades(candles, hour, live, recipe, grownTrades);
        const after = summarize(replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, challenger)));
        if (after.pnl >= before.pnl) {
          patchLive(challenger);
          setNote(`本地第 ${challenger.nFits} 次训练。模拟大约 ${after.pnl >= 0 ? "赚" : "亏"} ${Math.abs(after.pnl).toFixed(2)} 美元。`);
        }
        clearFills();
      }
    }
    setDesk(stepped.pos, stepped.working, action === "wait" ? lastSide : action);
    const grown = summarize(replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, live)));
    const factory = summarize(replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, null)));
    setSim(grown, factory);
  }, [signal, candles, hourly, closedBarTime, live, bandit, deskPos, deskWorking, lastSide, patchLive, setBandit, setDesk, setSim, bumpFills, clearFills, setNote]);

  useEffect(() => {
    if (!signal?.recap || closedBarTime == null || !candles || candles.length < 80) return;
    if (Date.now() - started.current < 40_000) return;
    const low = signal.confidence < 52 || Boolean(signal.recap.warn) || Boolean(signal.book?.led);
    const gap = low ? LOW_GAP_MS : GROK_GAP_MS;
    if (Date.now() - lastReviewAt < gap) return;
    if (busy.current) return;
    if (!signal.ticket.entry) return;
    const hour = hourly ?? [];
    const grownTrades = replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, live));
    const factoryTrades = replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, null));
    const grown = summarize(grownTrades);
    const factory = summarize(factoryTrades);
    if (!low && grown.filled < 8) return;
    if (low && grown.filled < 3 && signal.recap.n < 4) return;
    busy.current = true;
    const pack = live ?? frozenLive();
    void reviewGrow({
      data: {
        recap: signal.recap.rows.map((r) => ({ time: r.time, predPx: r.predPx, actualPx: r.actualPx, ok: r.ok, side: r.side })),
        tape: signal.tape?.label ?? "",
        up: signal.probs?.up ?? 0.5,
        side: signal.ticket.action,
        hang: signal.ticket.entry,
        confidence: signal.confidence,
        price: signal.priceAt,
        w: pack.w,
        enter: pack.enter,
        nFits: pack.nFits,
        urgent: low,
        book: signal.book ? `${signal.book.label}，${signal.book.flow}${signal.book.led ? "，这一笔按盘口" : ""}` : "",
        sim: grown,
        frozenSim: factory,
      },
    })
      .then((res) => {
        if (!res.ok || !res.usedGrok || !res.recipe) { markAttempt(); return; }
        const recipe = res.recipe;
        let b = bandit;
        const ctx = (signal.tape?.er ?? 0.3) <= 0.22 ? "chop" : "trend";
        const hk = nearest(HANG_ARMS, recipe.hangK);
        const tp = nearest(TP_ARMS, recipe.tpK);
        const sl = nearest(SL_ARMS, recipe.slK);
        const sz = nearest(SIZE_ARMS, recipe.sizeUsd);
        if (hk != null) b = hintArm(b, ctx, "hangK", hk);
        if (tp != null) b = hintArm(b, ctx, "tpK", tp);
        if (sl != null) b = hintArm(b, ctx, "slK", sl);
        if (sz != null) b = hintArm(b, ctx, "sizeUsd", sz);
        setBandit(b);
        const challenger = growFitTrades(candles, hour, live, recipe, grownTrades);
        const after = summarize(replaySim(candles, buildBook(candles, hour, EMPTY_ADAPTER, challenger)));
        if (after.pnl >= grown.pnl) {
          setLive(
            { ...challenger, hangK: live?.hangK ?? 0.18, tpK: live?.tpK ?? 0.9, slK: live?.slK ?? 1.1, sizeUsd: live?.sizeUsd ?? 50 },
            recipe.note || `主模型训练了第 ${challenger.nFits} 次。模拟大约 ${after.pnl >= 0 ? "赚" : "亏"} ${Math.abs(after.pnl).toFixed(2)} 美元。`,
          );
        } else {
          setLive(live, recipe.note || "这次没比现在更好，先不换，下轮再纠正。");
        }
      })
      .catch(() => markAttempt())
      .finally(() => { busy.current = false; });
  }, [signal, closedBarTime, candles, hourly, live, bandit, lastReviewAt, setLive, setBandit, markAttempt]);
}
