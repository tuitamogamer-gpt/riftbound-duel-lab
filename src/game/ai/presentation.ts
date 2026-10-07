import type { StepFrame } from "../engine";
import type { GameAction, GameState, PlayerId } from "../types";
import type { BotResult } from "./planner";

/** The trace projection allowed in an in-progress human interface. */
export function publicExplanation(result: BotResult) {
  return {
    reason: result.trace.reason,
    difficulty: result.trace.difficulty,
    thinkingMs: Math.round(result.trace.durationMs),
  };
}

/** Redact UI captions and effect metadata, while retaining engine snapshots for rendering. */
export function publicDecisionPresentation(
  before: GameState,
  action: GameAction,
  frames: StepFrame[],
  viewer: PlayerId = 0,
) {
  const privateChoice =
    action.player !== viewer &&
    (action.id.startsWith("hide:") ||
      before.phase === "mulligan" ||
      before.phase === "choice");
  if (!privateChoice) return { action, frames };
  const label = "Opponent completes a private choice";
  return {
    action: {
      ...action,
      label,
      cardId: undefined,
      detail: undefined,
      effects: undefined,
      cardIndices: undefined,
    },
    frames: frames.map((frame) => ({
      ...frame,
      label,
      effect: undefined,
      draw:
        frame.draw && frame.draw.player !== viewer
          ? { player: frame.draw.player, count: frame.draw.count }
          : frame.draw,
    })),
  };
}
