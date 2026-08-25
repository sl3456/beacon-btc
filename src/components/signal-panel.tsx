import { useState } from "react";
import { ScanSearch, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { askSignal } from "@/lib/market.functions";
import { formatBtc, formatPct, formatUsd } from "@/lib/format";
import { useGrow } from "@/lib/grow-store";
import { usePaper } from "@/lib/paper-store";
import type { Interval, Signal, Snapshot, TradeTicket } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { interval: Interval; snapshot: Snapshot | null; live: Signal | null; predict?: boolean; grok?: boolean };

const BIAS: Record<TradeTicket["action"], { label: string; hint: string; className: string }> = {
  long: { label: "现在买涨", hint: "挂下面这个价。离开一截才会改，不用盯着现价改单。", className: "text-up" },
  short: { label: "现在买跌", hint: "挂下面这个价。离开一截才会改，不用盯着现价改单。", className: "text-down" },
  wait: { label: "K 线对齐中", hint: "对齐后会一直给买涨或买跌。", className: "text-muted-foreground" },
};

export function SignalPanel({ interval, snapshot, live, predict = true, grok: grokOn = true }: Props) {
  const grok = usePaper((s) => s.signal);
  const setSignal = usePaper((s) => s.setSignal);
  const [loading, setLoading] = useState(false);
  async function runGrok() {
    if (loading || !predict || !grokOn) return;
    setLoading(true);
    try {
      const res = await askSignal({ data: { interval } });
      if (!res.ok) { toast.error(res.error); return; }
      setSignal(res.signal);
      toast.success(res.signal.source === "grok" ? "讲解已更新" : "讲解暂不可用，仍用实时提示");
    } catch { toast.error("解读失败，请稍后再试。"); }
    finally { setLoading(false); }
  }
  return (
    <section className="rounded-xl bg-card p-5 shadow-card md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title font-medium tracking-tight">现在怎么做</h2>
            <Badge variant="live"><span className="live-dot size-1.5 rounded-full bg-live" />Beacon-S</Badge>
          </div>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            买涨买跌主要跟已收盘的 5 分钟。盘口和刚成交用来改仓位、挂单价；只有 K 线晃的时候才按盘口改方向。小资金一笔 20～50 美元。
          </p>
        </div>
        {predict && grokOn ? (
          <Button variant="secondary" onClick={() => void runGrok()} disabled={loading} className="shrink-0">
            {loading ? <LoaderCircle className="animate-spin" /> : <ScanSearch />}
            {loading ? "正在讲解" : "用大白话再讲一遍"}
          </Button>
        ) : null}
      </div>
      {!live ? (
        <p className="mt-6 text-sm text-subtle">行情连上后，这里会直接给出买涨、买跌或先不做。</p>
      ) : (
        <div className="mt-6 space-y-5">
          <TicketCard live={live} mark={snapshot?.price} />
          {live.book ? <BookCard book={live.book} /> : null}
          {live.tape ? <p className="text-sm text-muted-foreground">{live.tape.label}</p> : null}
          <p className="text-sm leading-relaxed text-muted-foreground">{live.why}</p>
          <SimHint />
        </div>
      )}
    </section>
  );
}

function TicketCard({ live, mark }: { live: Signal; mark?: number }) {
  const t = live.ticket;
  const meta = BIAS[t.action];
  const gap = mark != null ? t.entry - mark : 0;
  return (
    <div className={cn("rounded-lg p-4", t.action === "long" ? "bg-up-dim" : t.action === "short" ? "bg-down-dim" : "bg-muted")}>
      <p className={cn("text-lg font-medium", meta.className)}>{meta.label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{meta.hint}</p>
      <p className="mt-3 font-mono text-2xl tabular-nums">{formatUsd(t.entry, { whole: true })}</p>
      {mark != null && Math.abs(gap) >= 1 ? (
        <p className="mt-1 text-xs text-muted-foreground">挂这个价，别追 · 距现价 {formatUsd(Math.abs(gap))}</p>
      ) : null}
      {t.target != null && t.stop != null ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">赚到这里就走</dt><dd className="font-mono tabular-nums text-up">{formatUsd(t.target, { whole: true })} {formatPct(((t.target - t.entry) / t.entry) * 100 * (t.action === "short" ? -1 : 1))}</dd></div>
          <div><dt className="text-xs text-muted-foreground">亏到这里就停</dt><dd className="font-mono tabular-nums text-down">{formatUsd(t.stop, { whole: true })}</dd></div>
        </dl>
      ) : null}
      {t.sizeUsd ? (
        <p className="mt-3 text-sm">小资金一笔 {formatUsd(t.sizeUsd, { whole: true })} · {formatBtc(t.sizeUsd / t.entry)}</p>
      ) : null}
      {live.confidenceLabel ? <p className="mt-2 text-xs text-subtle">{live.confidenceLabel} · {live.confidence}%</p> : null}
    </div>
  );
}

function BookCard({ book }: { book: NonNullable<Signal["book"]> }) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-muted-foreground">盘口和刚成交</p>
      <p className="mt-1 text-sm">{book.label}。{book.flow}{book.led ? "。K 线晃，这一笔按盘口。" : "。"}</p>
    </div>
  );
}

function SimHint() {
  const sim = useGrow((s) => s.sim);
  const working = useGrow((s) => s.deskWorking);
  if (!sim) return null;
  return (
    <p className="text-xs text-subtle">
      后台模拟盘一直开着{working ? `，模拟挂单等在 ${Math.round(working.hang)}` : ""}。
      最近这段成交 {sim.filled} 笔、没挂上 {sim.missed} 笔，模拟{sim.pnl >= 0 ? "赚" : "亏"} {Math.abs(sim.pnl).toFixed(2)}。
    </p>
  );
}
