import { useEffect, useRef, useState } from "react";
import { getObservation } from "../game/ai/observation";
import { requestFromObservation, validateDecision } from "../game/ai/decisions";
import { chooseDecision, type BotResult } from "../game/ai/planner";
import type { GameState } from "../game/types";

export function useBotDecision(match: GameState | null, enabled: boolean) {
  const worker = useRef<Worker | null>(null);
  const [result, setResult] = useState<BotResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    worker.current = new Worker(
      new URL("../game/ai/worker.ts", import.meta.url),
      { type: "module" },
    );
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    setResult(null);
    setError("");
    if (
      !enabled ||
      !match ||
      match.priorityPlayer !== 1 ||
      match.winner !== null ||
      !worker.current
    )
      return;
    let active = true;
    let finished = false;
    const observation = getObservation(match, 1);
    let request;
    try {
      request = requestFromObservation(observation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid bot decision request");
      return;
    }
    if (!request) return;
    const current = worker.current;
    const options = {
      difficulty: match.botSettings?.difficulty ?? "normal",
      seed: match.botSettings?.seed ?? 20261006,
    };
    const restart = () => {
      current.terminate();
      if (worker.current === current)
        worker.current = new Worker(
          new URL("../game/ai/worker.ts", import.meta.url),
          { type: "module" },
        );
    };
    const accept = (candidate: BotResult) => {
      if (!active || finished) return;
      finished = true;
      clearTimeout(watchdog);
      const valid = validateDecision(match, request, candidate.decision);
      if (!valid.valid) {
        setError(valid.reason ?? "Bot decision rejected");
        return;
      }
      setResult({ ...candidate, action: valid.action! });
    };
    const recover = (message: string) => {
      if (!active || finished) return;
      restart();
      const fallback = chooseDecision(request, observation, {
        ...options,
        maxNodes: 0,
      });
      fallback.trace.error = message;
      accept(fallback);
    };
    // A separate UI watchdog can terminate a pathological resolver call. It
    // always commits the already prepared legal fallback, including forced choices.
    const watchdog = setTimeout(
      () => recover("Bot worker exceeded its 5 second watchdog"),
      5000,
    );
    const handler = (
      event: MessageEvent<{ id: string; result?: BotResult; error?: string }>,
    ) => {
      if (!active || event.data.id !== request.id) return;
      if (event.data.error) {
        recover(event.data.error);
        return;
      }
      if (event.data.result) accept(event.data.result);
      else recover("Bot worker returned no decision");
    };
    const failure = () => {
      recover("The bot worker could not complete this decision.");
    };
    worker.current.addEventListener("message", handler);
    worker.current.addEventListener("error", failure);
    worker.current.postMessage({
      request,
      observation,
      options,
    });
    return () => {
      active = false;
      clearTimeout(watchdog);
      current.removeEventListener("message", handler);
      current.removeEventListener("error", failure);
      if (!finished && worker.current === current) restart();
    };
  }, [match, enabled]);
  return { result, error };
}
