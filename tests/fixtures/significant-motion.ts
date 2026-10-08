import type { Review } from "../../src/components/StepFlow";
import { applyAction, getLegalActions } from "../../src/game/engine";
import { publicTableEvents } from "../../src/game/event-presentation";
import { parseSession, type SavedSession } from "../../src/persistence";
import { combatUnit, createCombatFixture } from "./combat";
import {
  championArrivalReview,
  eventOpening,
  eventReview,
  spellEventReview,
} from "./event-highlights";

export const significantMotionModes = [
  "champion",
  "conquer",
  "hold",
  "combat-impact",
  "combat-assign",
  "combat-result",
  "counter",
  "victory",
  "phase",
  "draw",
  "rune",
  "hidden",
  "play",
  "damage",
] as const;
export type SignificantMotionMode = (typeof significantMotionModes)[number];

function displayed(review: Review, predicate: (review: Review) => boolean) {
  const index = review.frames.findIndex((_, index) =>
    predicate({ ...review, index }),
  );
  if (index < 0)
    throw new Error("Motion QA fixture has no requested real frame");
  return { ...review, index };
}

export function motionCombatReview() {
  let game = createCombatFixture();
  for (const targetId of [
    "defender-guard",
    "defender-front",
    "attacker-front",
  ]) {
    const action = getLegalActions(game, game.priorityPlayer).find(
      (action) => action.targetId === targetId,
    );
    if (!action) throw new Error(`Missing combat QA assignment: ${targetId}`);
    game = applyAction(game, action);
  }
  return eventReview(game, (action) => action.targetId === "attacker-guard");
}

export function motionScoreReview(kind: "conquer" | "hold", points = 0) {
  let game = eventOpening();
  // Use the same neutral, executable field as the table-moment engine regressions.
  game.fields[0].cardId = "ogn-279-298";
  if (kind === "hold") {
    game.units = [combatUnit("motion-holder", 1)];
    game.fields[0].controller = 1;
    game.players[1].points = points;
    return eventReview(game, "end-turn");
  }
  game.players[0].points = points;
  game.units = [
    { ...combatUnit("motion-mover", 0), location: "base:0", ready: true },
  ];
  game = applyAction(game, "move-start:motion-mover:field:0");
  let review = eventReview(game, "move-confirm");
  for (
    let pass = 0;
    pass < 6 && !review.frames.some((frame) => frame.score || frame.draw);
    pass++
  )
    review = eventReview(review.final, "pass");
  return review;
}

/** Paused synthetic loopback sessions; review events come from the real resolver. */
export function createSignificantMotionSession(
  mode: SignificantMotionMode = "champion",
): SavedSession {
  let review: Review;
  if (mode === "champion") {
    review = displayed(championArrivalReview(), (candidate) =>
      publicTableEvents(candidate).some((event) => event.kind === "champion"),
    );
  } else if (mode === "conquer" || mode === "hold") {
    review = displayed(
      motionScoreReview(mode),
      (candidate) => candidate.frames[candidate.index].score?.kind === mode,
    );
  } else if (mode.startsWith("combat-")) {
    const stage = mode.slice("combat-".length);
    review = displayed(
      motionCombatReview(),
      (candidate) => candidate.frames[candidate.index].combat?.stage === stage,
    );
  } else if (mode === "counter") {
    review = displayed(spellEventReview("counter"), (candidate) =>
      publicTableEvents(candidate).some((event) => event.kind === "counter"),
    );
  } else if (mode === "victory") {
    review = displayed(motionScoreReview("hold", 7), (candidate) =>
      publicTableEvents(candidate).some((event) => event.kind === "victory"),
    );
  } else if (mode === "hidden") {
    const game = eventOpening(1);
    game.fields[0].controller = 1;
    game.players[1].hand = ["ogn-097-298"];
    review = eventReview(game, (action) => action.id.startsWith("hide:"));
    review = displayed(
      review,
      (candidate) =>
        candidate.frames[candidate.index].state.hidden?.some(
          (hidden) => hidden.owner === 1,
        ) === true,
    );
  } else if (mode === "play" || mode === "damage") {
    review = displayed(spellEventReview(mode), (candidate) =>
      publicTableEvents(candidate).some((event) => event.kind === mode),
    );
  } else {
    review = displayed(eventReview(eventOpening(), "end-turn"), (candidate) =>
      publicTableEvents(candidate).some((event) => event.kind === mode),
    );
  }
  const session = { match: review.final, review, paused: true };
  const restored = parseSession(JSON.stringify(session));
  if (!restored.match || !restored.review)
    throw new Error(`Invalid motion QA session: ${mode}`);
  return session;
}
