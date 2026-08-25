import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBtc, formatPct, formatUsd } from "@/lib/format";
import { STARTING_CASH, usePaper } from "@/lib/paper-store";
import { pnlPct, pnlUsd, type Position, type PositionSide, type Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIZES = [20, 35, 50];

export function PaperDesk({
  price, liveSignal, locked = false,
}: {
  price: number | null;
  liveSignal: Signal | null;
  locked?: boolean;
}) {
  const cash = usePaper((s) => s.cash);
  const open = usePaper((s) => s.open);
  const history = usePaper((s) => s.history);
  const openPosition = usePaper((s) => s.openPosition);
  const closePosition = usePaper((s) => s.closePosition);
  const checkStops = usePaper((s) => s.checkStops);
  const reset = usePaper((s) => s.reset);
  const [size, setSize] = useState(50);
  const [useStops, setUseStops] = useState(true);

  useEffect(() => { void usePaper.persist.rehydrate(); }, []);
  useEffect(() => { if (price) checkStops(price); }, [price, checkStops]);

  const live = open && price ? pnlUsd(open, price) : 0;
  const livePct = open && price ? pnlPct(open, price) : 0;
  const equity = cash + (open && price ? open.sizeUsd + live : 0);
  const qty = price ? size / price : 0;

  function openSide(side: PositionSide) {
    if (!price) { toast.error("还没有拿到现价。"); return; }
    const ticket = liveSignal?.ticket;
    const fill = ticket && ticket.action === side ? ticket.entry : price;
    const plan = side === "long" ? liveSignal?.long : liveSignal?.short;
    const result = openPosition({
      side,
      price: fill,
      sizeUsd: Math.min(size, cash),
      stopLoss: useStops ? (ticket?.action === side ? ticket.stop ?? plan?.stop : plan?.stop) : undefined,
      takeProfit: useStops ? (ticket?.action === side ? ticket.target ?? plan?.target : plan?.target) : undefined,
    });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(side === "long" ? "已按现价买涨" : "已按现价买跌");
  }

  function closeNow() {
    if (!price) return;
    const result = closePosition(price, "manual");
    if (!result.ok) { toast.error(result.error); return; }
    const p = pnlUsd(result.position, result.position.closePrice ?? price);
    toast.success(p >= 0 ? `已平仓，盈利 ${formatUsd(p)}` : `已平仓，亏损 ${formatUsd(p)}`);
  }

  return (
    <section className="rounded-xl bg-card p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title font-medium tracking-tight">模拟交易</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {locked
              ? "登录后才能按挂单价下你自己的模拟仓。后台训练用的模拟一直在跑。"
              : "虚拟 800 美元练手。一笔 20～50 美元，按左边那张单下。"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>重置账户</Button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Mini k="模拟权益" v={formatUsd(equity)} />
        <Mini k="可用资金" v={formatUsd(cash)} />
        <Mini k="浮动盈亏" v={open && price ? formatUsd(live) : "—"} tone={open && price ? (live >= 0 ? "up" : "down") : undefined} />
      </div>
      {open && price ? (
        <OpenCard position={open} price={price} live={live} livePct={livePct} onClose={closeNow} />
      ) : locked ? (
        <p className="mt-5 rounded-md bg-muted px-3 py-3 text-sm leading-relaxed">
          登录后才显示买涨买跌，并让你按那张单下手。没登录时只做后台训练。
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">这一笔投入（小资金）</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SIZES.map((n) => (
                <Button key={n} type="button" size="sm" variant={size === n ? "default" : "secondary"} onClick={() => setSize(n)}>
                  {formatUsd(n, { whole: true })}
                </Button>
              ))}
              <Button type="button" size="sm" variant={size === cash ? "default" : "secondary"} onClick={() => setSize(Math.min(50, Math.max(20, Math.floor(cash))))}>
                全部
              </Button>
            </div>
            <p className="mt-2 font-mono text-xs text-subtle tabular-nums">
              约 {formatBtc(qty)} BTC{price ? ` @ ${formatUsd(price)}` : ""}
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={useStops} onChange={(e) => setUseStops(e.target.checked)} className="size-4 accent-accent" suppressHydrationWarning />
            自动带上「赚到就走 / 亏到就停」
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="long" disabled={!price || cash < 20} className={liveSignal?.ticket.action === "short" ? "opacity-50" : undefined} onClick={() => openSide("long")}>买涨</Button>
            <Button variant="short" disabled={!price || cash < 20} className={liveSignal?.ticket.action === "long" ? "opacity-50" : undefined} onClick={() => openSide("short")}>买跌</Button>
          </div>
          {liveSignal?.ticket.action !== "wait" && liveSignal?.ticket ? (
            <p className="text-xs text-muted-foreground">
              左边单子是 {liveSignal.ticket.action === "long" ? "买涨" : "买跌"} {formatUsd(liveSignal.ticket.entry, { whole: true })}。点对应按钮就会按那个价模拟。
            </p>
          ) : (
            <p className="text-xs text-subtle">左边单子是当前方向。点对应按钮按那个价模拟。</p>
          )}
        </div>
      )}
      {history.length ? (
        <div className="mt-6">
          <p className="text-xs text-muted-foreground">最近平仓</p>
          <ul className="mt-2 divide-y divide-border">
            {history.slice(0, 5).map((p) => (<HistoryRow key={p.id} position={p} />))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 text-xs text-subtle">起始资金 {formatUsd(STARTING_CASH)}，可随时重置。</p>
      )}
    </section>
  );
}

function Mini({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-md bg-muted px-3 py-3">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className={cn("mt-1 font-mono text-sm tabular-nums", tone === "up" && "text-up", tone === "down" && "text-down")}>{v}</p>
    </div>
  );
}

function OpenCard({ position, price, live, livePct, onClose }: { position: Position; price: number; live: number; livePct: number; onClose: () => void }) {
  const up = live >= 0;
  const reason = position.side === "long" ? "买涨中" : "买跌中";
  const planHint = useMemo(() => {
    const bits = [];
    if (position.stopLoss) bits.push(`停损 ${formatUsd(position.stopLoss)}`);
    if (position.takeProfit) bits.push(`止盈 ${formatUsd(position.takeProfit)}`);
    return bits.join(" · ");
  }, [position.stopLoss, position.takeProfit]);
  return (
    <div className="mt-5 rounded-lg bg-card-2 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={position.side === "long" ? "up" : "down"}>{reason}</Badge>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatBtc(position.qty)} BTC</span>
        </div>
        <p className={cn("font-mono text-lg tabular-nums", up ? "text-up" : "text-down")}>
          {formatUsd(live)} · {formatPct(livePct)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums sm:grid-cols-4">
        <div><dt className="font-sans text-muted-foreground">买入价</dt><dd>{formatUsd(position.entryPrice)}</dd></div>
        <div><dt className="font-sans text-muted-foreground">现价</dt><dd>{formatUsd(price)}</dd></div>
        <div><dt className="font-sans text-muted-foreground">投入</dt><dd>{formatUsd(position.sizeUsd)}</dd></div>
        <div><dt className="font-sans text-muted-foreground">保护</dt><dd>{planHint || "未设置"}</dd></div>
      </dl>
      <Button className="mt-4 w-full" variant="secondary" onClick={onClose}>按现价平掉</Button>
    </div>
  );
}

function HistoryRow({ position }: { position: Position }) {
  const mark = position.closePrice ?? position.entryPrice;
  const p = pnlUsd(position, mark);
  const label = position.closeReason === "stop" ? "亏到就停" : position.closeReason === "tp" ? "赚到就走" : "手动平";
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className={position.side === "long" ? "text-up" : "text-down"}>{position.side === "long" ? "涨" : "跌"}</span>
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={cn("font-mono tabular-nums", p >= 0 ? "text-up" : "text-down")}>{formatUsd(p)}</span>
    </li>
  );
}
