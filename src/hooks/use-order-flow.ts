import { useEffect, useRef, useState } from "react";
import { getOrderFlow } from "@/lib/market.functions";
import { stepFlowGate, type FlowGate, type FlowVote, type OrderFlow } from "@/lib/orderflow";

export function useOrderFlow() {
  const [flow, setFlow] = useState<OrderFlow | null>(null);
  const [vote, setVote] = useState<FlowVote | null>(null);
  const gate = useRef<FlowGate | null>(null);
  const ema = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      try {
        const next = await getOrderFlow();
        if (stopped || !next) return;
        const raw = 0.5 * next.imb + 0.5 * next.tradeImb;
        ema.current = ema.current == null ? raw : 0.72 * ema.current + 0.28 * raw;
        const smoothed: OrderFlow = { ...next, emaScore: ema.current };
        const stepped = stepFlowGate(gate.current, smoothed);
        gate.current = stepped.gate;
        setFlow(smoothed);
        setVote(stepped.vote);
      } catch {
        /* keep last book */
      }
    };
    void pull();
    const id = setInterval(() => void pull(), 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return { flow, vote };
}
