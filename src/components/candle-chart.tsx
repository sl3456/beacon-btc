import { useEffect, useMemo, useRef, useState } from "react";
import { smaSeries } from "@/lib/indicators";
import { formatTime, formatUsd } from "@/lib/format";
import type { Candle, Interval } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { candles: Candle[]; interval: Interval; livePrice?: number; className?: string };
type Hover = { index: number; x: number; y: number };

export function CandleChart({ candles, interval, livePrice, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 320 });
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: Math.max(280, r.width), h: Math.max(220, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const model = useMemo(() => {
    const padL = 8, padR = 64, padT = 16, padB = 28, volH = 46;
    const { w, h } = size;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB - volH - 10;
    const data = candles.slice(-160);
    if (data.length < 2) return null;
    let min = Math.min(...data.map((c) => c.low));
    let max = Math.max(...data.map((c) => c.high));
    if (livePrice) { min = Math.min(min, livePrice); max = Math.max(max, livePrice); }
    const pad = (max - min) * 0.06 || max * 0.002;
    min -= pad; max += pad;
    const span = max - min || 1;
    const step = plotW / data.length;
    const xAt = (i: number) => padL + (i + 0.5) * step;
    const yAt = (price: number) => padT + ((max - price) / span) * plotH;
    const volMax = Math.max(...data.map((c) => c.volume), 1);
    const closes = data.map((c) => c.close);
    const ma7 = smaSeries(closes, 7);
    const ma25 = smaSeries(closes, 25);
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const price = max - (span * i) / 4;
      return { price, y: yAt(price) };
    });
    const xTicks = [0, Math.floor((data.length - 1) / 2), data.length - 1]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((i) => ({ i, x: xAt(i), time: data[i]!.time }));
    const path = (series: Array<number | null>) => {
      let d = "";
      series.forEach((v, i) => {
        if (v == null) return;
        d += `${d ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
      });
      return d.trim();
    };
    return { w, h, padL, padR, padT, padB, volH, plotH, plotW, data, min, max, step, xAt, yAt, volMax, yTicks, xTicks, ma7Path: path(ma7), ma25Path: path(ma25) };
  }, [candles, livePrice, size]);
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!model) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const i = Math.round((x - model.padL) / model.step - 0.5);
    if (i < 0 || i >= model.data.length) { setHover(null); return; }
    setHover({ index: i, x: model.xAt(i), y: ev.clientY - rect.top });
  };
  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)}>
      {!model ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在读取 K 线…</div>
      ) : (
        <svg width={model.w} height={model.h} className="h-full w-full touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="BTC/USD K线图">
          {model.yTicks.map((t) => (
            <g key={t.price}>
              <line x1={model.padL} x2={model.w - model.padR} y1={t.y} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={1} />
              <text x={model.w - model.padR + 8} y={t.y + 4} className="fill-subtle font-mono" fontSize={10}>{formatUsd(t.price, { whole: t.price >= 1000 })}</text>
            </g>
          ))}
          {model.xTicks.map((t) => (
            <text key={t.time} x={t.x} y={model.h - 8} textAnchor="middle" className="fill-subtle font-mono" fontSize={10}>{formatTime(t.time, interval)}</text>
          ))}
          {model.data.map((c, i) => {
            const x = model.xAt(i);
            const up = c.close >= c.open;
            const bodyTop = model.yAt(Math.max(c.open, c.close));
            const bodyBot = model.yAt(Math.min(c.open, c.close));
            const color = up ? "var(--color-up)" : "var(--color-down)";
            const cw = Math.max(1.5, Math.min(9, model.step * 0.62));
            const vh = (c.volume / model.volMax) * model.volH;
            return (
              <g key={c.time}>
                <line x1={x} x2={x} y1={model.yAt(c.high)} y2={model.yAt(c.low)} stroke={color} strokeWidth={1} />
                <rect x={x - cw / 2} y={bodyTop} width={cw} height={Math.max(1, bodyBot - bodyTop)} fill={color} />
                <rect x={x - cw / 2} y={model.h - model.padB - vh} width={cw} height={vh} fill={color} opacity={0.28} />
              </g>
            );
          })}
          {model.ma25Path ? <path d={model.ma25Path} fill="none" stroke="var(--color-subtle)" strokeWidth={1.25} /> : null}
          {model.ma7Path ? <path d={model.ma7Path} fill="none" stroke="var(--color-accent)" strokeWidth={1.25} opacity={0.85} /> : null}
          {livePrice ? <line x1={model.padL} x2={model.w - model.padR} y1={model.yAt(livePrice)} y2={model.yAt(livePrice)} stroke="var(--color-accent)" strokeDasharray="3 4" strokeWidth={1} opacity={0.7} /> : null}
          {hover ? <line x1={hover.x} x2={hover.x} y1={model.padT} y2={model.h - model.padB} stroke="var(--color-accent)" strokeOpacity={0.35} /> : null}
        </svg>
      )}
      {hover && model?.data[hover.index] ? <HoverCard candle={model.data[hover.index]!} interval={interval} x={hover.x} width={size.w} /> : null}
      <div className="pointer-events-none absolute top-2 left-3 flex gap-3 font-mono text-[10px] tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-accent" />MA7</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-subtle" />MA25</span>
      </div>
    </div>
  );
}

function HoverCard({ candle, interval, x, width }: { candle: Candle; interval: Interval; x: number; width: number }) {
  const up = candle.close >= candle.open;
  const left = x > width * 0.62 ? undefined : x + 12;
  const right = x > width * 0.62 ? width - x + 12 : undefined;
  return (
    <div className="pointer-events-none absolute top-8 z-10 w-40 rounded-md bg-card px-3 py-2 shadow-card" style={{ left, right }}>
      <p className="font-mono text-[10px] text-muted-foreground">{formatTime(candle.time, interval)}</p>
      <p className={cn("font-mono text-sm tabular-nums", up ? "text-up" : "text-down")}>{formatUsd(candle.close)}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[10px] text-muted-foreground">
        <dt>开</dt><dd className="text-right text-foreground tabular-nums">{formatUsd(candle.open)}</dd>
        <dt>高</dt><dd className="text-right text-foreground tabular-nums">{formatUsd(candle.high)}</dd>
        <dt>低</dt><dd className="text-right text-foreground tabular-nums">{formatUsd(candle.low)}</dd>
      </dl>
    </div>
  );
}
