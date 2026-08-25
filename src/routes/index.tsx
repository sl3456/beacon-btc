import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BeginnerGuide } from "@/components/beginner-guide";
import { CandleChart } from "@/components/candle-chart";
import { IndicatorStrip } from "@/components/indicator-strip";
import { PaperDesk } from "@/components/paper-desk";
import { PriceHero } from "@/components/price-hero";
import { SignalPanel } from "@/components/signal-panel";
import { Button } from "@/components/ui/button";
import { useCandlePack } from "@/hooks/use-candle-pack";
import { useGrowCoach } from "@/hooks/use-grow-coach";
import { useLiveTicker } from "@/hooks/use-live-ticker";
import { useOrderFlow } from "@/hooks/use-order-flow";
import { applyLiveCandle, packFromCandles } from "@/lib/indicators";
import { useGrow } from "@/lib/grow-store";
import { dropForming } from "@/lib/model/infer";
import { buildLocalSignal } from "@/lib/local-signal";
import { EMPTY_ADAPTER } from "@/lib/grow";
import { getSnapshot } from "@/lib/market.functions";
import { authEnabled, signIn } from "@/lib/auth/client";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { GROK_PROVIDERS } from "@/lib/auth/providers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { INTERVALS, INTERVAL_LABEL, type Interval, type Snapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return await getSnapshot();
    } catch {
      return null;
    }
  },
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData() as Snapshot | null;
  const { snapshot, status, tick } = useLiveTicker(initial);
  const [interval, setInterval_] = useState<Interval>("5m");
  const chart = useCandlePack(interval, interval === "1m" || interval === "5m" ? 8000 : 15000);
  const model5 = useCandlePack("5m", 8000);
  const model1h = useCandlePack("1h", 30000);

  const livePack = useMemo(() => {
    if (!chart.pack || !snapshot) return chart.pack;
    const candles = applyLiveCandle(chart.pack.candles, snapshot.price, chart.pack.granularity);
    return { ...chart.pack, candles, ...packFromCandles(candles) };
  }, [chart.pack, snapshot]);

  const live5 = useMemo(() => {
    if (!model5.pack || !snapshot) return model5.pack;
    const candles = applyLiveCandle(model5.pack.candles, snapshot.price, model5.pack.granularity);
    return { ...model5.pack, candles, ...packFromCandles(candles) };
  }, [model5.pack, snapshot]);

  const liveRules = useGrow((s) => s.live);
  const growNote = useGrow((s) => s.lastNote);
  const { flow, vote } = useOrderFlow();

  const liveSignal = useMemo(() => {
    if (!snapshot || !live5 || live5.candles.length < 40) return null;
    return buildLocalSignal(snapshot, live5, model1h.pack, live5, EMPTY_ADAPTER, growNote, liveRules, flow, vote);
  }, [snapshot, live5, model1h.pack, growNote, liveRules, flow, vote]);

  const closed = live5 ? dropForming(live5.candles, 300) : [];
  const closedBarTime = closed[closed.length - 1]?.time ?? null;
  useGrowCoach(liveSignal, closedBarTime, live5?.candles ?? null, model1h.pack?.candles ?? null);

  const { user, isPending } = useCurrentUserState();
  const canPredict = Boolean(user);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-medium tracking-[0.22em] uppercase">Beacon</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">比特币实时信标</span>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-subtle sm:block">学习用 · 非投资建议</p>
            <SignedIn>
              <UserButton />
            </SignedIn>
            <SignedOut>
              {authEnabled ? (
                <div className="flex flex-wrap items-center gap-1">
                  {GROK_PROVIDERS.map((p) => (
                    <Button
                      key={p.providerId}
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void signIn(p.providerId)}
                    >
                      登录 {p.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </SignedOut>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 pb-16 md:gap-5 md:px-6 md:py-8">
        {snapshot ? (
          <PriceHero snapshot={snapshot} status={status} tick={tick} />
        ) : (
          <div className="rounded-xl bg-card px-5 py-16 text-center shadow-card">
            <p className="text-sm text-muted-foreground">正在接入 BTC/USD 行情…</p>
          </div>
        )}

        <section className="rounded-xl bg-card p-3 shadow-card md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium">价格图</h2>
              <p className="text-xs text-muted-foreground">
                <span className="text-up">红涨</span>
                <span className="mx-1 text-subtle">/</span>
                <span className="text-down">绿跌</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {INTERVALS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={interval === item ? "default" : "ghost"}
                  className={cn("min-w-11 px-2.5", interval === item && "text-accent-foreground")}
                  onClick={() => setInterval_(item)}
                >
                  {INTERVAL_LABEL[item]}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-64 rounded-lg bg-card-2 md:h-80">
            {chart.error ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {chart.error}
              </div>
            ) : livePack && livePack.candles.length > 2 ? (
              <CandleChart
                candles={livePack.candles}
                interval={interval}
                livePrice={snapshot?.price}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {chart.loading ? "正在绘制 K 线…" : "暂无 K 线"}
              </div>
            )}
          </div>
        </section>

        <IndicatorStrip pack={livePack} price={snapshot?.price} />

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <SignalPanel
            interval={interval}
            snapshot={snapshot}
            live={liveSignal}
            predict
            grok={canPredict && !isPending}
          />
          <PaperDesk
            price={snapshot?.price ?? null}
            liveSignal={liveSignal}
            locked={!canPredict}
          />
        </div>

        <BeginnerGuide />
      </main>
    </div>
  );
}
