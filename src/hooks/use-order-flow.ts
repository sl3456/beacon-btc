import { useEffect, useRef, useState } from "react";
import { getOrderFlow } from "@/lib/market.functions";
import { stepFlowGate, type FlowGate, type FlowVote, type OrderFlow } from "@/lib/orderflow";

export function useOrderFlow() {
  const [flow, setFlow] = useState<OrderFlow | null>(null);
  const [vote, setVote] = useState<FlowVote | null>(null);
  const gate = useRef<FlowGate | null>(null);

  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      try {
        const next = await getOrderFlow();
        if (stopped || !next) return;
        const stepped = stepFlowGate(gate.current, next);
        gate.current = stepped.gate;
        setFlow(next);
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
