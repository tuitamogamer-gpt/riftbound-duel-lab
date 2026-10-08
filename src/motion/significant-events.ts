import type { Review } from "../components/StepFlow";
import { publicTableEvents } from "../game/event-presentation";
import { momentKey } from "../game/table-presentation";

export type SignificantMomentKind =
  "champion" | "victory" | "conquer" | "combat" | "counter";

/** Celebrate a displayed public result, never a queued card or future frame. */
export function significantMoment(review: Review | null) {
  const events = publicTableEvents(review);
  if (!review || !events.length) return null;
  const frame = review.frames[review.index];
  const priorCombat =
    review.index > 0 ? review.frames[review.index - 1]?.combat : undefined;
  const repeatedImpact =
    priorCombat?.stage === "impact" &&
    JSON.stringify(priorCombat) === JSON.stringify(frame.combat);
  const event =
    events.find((event) => event.kind === "victory") ??
    events.find((event) => event.kind === "champion") ??
    events.find((event) => event.kind === "score") ??
    events.find((event) => event.kind === "counter") ??
    (frame.combat?.stage === "impact" && !repeatedImpact
      ? events.find((event) => event.kind === "combat")
      : undefined);
  if (!event) return null;
  return {
    kind: (event.kind === "score"
      ? "conquer"
      : event.kind) as SignificantMomentKind,
    player: event.player,
    key: momentKey(review),
  };
}
