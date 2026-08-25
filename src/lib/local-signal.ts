import { lastAtr } from "@/lib/indicators";
import { confidenceLabel, confidenceScore, EMPTY_ADAPTER, type GrowAdapter, type LiveRules } from "@/lib/grow";
import { buildRecap, dropForming, scorePacks, volumePulse } from "@/lib/model/infer";
import { flowScore, flowStance, snapHang, type FlowVote, type OrderFlow } from "@/lib/orderflow";
import type { CandlePack, Signal, Snapshot, TradeTicket } from "./types";

export const SMALL_SIZE = 50;
export const TINY_SIZE = 20;

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

let hangLock: { t: number; side: string; hang: number } | null = null;
let leadLock: { t: number; side: "long" | "short"; led: boolean } | null = null;

export function ticketFor(
  bias: Signal["bias"],
  price: number,
  long: { target: number; stop: number },
  short: { target: number; stop: number },
  warn = false,
): TradeTicket {
  const step = price >= 50_000 ? 1 : 0.5;
  if (bias !== "long" && bias !== "short") {
    return { action: "wait", entry: roundTo(price, step), target: null, stop: null, sizeUsd: 0, atMarket: false };
  }
  const size = warn ? TINY_SIZE : SMALL_SIZE;
  if (bias === "long") {
    return {
      action: "long",
      entry: roundTo(price, step),
      target: long.target,
      stop: long.stop,
      sizeUsd: size,
      atMarket: false,
    };
  }
  return {
    action: "short",
    entry: roundTo(price, step),
    target: short.target,
    stop: short.stop,
    sizeUsd: size,
    atMarket: false,
  };
}

export function buildLocalSignal(
  snapshot: Snapshot,
  pack: CandlePack,
  hourly?: CandlePack | null,
  scalp?: CandlePack | null,
  adapter: GrowAdapter = EMPTY_ADAPTER,
  growNote = "",
  live: LiveRules | null = null,
  flow: OrderFlow | null = null,
  vote: FlowVote | null = null,
): Signal {
  const price = snapshot.price;
  const step = price >= 50_000 ? 1 : 0.5;
  const scored = scorePacks(pack.candles, hourly?.candles ?? [], adapter, live);
  const recap = pack.candles.length >= 48 ? buildRecap(pack.candles, hourly?.candles ?? [], adapter, live) : null;
  const closed = dropForming(pack.candles, 300);
  const barT = closed.at(-1)?.time ?? 0;
  const pulse = volumePulse(closed);

  const modelSide: "long" | "short" = scored.side === "short" ? "short" : "long";
  const speak = scored.speak && scored.hang != null;
  const chop = (scored.tape?.er ?? 0.3) <= 0.22;
  const kEdge = Math.abs(scored.up - 0.5);
  const weak = kEdge < 0.048 || chop;
  const flowP = vote?.p ?? 0.5;
  const fScore = flow ? flowScore(flow) : 0;
  const flowStrong = Boolean(vote?.confirmed) && Math.abs(fScore) >= 0.14;
  const volAgrees =
    (modelSide === "long" && pulse.vdelta >= 0.12) || (modelSide === "short" && pulse.vdelta <= -0.12);
  const blendUp = Math.min(0.72, Math.max(0.28, 0.58 * scored.up + 0.27 * flowP + 0.15 * pulse.p));

  let bias: "long" | "short" = modelSide;
  let led = false;
  if (speak) {
    if (leadLock && leadLock.t === barT && leadLock.led) {
      bias = leadLock.side;
      led = true;
    } else if (weak && flowStrong && vote && vote.side !== modelSide && !volAgrees) {
      bias = vote.side;
      led = true;
      leadLock = { t: barT, side: bias, led: true };
    } else {
      leadLock = { t: barT, side: modelSide, led: false };
    }
  }

  const confidence = confidenceScore({
    edge: Math.abs(blendUp - 0.5),
    recapAcc: recap?.acc ?? null,
    recapN: recap?.n ?? 0,
    warn: Boolean(recap?.warn),
    chop,
  });
  const stance = flowStance(bias, flow);
  let conf = confidence;
  if (led) conf = Math.min(56, conf);
  if (stance === "against" && !led) conf = Math.max(34, Math.round(conf * 0.86));
  if (stance === "agree") conf = Math.min(76, conf + 4);

  let sizeUsd = 0;
  if (speak) {
    const grown = live?.sizeUsd === 20 || live?.sizeUsd === 50 ? live.sizeUsd : SMALL_SIZE;
    sizeUsd = recap?.warn || conf < 52 || stance === "against" || led ? TINY_SIZE : grown;
  }

  const atr =
    lastAtr(scalp?.candles?.length ? scalp.candles : pack.candles, 14) ?? price * 0.002;
  let hang = scored.hang != null ? roundTo(scored.hang, step) : roundTo(scored.closeRef ?? price, step);
  if (hangLock && hangLock.t === barT && hangLock.side === bias) hang = hangLock.hang;
  else {
    hang = roundTo(snapHang(bias, hang, price, atr, flow, step), step);
    hangLock = { t: barT, side: bias, hang };
  }
  const tpK = live?.tpK ?? 0.9;
  const slK = live?.slK ?? 1.1;
  const longTarget = roundTo(hang + tpK * atr, step);
  const longStop = roundTo(hang - slK * atr, step);
  const shortTarget = roundTo(hang - tpK * atr, step);
  const shortStop = roundTo(hang + slK * atr, step);

  const ticket: TradeTicket = speak
    ? {
        action: bias,
        entry: hang,
        target: bias === "long" ? longTarget : shortTarget,
        stop: bias === "long" ? longStop : shortStop,
        sizeUsd,
        atMarket: false,
      }
    : {
        action: "wait",
        entry: hang,
        target: null,
        stop: null,
        sizeUsd: 0,
        atMarket: false,
      };

  const qty = ticket.sizeUsd && ticket.entry ? ticket.sizeUsd / ticket.entry : 0;
  const riskUsd =
    ticket.stop && ticket.entry ? Math.abs(ticket.entry - ticket.stop) * qty : 0;
  const sideWord = bias === "long" ? "买涨" : "买跌";
  const gap = Math.round(hang - price);
  const gapTxt =
    speak && Math.abs(gap) >= 1
      ? bias === "long"
        ? gap < 0
          ? `比现价低大约 ${Math.abs(gap)} 美元，挂上等它回来。`
          : `现价已经低于挂单价，还能挂就挂，过了等下一根。`
        : gap > 0
          ? `比现价高大约 ${gap} 美元，挂上等它弹回去。`
          : `现价已经高于挂单价，还能挂就挂，过了等下一根。`
      : "";
  const tape = scored.tape;
  const grasp = confidenceLabel(conf);
  const bookLine = flow
    ? led
      ? `${flow.bookLabel}，${flow.flowLabel}，K 线这一段不太明朗，这一笔按盘口。`
      : `${flow.bookLabel}，${flow.flowLabel}${
          stance === "agree"
            ? "，跟这一笔同向。"
            : stance === "against"
              ? "，跟这一笔反向，仓位先缩小，方向不改。"
              : "。"
        }`
    : "";
  const summary = !speak
    ? "K 线还在对齐，对齐后会一直给方向和挂单价。"
    : recap?.warn
      ? `${tape ? tape.label + "。" : ""}${grasp}。挂单${sideWord} ${Math.round(ticket.entry)}。最近这段猜偏了，这一笔只下 ${sizeUsd} 美元。`
      : `${tape ? tape.label + "。" : ""}${bookLine}${grasp}。挂单${sideWord} ${Math.round(ticket.entry)}。小资金 ${sizeUsd} 美元。`;

  const whyParts = [
    "挂单价同一根 5 分钟里不改。换方向、或者离开够远才改。",
    !speak
      ? "5 分钟收盘后才会动。"
      : led
        ? `K 线晃，这一笔按盘口${sideWord}，挂 ${Math.round(ticket.entry)}，仓位 ${sizeUsd} 美元。`
        : `一直${sideWord}，挂 ${Math.round(ticket.entry)}，不是现价。`,
    gapTxt,
    ticket.target
      ? `赚到 ${Math.round(ticket.target)} 就走，亏到 ${Math.round(ticket.stop ?? 0)} 就停，大约最多亏 ${riskUsd.toFixed(2)} 美元。`
      : "",
    bookLine,
    pulse.label + "。",
    qty ? `${sizeUsd} 美元大约是 ${qty.toFixed(5)} 个比特币。` : "",
    "分数还在中间晃的时候不换方向，所以不会一会儿买涨一会儿买跌。",
    led
      ? "只有 K 线晃、盘口又一边倒时才按盘口改方向，这一根 5 分钟里不再改。"
      : "K 线清楚时买涨买跌跟着已收盘的 5 分钟，盘口只改仓位和挂单价。",
    growNote ? growNote : "",
  ].filter(Boolean);

  return {
    bias,
    confidence: conf,
    summary,
    why: whyParts.join(" "),
    horizon: "挂单价跟着 5 分钟收盘走。顺着走、波动大时改得勤，横着走、安静时能挂很久。",
    risk: "从换方向到下一次换，大约十次对七次。不是保证。亏到价必须停。",
    long: {
      entryLow: hang,
      entryHigh: hang,
      target: longTarget,
      stop: longStop,
      note: "买涨用上面那张单。",
    },
    short: {
      entryLow: hang,
      entryHigh: hang,
      target: shortTarget,
      stop: shortStop,
      note: "买跌用上面那张单。",
    },
    ticket,
    priceAt: price,
    interval: pack.interval,
    createdAt: Date.now(),
    source: scored.ready ? "model" : "local",
    probs: { up: blendUp, down: 1 - blendUp },
    nextPx: ticket.entry,
    recap: recap
      ? {
          n: recap.n,
          hits: recap.hits,
          acc: recap.acc,
          biasBps: recap.biasBps,
          warn: recap.warn,
          rows: recap.rows.map((r) => ({
            time: r.time,
            predPx: r.predPx,
            actualPx: r.actualPx,
            ok: r.ok,
            side: r.side,
          })),
        }
      : undefined,
    tape: tape ? { label: `${tape.label}。${pulse.label}`, er: tape.er, volp: tape.volp } : undefined,
    growNote: growNote || undefined,
    confidenceLabel: grasp,
    book: flow
      ? {
          label: flow.bookLabel,
          flow: flow.flowLabel,
          stance,
          led,
          imb: flow.imb,
          tradeImb: flow.tradeImb,
          spreadBps: flow.spreadBps,
          bids: flow.bids,
          asks: flow.asks,
        }
      : undefined,
  };
}
