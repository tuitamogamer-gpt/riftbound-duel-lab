import { BOT_VERSION, inferProfile, type Difficulty } from "./config";
import { optionKey, type DecisionRequest } from "./decisions";
import type { Observation } from "./observation";
import type { BotResult } from "./planner";

/** Use the complete legal option prepared before dispatch, without importing search. */
export function preparedFallback(
  request: DecisionRequest,
  observation: Observation,
  options: { difficulty: Difficulty; seed: number },
  message: string,
): BotResult {
  if (
    request.observationVersion !== observation.version ||
    request.actorId !== observation.viewer
  )
    throw new Error("Mismatched observation and request");
  const action = request.legalOptions.find(
    (candidate) => candidate.id === request.fallbackDecision.optionId,
  );
  if (!action) throw new Error("Invalid decision request: missing fallback");
  const own = observation.state.players[observation.viewer];
  return {
    action,
    decision: { ...request.fallbackDecision },
    trace: {
      requestId: request.id,
      observationVersion: observation.version,
      configVersion: BOT_VERSION,
      seed: options.seed,
      difficulty: options.difficulty,
      profile: inferProfile(own.deckList ?? own.hand),
      selected: optionKey(action),
      alternatives: [],
      nodes: 0,
      generated: 0,
      durationMs: 0,
      completedDepth: 0,
      usedFallback: true,
      incomplete: true,
      confirmedWin: false,
      sampleCount: 0,
      reason:
        "The search limit was reached; I use the legal default for this decision.",
      error: message,
    },
  };
}
