import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../../src/game/engine";
import type { GameAction, GameState, PlayerId } from "../../src/game/types";
import type { Review } from "../../src/components/StepFlow";
import { combatUnit } from "./combat";

export function eventOpening(player: PlayerId = 0) {
  const game = applyAction(
    applyAction(
      createGame({ seed: 744, playerDeckId: "annie", botDeckId: "annie" }),
      "mulligan:",
    ),
    "mulligan:",
  );
  game.currentPlayer = player;
  game.priorityPlayer = player;
  game.focusPlayer = player;
  for (const owner of [0, 1] as const) {
    game.players[owner].legendId = "ogs-009-024";
    game.players[owner].energy = 30;
    game.players[owner].runes = [
      "Fury",
      "Calm",
      "Mind",
      "Body",
      "Chaos",
      "Order",
    ].flatMap((domain) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `qa-${owner}-${domain}-${i}`,
        domain,
        ready: true,
      })),
    );
    game.players[owner].hand = [];
  }
  return game;
}

export function eventReview(
  before: GameState,
  match: string | ((action: GameAction) => boolean),
): Review {
  const action = getLegalActions(before, before.priorityPlayer).find(
    typeof match === "string" ? (action) => action.id === match : match,
  );
  if (!action) throw new Error(`Missing QA action ${String(match)}`);
  const result = applyActionStepped(before, action);
  return {
    before,
    final: result.state,
    frames: result.frames,
    index: 0,
    action,
  };
}

export function championArrivalReview(player: PlayerId = 0) {
  return eventReview(
    eventOpening(player),
    (action) => action.category === "play" && action.sourceId === "champion",
  );
}

export function spellEventReview(mode: "damage" | "buff" | "play" | "counter") {
  let game = eventOpening();
  game.units = [combatUnit("qa-target", 1, 8)];
  game.players[0].hand = [
    mode === "counter"
      ? "ogn-198-298"
      : mode === "buff"
        ? "ogn-058-298"
        : "ogn-009-298",
  ];
  if (mode === "counter")
    game.players[0].discard = [game.players[0].championId];
  let review = eventReview(
    game,
    (action) => action.category === "play" && action.sourceId === "hand:0",
  );
  if (mode === "play") return review;
  game = applyAction(review.final, "pass");
  if (mode === "counter") {
    game.players[1].hand = ["ogn-064-298"];
    review = eventReview(game, (action) => action.cardId === "ogn-064-298");
    game = applyAction(review.final, "pass");
    return eventReview(game, "pass");
  }
  return eventReview(game, "pass");
}

export function equippedGearReview() {
  const game = eventOpening();
  game.units = [{ ...combatUnit("qa-equip-target", 0, 4), location: "base:0" }];
  game.gears = [
    { id: "qa-gear", cardId: "sfd-009-221", owner: 0, ready: true },
  ];
  const announced = eventReview(game, (action) =>
    action.id.startsWith("equip:qa-gear:"),
  );
  return eventReview(applyAction(announced.final, "pass"), "pass");
}
