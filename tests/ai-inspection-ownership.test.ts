import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import {
  applyDecision,
  decisionFor,
  getDecisionRequest,
} from "../src/game/ai/decisions";
import {
  getObservation,
  observationRulesView,
  sampleState,
} from "../src/game/ai/observation";
import { fixture, unit } from "./fixtures/cards";
import type { Effect, GameState, PlayerId } from "../src/game/types";

function position(actor: PlayerId = 0) {
  const s = fixture();
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = actor;
  s.players[actor].deck = ["ogn-049-298", "ogn-009-298", "ogn-175-298"];
  s.players[(1 - actor) as PlayerId].deck = [
    "ogn-088-298",
    "ogn-219-298",
    "ogn-058-298",
  ];
  return s;
}

function resolveToChoice(s: GameState) {
  for (let step = 0; !s.pendingChoice && step < 12; step++) {
    const action = getLegalActions(s, s.priorityPlayer).find(
      (action) => action.id === "pass",
    );
    expect(action).toBeDefined();
    s = applyAction(s, action!);
  }
  expect(s.pendingChoice).not.toBeNull();
  return s;
}

function effectChoice(actor: PlayerId, effects: Effect[]) {
  const s = position(actor);
  s.stack = [
    {
      id: "inspection-effect",
      player: actor,
      cardId: "ogn-049-298",
      kind: "ability",
      effects,
    },
  ];
  return resolveToChoice(s);
}

function blindFury(actor: PlayerId) {
  let s = position(actor);
  s.units = [
    {
      ...unit("inspection-hatchling", actor),
      cardId: "sfd-018-221",
      location: `base:${actor}`,
    },
  ];
  s.players[actor].hand = ["ogn-025-298"];
  const cast = getLegalActions(s, actor).find(
    (action) =>
      action.category === "play" &&
      action.sourceId === "hand:0" &&
      action.cardId === "ogn-025-298",
  );
  expect(cast).toBeDefined();
  s = applyAction(s, cast!);
  return resolveToChoice(s);
}

function executeRequest(s: GameState, id?: string) {
  const request = getDecisionRequest(s, s.priorityPlayer);
  expect(request).not.toBeNull();
  const live = getLegalActions(s, s.priorityPlayer);
  const action = id
    ? live.find((action) => action.id === id)!
    : live.find((action) => action.id === request!.fallbackDecision.optionId)!;
  expect(action).toBeDefined();
  return applyDecision(s, request!, decisionFor(request!, action));
}

describe("authorized deck inspection belongs to the inspected owner", () => {
  it.each([0, 1] as const)(
    "round-trips Blind Fury and Hatchling choices for seat %i",
    (actor) => {
      const enemy = (1 - actor) as PlayerId;
      let s = blindFury(actor);
      expect(s.pendingChoice?.kind).toBe("predict");
      expect(s.pendingChoice?.effect?.who).toBe("opponent");
      const observation = getObservation(s, actor);
      expect(observation.state.players[enemy].knownTopCards).toEqual([
        "ogn-088-298",
      ]);
      expect(observation.state.players[actor].knownTopCards).toBeUndefined();
      expect(observationRulesView(observation).players[enemy].deck).toEqual([
        "ogn-088-298",
        "unknown",
        "unknown",
      ]);
      expect(sampleState(observation, 17).players[enemy].deck[0]).toBe(
        "ogn-088-298",
      );
      const request = getDecisionRequest(s, actor)!;
      expect(request.legalOptions[0].label).toBe("Keep Mega-Mech on top");
      s = executeRequest(s, "choose-predict:keep");
      // The subsequent reveal's active play choice is authorized to inspect that same enemy card.
      expect(
        getObservation(s, actor).state.players[enemy].knownTopCards,
      ).toEqual(["ogn-088-298"]);
      for (
        let step = 0;
        (s.pendingChoice || s.stack.length) && step < 12;
        step++
      )
        s = executeRequest(s);
      expect(s.pendingChoice).toBeNull();
      expect(s.stack).toHaveLength(0);
      expect(
        s.units.some(
          (unit) => unit.cardId === "ogn-088-298" && unit.owner === actor,
        ),
      ).toBe(true);
      expect(
        getObservation(s, actor).state.players[enemy].knownTopCards,
      ).toBeUndefined();
    },
  );

  it.each([0, 1] as const)(
    "recycles the opponent's actual inspected card for seat %i",
    (actor) => {
      const enemy = (1 - actor) as PlayerId;
      let s = blindFury(actor);
      s = executeRequest(s, "choose-predict:recycle");
      expect(s.players[enemy].deck).toEqual([
        "ogn-219-298",
        "ogn-058-298",
        "ogn-088-298",
      ]);
      expect(
        getObservation(s, actor).state.players[enemy].knownTopCards,
      ).toEqual(["ogn-219-298"]);
      expect(
        getObservation(s, enemy).state.players[enemy].knownTopCards,
      ).toBeUndefined();
      for (
        let step = 0;
        (s.pendingChoice || s.stack.length) && step < 12;
        step++
      )
        s = executeRequest(s);
      expect(
        s.units.some(
          (unit) => unit.cardId === "ogn-219-298" && unit.owner === actor,
        ),
      ).toBe(true);
      expect(
        getObservation(s, actor).state.players[enemy].knownTopCards,
      ).toBeUndefined();
    },
  );

  it.each([0, 1] as const)(
    "keeps a unit's own Vision inspection on its own deck for seat %i",
    (actor) => {
      let s = position(actor);
      s.players[actor].hand = ["ogn-086-298"];
      const cast = getLegalActions(s, actor).find(
        (action) => action.category === "play" && action.sourceId === "hand:0",
      );
      expect(cast).toBeDefined();
      s = resolveToChoice(applyAction(s, cast!));
      expect(s.pendingChoice?.kind).toBe("predict");
      expect(
        getObservation(s, actor).state.players[actor].knownTopCards,
      ).toEqual(["ogn-049-298"]);
      expect(
        getObservation(s, actor).state.players[(1 - actor) as PlayerId]
          .knownTopCards,
      ).toBeUndefined();
      s = executeRequest(s, "choose-predict:recycle");
      expect(s.players[actor].deck).toEqual([
        "ogn-009-298",
        "ogn-175-298",
        "ogn-049-298",
      ]);
      expect(
        getObservation(s, actor).state.players[actor].knownTopCards,
      ).toBeUndefined();
    },
  );

  it("does not hash or reveal uninspected own order, enemy cards below the allowed top, or any look to the other seat", () => {
    const s = blindFury(0);
    const changed = structuredClone(s);
    changed.players[0].deck.reverse();
    changed.players[1].deck[1] = "ogn-175-298";
    expect(getObservation(changed, 0)).toEqual(getObservation(s, 0));
    const changedTop = structuredClone(s);
    changedTop.players[1].deck[0] = "ogn-175-298";
    expect(getObservation(changedTop, 0).version).not.toBe(
      getObservation(s, 0).version,
    );
    expect(getObservation(changedTop, 1)).toEqual(getObservation(s, 1));
    expect(
      getObservation(s, 1).state.players.every(
        (player) => !player.knownTopCards,
      ),
    ).toBe(true);
  });

  it("limits an explicitly enemy-owned top-card play selection to its active inspected count", () => {
    let s = effectChoice(0, [
      {
        type: "playCard",
        play: {
          zone: "top",
          zoneOwner: 1,
          count: 2,
          ignoreCost: true,
          optional: true,
        },
      },
    ]);
    expect(getObservation(s, 0).state.players[1].knownTopCards).toEqual([
      "ogn-088-298",
      "ogn-219-298",
    ]);
    expect(getObservation(s, 0).state.players[0].knownTopCards).toBeUndefined();
    expect(getObservation(s, 1).state.players[1].knownTopCards).toBeUndefined();
    const modified = structuredClone(s);
    modified.players[1].deck[2] = "ogn-175-298";
    expect(getObservation(modified, 0)).toEqual(getObservation(s, 0));
    s = executeRequest(s, "choose-custom:play-card:skip");
    expect(getObservation(s, 0).state.players[1].knownTopCards).toBeUndefined();
  });
});
