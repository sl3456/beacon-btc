import { useEffect, useRef, useState } from "react";
import { getSnapshot } from "@/lib/market.functions";
import type { Snapshot } from "@/lib/types";

type Status = "connecting" | "live" | "polling";
const WS_URL = "wss://ws-feed.exchange.coinbase.com";

export function useLiveTicker(initial: Snapshot | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initial);
  const [status, setStatus] = useState<Status>(initial ? "polling" : "connecting");
  const [tick, setTick] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | null>(initial?.price ?? null);
  const snapshotRef = useRef<Snapshot | null>(initial);
  snapshotRef.current = snapshot;

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let live = false;

    const apply = (next: Partial<Snapshot> & { price: number }) => {
      const prevPrice = prev.current;
      if (prevPrice != null && next.price !== prevPrice) {
        setTick(next.price > prevPrice ? "up" : "down");
      }
      prev.current = next.price;
      setSnapshot((cur) => {
        const base: Snapshot = cur ?? {
          price: next.price,
          bid: next.bid ?? next.price,
          ask: next.ask ?? next.price,
          open24h: next.open24h ?? next.price,
          high24h: next.high24h ?? next.price,
          low24h: next.low24h ?? next.price,
          volume24h: next.volume24h ?? 0,
          time: next.time ?? new Date().toISOString(),
          source: "coinbase",
        };
        return { ...base, ...next, source: "coinbase" };
      });
    };

    const pollOnce = async () => {
      try {
        const data = await getSnapshot();
        if (stopped) return;
        apply(data);
        if (!live) setStatus("polling");
      } catch {
        /* keep last tick */
      }
    };

    const setPollMs = (ms: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => void pollOnce(), ms);
    };

    const armStale = () => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        if (stopped) return;
        live = false;
        setStatus("polling");
        try { ws?.close(); } catch { /* ignore */ }
        setPollMs(1000);
      }, 12000);
    };

    const connect = () => {
      if (stopped) return;
      try { ws = new WebSocket(WS_URL); } catch { setStatus("polling"); return; }
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker", "heartbeat"] }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string; price?: string; best_bid?: string; best_ask?: string;
            open_24h?: string; high_24h?: string; low_24h?: string; volume_24h?: string; time?: string;
          };
          if (msg.type === "heartbeat") { armStale(); return; }
          if (msg.type !== "ticker" || !msg.price) return;
          const price = Number(msg.price);
          if (!Number.isFinite(price)) return;
          live = true;
          setStatus("live");
          apply({
            price,
            bid: Number(msg.best_bid) || price,
            ask: Number(msg.best_ask) || price,
            open24h: Number(msg.open_24h) || snapshotRef.current?.open24h || price,
            high24h: Number(msg.high_24h) || snapshotRef.current?.high24h || price,
            low24h: Number(msg.low_24h) || snapshotRef.current?.low24h || price,
            volume24h: Number(msg.volume_24h) || snapshotRef.current?.volume24h || 0,
            time: msg.time || new Date().toISOString(),
          });
          armStale();
          setPollMs(8000);
        } catch { /* ignore */ }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (stopped) return;
        live = false;
        setStatus("polling");
        setPollMs(1000);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1500);
      };
    };

    void pollOnce();
    setPollMs(1000);
    connect();
    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (staleTimer) clearTimeout(staleTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  return { snapshot, status, tick };
}
