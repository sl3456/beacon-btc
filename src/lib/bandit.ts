export const HANG_ARMS = [0.12, 0.18, 0.28] as const;
export const TP_ARMS = [0.7, 0.9, 1.2] as const;
export const SL_ARMS = [0.9, 1.1, 1.4] as const;
export const SIZE_ARMS = [20, 50] as const;

export type Knobs = {
  hangK: number;
  tpK: number;
  slK: number;
  sizeUsd: number;
};

export const FACTORY_KNOBS: Knobs = { hangK: 0.18, tpK: 0.9, slK: 1.1, sizeUsd: 50 };

type Beta = { a: number; b: number };

export type BanditState = {
  beta: Record<string, Beta>;
  last: (Knobs & { ctx: "chop" | "trend" }) | null;
};

export const EMPTY_BANDIT: BanditState = { beta: {}, last: null };

function key(ctx: string, knob: string, arm: number) {
  return `${ctx}:${knob}:${arm}`;
}

function getBeta(state: BanditState, k: string, factory: boolean): Beta {
  if (state.beta[k]) return state.beta[k]!;
  return factory ? { a: 6, b: 2 } : { a: 2, b: 2 };
}

function sampleBeta(a: number, b: number) {
  const x = gammaSample(a);
  const y = gammaSample(b);
  return x / (x + y);
}

function gammaSample(k: number): number {
  const k0 = Math.max(0.1, k);
  if (k0 < 1) {
    return gammaSample(k0 + 1) * Math.pow(Math.random(), 1 / k0);
  }
  const d = k0 - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickArm(state: BanditState, ctx: string, knob: string, arms: readonly number[], factoryVal: number) {
  let bestI = 0;
  let best = -1;
  for (let i = 0; i < arms.length; i++) {
    const factory = arms[i] === factoryVal;
    const beta = getBeta(state, key(ctx, knob, arms[i]!), factory);
    const th = sampleBeta(beta.a, beta.b);
    if (th > best) {
      best = th;
      bestI = i;
    }
  }
  return arms[bestI]!;
}

export function pickKnobs(state: BanditState, chop: boolean): Knobs & { ctx: "chop" | "trend" } {
  const ctx = chop ? "chop" : "trend";
  return {
    ctx,
    hangK: pickArm(state, ctx, "hangK", HANG_ARMS, FACTORY_KNOBS.hangK),
    tpK: pickArm(state, ctx, "tpK", TP_ARMS, FACTORY_KNOBS.tpK),
    slK: pickArm(state, ctx, "slK", SL_ARMS, FACTORY_KNOBS.slK),
    sizeUsd: pickArm(state, ctx, "sizeUsd", SIZE_ARMS, FACTORY_KNOBS.sizeUsd),
  };
}

export function learnKnobs(state: BanditState, pnl: number): BanditState {
  if (!state.last) return state;
  const { ctx, hangK, tpK, slK, sizeUsd } = state.last;
  const win = pnl > 0;
  const bump = win ? { a: 1, b: 0 } : { a: 0, b: 1 };
  const next = { ...state.beta };
  const add = (knob: string, arm: number, factoryVal: number) => {
    const k = key(ctx, knob, arm);
    const cur = getBeta(state, k, arm === factoryVal);
    next[k] = { a: cur.a + bump.a, b: cur.b + bump.b };
  };
  add("hangK", hangK, FACTORY_KNOBS.hangK);
  add("tpK", tpK, FACTORY_KNOBS.tpK);
  add("slK", slK, FACTORY_KNOBS.slK);
  add("sizeUsd", sizeUsd, FACTORY_KNOBS.sizeUsd);
  return { beta: next, last: state.last };
}

export function hintArm(state: BanditState, ctx: "chop" | "trend", knob: string, arm: number): BanditState {
  const k = key(ctx, knob, arm);
  const cur = state.beta[k] ?? { a: 2, b: 2 };
  return { ...state, beta: { ...state.beta, [k]: { a: cur.a + 2, b: cur.b } } };
}
