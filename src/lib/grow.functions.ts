import { createServerFn } from "@tanstack/react-start";
import { clampRecipe, type TrainRecipe } from "./grow";
import { MODEL_KEYS, frozenLive } from "./model/infer";
import { xaiApiKey } from "./xai-key.server";

export type GrowReviewInput = {
  recap: Array<{ time: number; predPx: number; actualPx: number; ok: boolean; side: string }>;
  tape: string;
  up: number;
  side: string;
  hang: number;
  confidence: number;
  price: number;
  w: number[];
  enter: number;
  nFits: number;
  urgent?: boolean;
  book?: string;
  sim: { n: number; filled: number; missed: number; wins: number; pnl: number };
  frozenSim: { n: number; filled: number; missed: number; wins: number; pnl: number };
};

type GrowReviewOk = { ok: true; recipe: TrainRecipe | null; note: string; usedGrok: boolean };
type GrowReviewErr = { ok: false; error: string };

let lastServerReview = 0;

function maxDrift(w: number[] | undefined) {
  const base = frozenLive().w;
  if (!w?.length) return 0;
  let m = 0;
  for (let i = 0; i < Math.max(w.length, base.length); i++) {
    m = Math.max(m, Math.abs((w[i] ?? 0) - (base[i] ?? 0)));
  }
  return Math.round(m * 1000) / 1000;
}

function parseObj(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("bad json");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

export const reviewGrow = createServerFn({ method: "POST" })
  .validator((input: unknown) => input as GrowReviewInput)
  .handler(async ({ data }): Promise<GrowReviewOk | GrowReviewErr> => {
    const apiKey = xaiApiKey();
    if (!apiKey) return { ok: false, error: "missing XAI_API_KEY" };
    const minGap = data.urgent ? 8 * 60 * 1000 : 80 * 60 * 1000;
    if (Date.now() - lastServerReview < minGap) {
      return { ok: true, recipe: null, note: "", usedGrok: false };
    }
    const rows = (data.recap ?? []).slice(-8).map((r) => ({
      pred: Math.round(r.predPx),
      actual: Math.round(r.actualPx),
      ok: r.ok,
      side: r.side,
    }));
    const sim = data.sim ?? { n: 0, filled: 0, missed: 0, wins: 0, pnl: 0 };
    if (sim.filled < 4 && rows.length < 3) {
      return { ok: true, recipe: null, note: "", usedGrok: false };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 360,
        messages: [
          {
            role: "system",
            content:
              "You coach a BTC scalp model. Beat current live, not factory. No look-ahead. JSON only: train,correct,lr,steps,l2,enter,hangDeadDelta,hangK,tpK,slK,sizeUsd,focus,note(Chinese <=40). Never reset.",
          },
          {
            role: "user",
            content: JSON.stringify({
              tape: data.tape,
              confidence: data.confidence,
              urgent: Boolean(data.urgent),
              book: data.book ?? "",
              side: data.side,
              hang: Math.round(data.hang),
              price: Math.round(data.price),
              recap: rows,
              sim,
              frozenSim: data.frozenSim,
              keys: MODEL_KEYS,
              w: (data.w ?? []).map((x) => Math.round(x * 1000) / 1000),
              enter: data.enter,
              nFits: data.nFits,
              drift: maxDrift(data.w),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      const recipe = clampRecipe(parseObj(text));
      lastServerReview = Date.now();
      return { ok: true, recipe, note: recipe.note, usedGrok: true };
    } catch {
      return { ok: false, error: "bad recipe" };
    }
  });
