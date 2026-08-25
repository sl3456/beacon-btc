export type GrowAdapter = {
  pBias: number;
  enterDelta: number;
  hangDeadDelta: number;
  note: string;
  updatedAt: number;
  nReviews: number;
};

export const EMPTY_ADAPTER: GrowAdapter = {
  pBias: 0,
  enterDelta: 0,
  hangDeadDelta: 0,
  note: "",
  updatedAt: 0,
  nReviews: 0,
};

export type LiveRules = {
  w: number[];
  enter: number;
  hangDeadDelta: number;
  hangK: number;
  tpK: number;
  slK: number;
  sizeUsd: number;
  nFits: number;
  updatedAt: number;
};

export type TrainRecipe = {
  train: boolean;
  correct: boolean;
  lr: number;
  steps: number;
  l2: number;
  enter: number;
  hangDeadDelta: number;
  hangK: number | null;
  tpK: number | null;
  slK: number | null;
  sizeUsd: number | null;
  focus: string | null;
  note: string;
};

export function clampRecipe(raw: Record<string, unknown>): TrainRecipe {
  const clip = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const correct = raw.correct === true || raw.correct === 1 || raw.correct === "true";
  const train = raw.train !== false && raw.train !== 0 && raw.train !== "false";
  const steps = Math.round(clip(Number(raw.steps) || 3, 1, 6));
  const focus = typeof raw.focus === "string" ? raw.focus.slice(0, 16) : null;
  const numOrNull = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    train,
    correct,
    lr: clip(Number(raw.lr) || (correct ? 0.035 : 0.05), 0.01, 0.12),
    steps,
    l2: clip(Number(raw.l2) || (correct ? 0.22 : 0.16), 0.06, 0.4),
    enter: clip(Number(raw.enter) || 0.51, 0.505, 0.525),
    hangDeadDelta: clip(Number(raw.hangDeadDelta) || 0, -0.12, 0.12),
    hangK: numOrNull(raw.hangK),
    tpK: numOrNull(raw.tpK),
    slK: numOrNull(raw.slK),
    sizeUsd: numOrNull(raw.sizeUsd),
    focus: focus && focus !== "none" ? focus : null,
    note: String(raw.note ?? "").slice(0, 80),
  };
}

export function confidenceScore(input: {
  edge: number;
  recapAcc: number | null;
  recapN: number;
  warn: boolean;
  chop: boolean;
}): number {
  let c = 50 + input.edge * 220;
  if (input.recapN >= 6 && input.recapAcc != null) {
    c = 0.55 * c + 0.45 * (input.recapAcc * 100);
  }
  if (input.warn) c *= 0.84;
  if (input.chop) c *= 0.93;
  return Math.round(Math.min(76, Math.max(34, c)));
}

export function confidenceLabel(c: number): string {
  if (c >= 62) return "把握比较大";
  if (c >= 52) return "把握一般";
  return "把握不大";
}
