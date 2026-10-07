import type { Review } from "../components/StepFlow";
import type { StepFrame } from "./engine";
import { visibleTurnStep } from "./presentation";
import { findCard } from "../catalog";
import { getRulesCardId } from "./scripts";
import type { Unit } from "./types";

/** A signature champion arrives only after its public unit actually exists. */
export function championMoment(review: Review | null): Unit | undefined {
  if (!review || !Number.isInteger(review.index) || review.index < 0)
    return undefined;
  const state = review.frames[review.index]?.state;
  const before = review.index
    ? review.frames[review.index - 1]?.state
    : review.before;
  if (!state || !before) return undefined;
  return state.units.find(
    (unit) =>
      !unit.token &&
      !before.units.some((old) => old.id === unit.id) &&
      !!findCard(unit.cardId) &&
      getRulesCardId(unit.cardId) ===
        getRulesCardId(state.players[unit.owner].championId),
  );
}

/** Only compare the displayed frame with its predecessor, never the final state. */
export function scoreMoment(review: Review | null): StepFrame["score"] {
  if (!review) return undefined;
  const frame = review.frames[review.index];
  const before = review.index
    ? review.frames[review.index - 1]?.state
    : review.before;
  if (!frame || !before) return undefined;
  if (frame.score) return frame.score;
  // Older saved reviews have no presentation metadata.
  for (const player of [0, 1] as const) {
    const from = before.players[player].points;
    const to = frame.state.players[player].points;
    if (to > from)
      return {
        player,
        from,
        to,
        kind:
          frame.effect?.type === "score"
            ? visibleTurnStep(frame.state) === "beginning"
              ? "hold"
              : "conquer"
            : "effect",
        fieldId: frame.effect?.locationId,
      };
  }
  return undefined;
}

export function phaseMoment(review: Review | null) {
  if (!review) return undefined;
  const state = review.frames[review.index]?.state;
  const before = review.index
    ? review.frames[review.index - 1]?.state
    : review.before;
  if (!state || !before || state.phase === "mulligan" || state.winner !== null)
    return undefined;
  const step = visibleTurnStep(state);
  if (step === "main") return undefined;
  return state.turn !== before.turn ||
    before.phase === "mulligan" ||
    visibleTurnStep(before) !== step
    ? step
    : undefined;
}

export const momentKey = (review: Review | null) =>
  review
    ? `${review.before.turn}:${review.before.nextId}:${review.action.id}:${review.index}`
    : "idle";
