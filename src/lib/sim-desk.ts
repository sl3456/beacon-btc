import type { Candle } from "@/lib/types";
import type { BookBar } from "@/lib/model/infer";

export type SimTrade = {
  side: "long" | "short";
  entry: number;
  exit: number;
  pnl: number;
  filled: boolean;
  win: boolean;
  entryTime: number;
  exitTime: number;
};

export type SimSummary = {
  n: number;
  filled: number;
  missed: number;
  wins: number;
  pnl: number;
  updatedAt: number;
};

const SIZE = 50;

export type LiveOrder = {
  side: "long" | "short";
  hang: number;
  target: number;
  stop: number;
};

export type LivePos = {
  side: "long" | "short";
  entry: number;
  target: number;
  stop: number;
  entryTime: number;
};

function tradeOf(pos: LivePos, exit: number, time: number, filled: boolean): SimTrade {
  const qty = SIZE / pos.entry;
  const pnl = pos.side === "long" ? (exit - pos.entry) * qty : (pos.entry - exit) * qty;
  return {
    side: pos.side,
    entry: pos.entry,
    exit,
    pnl,
    filled,
    win: pnl > 0,
    entryTime: pos.entryTime,
    exitTime: time,
  };
}

export function stepDesk(
  pos: LivePos | null,
  working: LiveOrder | null,
  candle: Candle,
  nextOrder: LiveOrder | null,
  flipped: boolean,
): { pos: LivePos | null; working: LiveOrder | null; closed: SimTrade | null } {
  let closed: SimTrade | null = null;
  if (pos) {
    let exit: number | null = null;
    if (pos.side === "long") {
      if (candle.low <= pos.stop) exit = pos.stop;
      else if (candle.high >= pos.target) exit = pos.target;
    } else if (candle.high >= pos.stop) exit = pos.stop;
    else if (candle.low <= pos.target) exit = pos.target;
    if (exit == null && flipped) exit = candle.close;
    if (exit != null) {
      closed = tradeOf(pos, exit, candle.time, true);
      pos = null;
    }
  }
  if (!pos && working) {
    if (working.side === "long" && candle.low <= working.hang) {
      pos = {
        side: "long",
        entry: working.hang,
        target: working.target,
        stop: working.stop,
        entryTime: candle.time,
      };
      working = null;
    } else if (working.side === "short" && candle.high >= working.hang) {
      pos = {
        side: "short",
        entry: working.hang,
        target: working.target,
        stop: working.stop,
        entryTime: candle.time,
      };
      working = null;
    }
  }
  if (flipped) working = null;
  if (!pos && nextOrder) working = nextOrder;
  return { pos, working, closed };
}

export function replaySim(candles: Candle[], book: BookBar[]): SimTrade[] {
  const byTime = new Map(candles.map((c) => [c.time, c]));
  const trades: SimTrade[] = [];
  let pos: {
    side: "long" | "short";
    entry: number;
    target: number;
    stop: number;
    entryTime: number;
  } | null = null;
  let working: { side: "long" | "short"; hang: number; target: number; stop: number } | null = null;

  const closePos = (exit: number, time: number, filled: boolean) => {
    if (!pos) return;
    const qty = SIZE / pos.entry;
    const pnl =
      pos.side === "long" ? (exit - pos.entry) * qty : (pos.entry - exit) * qty;
    trades.push({
      side: pos.side,
      entry: pos.entry,
      exit,
      pnl,
      filled,
      win: pnl > 0,
      entryTime: pos.entryTime,
      exitTime: time,
    });
    pos = null;
  };

  for (let i = 0; i < book.length; i++) {
    const b = book[i]!;
    const c = byTime.get(b.time);
    if (!c) continue;

    if (pos) {
      if (pos.side === "long") {
        if (c.low <= pos.stop) closePos(pos.stop, b.time, true);
        else if (c.high >= pos.target) closePos(pos.target, b.time, true);
      } else if (c.high >= pos.stop) closePos(pos.stop, b.time, true);
      else if (c.low <= pos.target) closePos(pos.target, b.time, true);
      if (pos && b.flipped) closePos(c.close, b.time, true);
    }

    if (!pos && working) {
      if (working.side === "long" && c.low <= working.hang) {
        pos = {
          side: "long",
          entry: working.hang,
          target: working.target,
          stop: working.stop,
          entryTime: b.time,
        };
        working = null;
      } else if (working.side === "short" && c.high >= working.hang) {
        pos = {
          side: "short",
          entry: working.hang,
          target: working.target,
          stop: working.stop,
          entryTime: b.time,
        };
        working = null;
      }
    }

    const side = b.side > 0 ? "long" : "short";
    if (b.flipped && working) {
      trades.push({
        side: working.side,
        entry: working.hang,
        exit: working.hang,
        pnl: 0,
        filled: false,
        win: false,
        entryTime: b.time,
        exitTime: b.time,
      });
    }
    working = { side, hang: b.hang, target: b.target, stop: b.stop };
  }
  return trades;
}

export function summarize(trades: SimTrade[]): SimSummary {
  const filled = trades.filter((t) => t.filled);
  return {
    n: trades.length,
    filled: filled.length,
    missed: trades.length - filled.length,
    wins: filled.filter((t) => t.win).length,
    pnl: filled.reduce((s, t) => s + t.pnl, 0),
    updatedAt: Date.now(),
  };
}
