import { formatUsd } from "@/lib/format";
import type { CandlePack } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IndicatorStrip({
  pack,
  price,
}: {
  pack: CandlePack | null;
  price?: number;
}) {
  const rsi = pack?.rsi ?? null;
  const rsiTone =
    rsi == null ? "text-muted-foreground" : rsi >= 70 ? "text-up" : rsi <= 30 ? "text-down" : "text-foreground";
  const rsiHint =
    rsi == null ? "K 线还不够" : rsi >= 70 ? "涨太急，别追" : rsi <= 30 ? "跌多了，可能要弹" : "不冷不热";

  const sma7 = pack?.sma7 ?? null;
  const sma25 = pack?.sma25 ?? null;
  const vsMa =
    price && sma7
      ? price >= sma7
        ? { label: "现价比近几根均价高", tone: "text-up" as const }
        : { label: "现价比近几根均价低", tone: "text-down" as const }
      : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Cell
        k="现在热不热"
        v={rsi == null ? "—" : rsi >= 70 ? "偏热" : rsi <= 30 ? "偏冷" : "正常"}
        hint={rsiHint}
        valueClass={rsiTone}
      />
      <Cell
        k="近几根均价"
        v={sma7 == null ? "—" : formatUsd(sma7, { whole: true })}
        hint={vsMa?.label ?? "等待均线"}
        valueClass={vsMa?.tone}
      />
      <Cell
        k="更长均价"
        v={sma25 == null ? "—" : formatUsd(sma25, { whole: true })}
        hint={
          sma7 && sma25
            ? sma7 >= sma25
              ? "短线均价在长线之上，偏强"
              : "短线均价在长线之下，偏弱"
            : "再等几根 K 线"
        }
      />
    </div>
  );
}

function Cell({
  k,
  v,
  hint,
  valueClass,
}: {
  k: string;
  v: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className={cn("mt-1 font-mono text-lg tabular-nums", valueClass)}>{v}</p>
      <p className="mt-1 text-xs text-subtle">{hint}</p>
    </div>
  );
}
