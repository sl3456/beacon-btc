import { Badge } from "@/components/ui/badge";
import { formatClock, formatPct, formatUsd } from "@/lib/format";
import { change24h, type Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  snapshot: Snapshot;
  status: "connecting" | "live" | "polling";
  tick: "up" | "down" | null;
};

export function PriceHero({ snapshot, status, tick }: Props) {
  const chg = change24h(snapshot);
  const up = chg >= 0;
  const spread = snapshot.ask - snapshot.bid;

  return (
    <section className="rounded-xl bg-card p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            BTC / USD
          </p>
          <p className="mt-1 text-sm text-subtle">Coinbase 现货 · 美元计价</p>
        </div>
        <Badge variant={status === "connecting" ? "default" : "live"}>
          <span
            className={cn(
              "size-1.5 rounded-full bg-live",
              status !== "connecting" && "live-dot",
            )}
          />
          {status === "live" ? "实时推送" : status === "polling" ? "轮询刷新" : "连接中"}
        </Badge>
      </div>

      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p
            key={`${snapshot.price}-${tick ?? "n"}`}
            className={cn(
              "font-mono text-display leading-none font-medium tracking-tight tabular-nums",
              tick === "up" && "flash-up",
              tick === "down" && "flash-down",
            )}
          >
            {formatUsd(snapshot.price)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                up ? "text-up" : "text-down",
              )}
            >
              {formatPct(chg)} · 24h
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              买一 {formatUsd(snapshot.bid)} / 卖一 {formatUsd(snapshot.ask)}
              {spread > 0 ? ` · 差价 ${formatUsd(spread)}` : null}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Stat label="24h 开盘" value={formatUsd(snapshot.open24h, { whole: true })} />
          <Stat label="24h 最高" value={formatUsd(snapshot.high24h, { whole: true })} />
          <Stat label="24h 最低" value={formatUsd(snapshot.low24h, { whole: true })} />
          <Stat
            label="24h 成交"
            value={`${snapshot.volume24h.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC`}
          />
        </dl>
      </div>

      <p className="mt-5 font-mono text-[11px] text-subtle tabular-nums">
        更新 {formatClock(snapshot.time)}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
