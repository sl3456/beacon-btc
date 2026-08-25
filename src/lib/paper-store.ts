import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pnlUsd, type Position, type PositionSide, type Signal } from "./types";

const STARTING_CASH = 800;

type PaperState = {
  cash: number;
  open: Position | null;
  history: Position[];
  signal: Signal | null;
  lastSignalError: string | null;
  deposit: (amount: number) => void;
  reset: () => void;
  setSignal: (signal: Signal | null) => void;
  setSignalError: (error: string | null) => void;
  openPosition: (input: {
    side: PositionSide;
    price: number;
    sizeUsd: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => { ok: true } | { ok: false; error: string };
  closePosition: (
    price: number,
    reason: "manual" | "stop" | "tp",
  ) => { ok: true; position: Position } | { ok: false; error: string };
  checkStops: (price: number) => void;
};

export const usePaper = create<PaperState>()(
  persist(
    (set, get) => ({
      cash: STARTING_CASH,
      open: null,
      history: [],
      signal: null,
      lastSignalError: null,
      deposit: (amount) => {
        if (amount <= 0) return;
        set({ cash: get().cash + amount });
      },
      reset: () =>
        set({
          cash: STARTING_CASH,
          open: null,
          history: [],
        }),
      setSignal: (signal) => set({ signal, lastSignalError: null }),
      setSignalError: (error) => set({ lastSignalError: error }),
      openPosition: ({ side, price, sizeUsd, stopLoss, takeProfit }) => {
        const { cash, open } = get();
        if (open) return { ok: false as const, error: "请先平掉当前模拟仓位。" };
        if (!Number.isFinite(price) || price <= 0) {
          return { ok: false as const, error: "价格无效。" };
        }
        if (!Number.isFinite(sizeUsd) || sizeUsd < 20) {
          return { ok: false as const, error: "最少投入 20 美元。" };
        }
        if (sizeUsd > cash + 1e-6) {
          return { ok: false as const, error: "模拟资金不足。" };
        }
        const qty = sizeUsd / price;
        const position: Position = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          side,
          entryPrice: price,
          sizeUsd,
          qty,
          openedAt: Date.now(),
          stopLoss,
          takeProfit,
        };
        set({ cash: cash - sizeUsd, open: position });
        return { ok: true as const };
      },
      closePosition: (price, reason) => {
        const { open, cash, history } = get();
        if (!open) return { ok: false as const, error: "没有持仓。" };
        const pnl = pnlUsd(open, price);
        const closed: Position = {
          ...open,
          closedAt: Date.now(),
          closePrice: price,
          closeReason: reason,
        };
        set({
          open: null,
          cash: cash + open.sizeUsd + pnl,
          history: [closed, ...history].slice(0, 12),
        });
        return { ok: true as const, position: closed };
      },
      checkStops: (price) => {
        const { open, closePosition } = get();
        if (!open || !Number.isFinite(price)) return;
        if (open.side === "long") {
          if (open.stopLoss && price <= open.stopLoss) {
            closePosition(open.stopLoss, "stop");
            return;
          }
          if (open.takeProfit && price >= open.takeProfit) {
            closePosition(open.takeProfit, "tp");
          }
        } else {
          if (open.stopLoss && price >= open.stopLoss) {
            closePosition(open.stopLoss, "stop");
            return;
          }
          if (open.takeProfit && price <= open.takeProfit) {
            closePosition(open.takeProfit, "tp");
          }
        }
      },
    }),
    {
      name: "beacon-paper-v2",
      skipHydration: true,
      partialize: (s) => ({
        cash: s.cash,
        open: s.open,
        history: s.history,
        signal: s.signal
          ? { ...s.signal, source: s.signal.source ?? "local" }
          : s.signal,
      }),
    },
  ),
);

export { STARTING_CASH };
