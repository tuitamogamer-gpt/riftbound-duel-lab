import { useEffect, useRef, useState } from "react";
import { getObservation } from "../game/ai/observation";
import { requestFromObservation, validateDecision } from "../game/ai/decisions";
import type { BotResult } from "../game/ai/planner";
import { preparedFallback } from "../game/ai/prepared-fallback";
import type { GameState } from "../game/types";

export function useBotDecision(match: GameState | null, enabled: boolean) {
  const worker = useRef<Worker | null>(null);
  const [result, setResult] = useState<BotResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    setResult(null);
    setError("");
    if (!match || match.winner !== null) {
      worker.current?.terminate();
      worker.current = null;
      return;
    }
    if (!enabled || match.priorityPlayer !== 1) return;
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
    let current: Worker | null = worker.current;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const options = {
      difficulty: match.botSettings?.difficulty ?? "normal",
      seed: match.botSettings?.seed ?? 20261006,
    };
    const discardWorker = () => {
      current?.terminate();
      if (worker.current === current) worker.current = null;
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
      discardWorker();
      accept(preparedFallback(request, observation, options, message));
    };
    // A separate UI watchdog can terminate a pathological resolver call. It
    // always commits the already prepared legal fallback, including forced choices.
    watchdog = setTimeout(
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
    try {
      // The lobby and human-only priority need no worker or planner download.
      current ??= new Worker(new URL("../game/ai/worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = current;
      current.addEventListener("message", handler);
      current.addEventListener("error", failure);
      current.postMessage({ request, observation, options });
    } catch (error) {
      recover(
        error instanceof Error
          ? error.message
          : "The bot worker could not start.",
      );
    }
    return () => {
      active = false;
      clearTimeout(watchdog);
      current?.removeEventListener("message", handler);
      current?.removeEventListener("error", failure);
      if (!finished && worker.current === current) discardWorker();
    };
  }, [match, enabled]);
  return { result, error };
}
