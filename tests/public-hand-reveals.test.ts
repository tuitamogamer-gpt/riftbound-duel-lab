import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import {
  getObservation,
  observationRulesView,
  sampleState,
} from "../src/game/ai/observation";
import {
  applyDecision,
  decisionFor,
  getDecisionRequest,
} from "../src/game/ai/decisions";
import {
  recordPublicHandReveal,
  validPublicHandReveal,
} from "../src/game/hand-reveals";
import { parseSession, validState } from "../src/persistence";
import { fixture } from "./fixtures/cards";
import type { GameState, PlayerId } from "../src/game/types";

const revealed = ["ogn-088-298", "ogn-199-298"];
function position(actor: PlayerId, xp = 0) {
  const game = fixture();
  game.currentPlayer = game.priorityPlayer = game.focusPlayer = actor;
  game.players[actor].xp = xp;
  game.players[(1 - actor) as PlayerId].hand = [...revealed];
  game.players[(1 - actor) as PlayerId].deck = ["ogn-219-298", "ogn-175-298"];
  return game;
}
function passChain(game: GameState) {
  for (
    let step = 0;
    (game.stack.length || game.pendingTriggers?.length) &&
    !game.pendingChoice &&
    step < 20;
    step++
  ) {
    const action = getLegalActions(game, game.priorityPlayer).find(
      (action) => action.id === "pass",
    );
    expect(action).toBeDefined();
    game = applyAction(game, action!);
  }
  return game;
}
function play(game: GameState, cardId: string) {
  game.players[game.priorityPlayer].hand = [cardId];
  const action = getLegalActions(game, game.priorityPlayer).find(
    (action) =>
      action.cardId === cardId &&
      action.category === "play" &&
      action.sourceId === "hand:0",
  );
  expect(action).toBeDefined();
  return passChain(applyAction(game, action!));
}
function requestChoice(
  game: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
) {
  const request = getDecisionRequest(game, game.priorityPlayer)!;
  expect(request).not.toBeNull();
  const action = getLegalActions(game, game.priorityPlayer).find(predicate)!;
  expect(action).toBeDefined();
  return applyDecision(game, request, decisionFor(request, action));
}

describe("historical public revealed hand snapshots", () => {
  it.each([0, 1] as const)(
    "records Scuttle Crab's actual deathknell publicly for both perspectives (actor %i)",
    (actor) => {
      const enemy = (1 - actor) as PlayerId;
      let game = play(position(actor), "unl-053-219");
      const crab = game.units.find((unit) => unit.cardId === "unl-053-219")!;
      expect(crab).toBeDefined();
      expect(game.publicReveals).toBeUndefined();
      game.stack = [
        {
          id: "kill-public-crab",
          player: enemy,
          cardId: "ogn-049-298",
          kind: "ability",
          targetId: crab.id,
          effects: [{ type: "kill", target: "anyUnit" }],
        },
      ];
      game = passChain(game);
      const snapshot = {
        owner: enemy,
        turn: game.turn,
        sourceCardId: "unl-053-219",
        cards: revealed,
      };
      expect(game.units.some((unit) => unit.id === crab.id)).toBe(false);
      expect(game.publicReveals).toEqual(snapshot);
      expect(game.players[actor].xp).toBe(1);
      expect(getObservation(game, 0).publicReveals).toEqual(snapshot);
      expect(getObservation(game, 1).publicReveals).toEqual(snapshot);
      expect(getObservation(game, actor).state.players[enemy].hand).toEqual([]);
      expect(game.log.some((entry) => entry.text.includes("reveals:"))).toBe(
        true,
      );
    },
  );

  it.each([0, 1] as const)(
    "shows Investigator's reveal even when the only choice is Decline (actor %i)",
    (actor) => {
      const enemy = (1 - actor) as PlayerId;
      let game = play(position(actor, 0), "unl-135-219");
      expect(game.pendingChoice).not.toBeNull();
      expect(getLegalActions(game, actor)).toHaveLength(1);
      expect(getLegalActions(game, actor)[0].label).toBe("Decline paying XP");
      expect(game.publicReveals).toEqual({
        owner: enemy,
        turn: game.turn,
        sourceCardId: "unl-135-219",
        cards: revealed,
      });
      expect(getObservation(game, actor).state.players[enemy].hand).toEqual([]);
      expect(getObservation(game, actor).publicReveals?.cards).toEqual(
        revealed,
      );
      game = requestChoice(
        game,
        (action) => action.label === "Decline paying XP",
      );
      expect(game.pendingChoice).toBeNull();
      expect(game.players[actor].xp).toBe(0);
      expect(game.players[enemy].hand).toEqual(revealed);
      expect(getObservation(game, enemy).publicReveals?.cards).toEqual(
        revealed,
      );
    },
  );

  it.each([0, 1] as const)(
    "captures Investigator's hand before optional discard and replacement draw (actor %i)",
    (actor) => {
      const enemy = (1 - actor) as PlayerId;
      let game = play(position(actor, 2), "unl-135-219");
      expect(game.publicReveals?.cards).toEqual(revealed);
      game = requestChoice(
        game,
        (action) => action.label === "Pay 2 XP: discard Mega-Mech",
      );
      expect(game.players[actor].xp).toBe(0);
      expect(game.players[enemy].hand).toEqual(["ogn-199-298", "ogn-219-298"]);
      expect(game.players[enemy].discard).toContain("ogn-088-298");
      expect(game.publicReveals?.cards).toEqual(revealed);
      expect(getObservation(game, actor).publicReveals?.cards).not.toContain(
        "ogn-219-298",
      );
      expect(getObservation(game, actor).state.players[enemy].hand).toEqual([]);
    },
  );

  it("leaves policy state, version hashes, sampled hands and decision requests unchanged", () => {
    const game = play(position(0, 0), "unl-135-219");
    const withoutSnapshot = structuredClone(game);
    delete withoutSnapshot.publicReveals;
    const withObservation = getObservation(game, 0);
    const withoutObservation = getObservation(withoutSnapshot, 0);
    expect(withObservation.state).toEqual(withoutObservation.state);
    expect(withObservation.version).toBe(withoutObservation.version);
    expect(observationRulesView(withObservation)).toEqual(
      observationRulesView(withoutObservation),
    );
    expect(sampleState(withObservation, 24)).toEqual(
      sampleState(withoutObservation, 24),
    );
    expect(getDecisionRequest(game, 0)).toEqual(
      getDecisionRequest(withoutSnapshot, 0),
    );
    const unknownHand = structuredClone(game);
    unknownHand.players[1].hand = ["ogn-219-298", "ogn-175-298"];
    expect(getObservation(unknownHand, 0)).toEqual(withObservation);
  });

  it("keeps a single independent historical snapshot while future cards remain private", () => {
    let game = play(position(0, 0), "unl-135-219");
    game = requestChoice(
      game,
      (action) => action.label === "Decline paying XP",
    );
    const observation = getObservation(game, 0);
    observation.publicReveals!.cards.push("ogn-219-298");
    expect(game.publicReveals?.cards).toEqual(revealed);
    game.players[1].hand.push("ogn-219-298");
    expect(getObservation(game, 0).publicReveals?.cards).toEqual(revealed);
    expect(getObservation(game, 0).state.players[1].hand).toEqual([]);
    game.players[0].hand = [];
    game.turn++;
    recordPublicHandReveal(game, 0, "unl-053-219");
    expect(game.publicReveals).toEqual({
      owner: 0,
      turn: game.turn,
      sourceCardId: "unl-053-219",
      cards: [],
    });
    expect(Object.keys(game.publicReveals!)).toEqual([
      "owner",
      "turn",
      "sourceCardId",
      "cards",
    ]);
  });

  it("validates snapshots and preserves a revealed choice through save continuation", () => {
    const game = play(position(0, 2), "unl-135-219");
    expect(validPublicHandReveal(game.publicReveals)).toBe(true);
    expect(validPublicHandReveal({ ...game.publicReveals, owner: 2 })).toBe(
      false,
    );
    expect(
      validPublicHandReveal({
        ...game.publicReveals,
        sourceCardId: "ogn-049-298",
      }),
    ).toBe(false);
    expect(
      validPublicHandReveal({ ...game.publicReveals, cards: ["not-a-card"] }),
    ).toBe(false);
    expect(validPublicHandReveal({ ...game.publicReveals, turn: NaN })).toBe(
      false,
    );
    expect(
      validPublicHandReveal({
        ...game.publicReveals,
        cards: Array(1000).fill(revealed[0]),
      }),
    ).toBe(true);
    expect(
      validPublicHandReveal({
        ...game.publicReveals,
        cards: Array(1001).fill(revealed[0]),
      }),
    ).toBe(false);
    const restored = parseSession(
      JSON.stringify({ match: game, review: null }),
    ).match;
    expect(restored).not.toBeNull();
    expect(restored!.publicReveals).toEqual(game.publicReveals);
    expect(getDecisionRequest(restored!, 0)).toEqual(
      getDecisionRequest(game, 0),
    );
    expect(
      validState({
        ...game,
        publicReveals: { ...game.publicReveals!, cards: ["not-a-card"] },
      }),
    ).toBe(false);
    expect(
      validState({
        ...game,
        publicReveals: { ...game.publicReveals!, turn: game.turn + 1 },
      }),
    ).toBe(false);
  });
});
