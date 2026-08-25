import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_BANDIT, type BanditState } from "./bandit";
import type { LiveRules } from "./grow";
import { frozenLive } from "./model/infer";
import type { LiveOrder, LivePos, SimSummary } from "./sim-desk";

type GrowState = {
  live: LiveRules | null;
  bandit: BanditState;
  deskPos: LivePos | null;
  deskWorking: LiveOrder | null;
  lastSide: "long" | "short" | null;
  lastReviewAt: number;
  lastNote: string;
  pendingFills: number;
  sim: SimSummary | null;
  frozenSim: SimSummary | null;
  setLive: (live: LiveRules | null, note: string) => void;
  patchLive: (patch: Partial<LiveRules>) => void;
  setNote: (note: string) => void;
  bumpFills: () => number;
  clearFills: () => void;
  setBandit: (bandit: BanditState) => void;
  setDesk: (pos: LivePos | null, working: LiveOrder | null, lastSide: "long" | "short" | null) => void;
  setSim: (sim: SimSummary, frozenSim: SimSummary) => void;
  markAttempt: () => void;
};

export const useGrow = create<GrowState>()(
  persist(
    (set, get) => ({
      live: null,
      bandit: EMPTY_BANDIT,
      deskPos: null,
      deskWorking: null,
      lastSide: null,
      lastReviewAt: 0,
      lastNote: "",
      pendingFills: 0,
      sim: null,
      frozenSim: null,
      setLive: (live, note) =>
        set({
          live,
          lastReviewAt: Date.now(),
          lastNote: note,
        }),
      patchLive: (patch) => {
        const cur = get().live ?? frozenLive();
        set({ live: { ...cur, ...patch } });
      },
      setNote: (note) => set({ lastNote: note }),
      bumpFills: () => {
        const n = get().pendingFills + 1;
        set({ pendingFills: n });
        return n;
      },
      clearFills: () => set({ pendingFills: 0 }),
      setBandit: (bandit) => set({ bandit }),
      setDesk: (deskPos, deskWorking, lastSide) => set({ deskPos, deskWorking, lastSide }),
      setSim: (sim, frozenSim) => set({ sim, frozenSim }),
      markAttempt: () => set({ lastReviewAt: Date.now() }),
    }),
    { name: "beacon-grow-v5" },
  ),
);
