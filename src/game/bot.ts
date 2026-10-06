import {
  applyDecision,
  requestFromObservation,
  validateDecision,
} from "./ai/decisions";
import { getObservation } from "./ai/observation";
import {
  chooseDecision,
  type PlannerOptions,
  type BotResult,
} from "./ai/planner";
import type { GameAction, GameState, PlayerId } from "./types";
import { iterateLegalActions } from "./engine";
export { getObservation } from "./ai/observation";
export {
  getDecisionRequest,
  validateDecision,
  applyDecision,
} from "./ai/decisions";
export { chooseDecision, publicExplanation } from "./ai/planner";
export { DIFFICULTIES, BOT_VERSION } from "./ai/config";
export function decideBot(
  s: GameState,
  player: PlayerId = s.priorityPlayer,
  options: PlannerOptions = {},
): BotResult | null {
  if (s.winner !== null || s.priorityPlayer !== player) return null;
  const observation = getObservation(s, player),
    request = requestFromObservation(observation);
  if (!request) return null;
  const result = chooseDecision(request, observation, {
    difficulty: s.botSettings?.difficulty ?? "normal",
    seed: s.botSettings?.seed ?? 20261006,
    ...options,
  });
  const validation = validateDecision(s, request, result.decision);
  if (!validation.valid)
    throw new Error(`Bot decision rejected: ${validation.reason}`);
  return { ...result, action: validation.action! };
}
/** Compatibility with callers expecting a single existing UI selection step. */
export function getBotAction(
  s: GameState,
  player: PlayerId = s.priorityPlayer,
  options: PlannerOptions = {},
): GameAction | null {
  const action =
    decideBot(s, player, { deterministic: true, ...options })?.action ?? null;
  if (action?.id.startsWith("move-group:")) {
    for (const candidate of iterateLegalActions(s, player))
      if (
        candidate.sourceId === action.sourceId &&
        candidate.locationId === action.locationId &&
        candidate.id.startsWith("move-start:")
      )
        return candidate;
  }
  return action;
}
export function runBotUntilHuman(state: GameState, maxSteps = 256): GameState {
  let s = state;
  for (
    let i = 0;
    i < maxSteps && s.priorityPlayer === 1 && s.winner === null;
    i++
  ) {
    const result = decideBot(s, 1);
    if (!result) break;
    const request = requestFromObservation(getObservation(s, 1))!;
    s = applyDecision(s, request, result.decision);
  }
  if (s.winner === null && s.priorityPlayer === 1)
    throw new Error("Bot action limit reached without returning control");
  return s;
}
