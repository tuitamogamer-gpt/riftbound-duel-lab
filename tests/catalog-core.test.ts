import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  deserializeGame,
  getCombatPower,
  getLegalActions,
  serializeGame,
} from "../src/game/engine";
import type { Effect, GameState, StackItem, Unit } from "../src/game/types";
import { getBotAction } from "../src/game/bot";
import { parseSession } from "../src/persistence";

function fixture(): GameState {
  const s = createGame({ seed: 909 });
  Object.assign(s, {
    phase: "main",
    turn: 4,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    units: [],
    stack: [],
    pendingTriggers: [],
    pendingChoice: null,
    combat: null,
  });
  for (const p of s.players)
    Object.assign(p, {
      hand: [],
      discard: [],
      energy: 30,
      power: 30,
      runes: [],
      championAvailable: false,
      legendId: "ogn-251-298",
      deck: Array(10).fill("ogn-049-298"),
    });
  return s;
}
function stack(
  id: string,
  cardId = "ogn-014-298",
  effects: Effect[] = [{ type: "draw", amount: 1 }],
  kind: StackItem["kind"] = "spell",
): StackItem {
  return { id, cardId, player: 1, kind, effects };
}
function settle(initial: GameState) {
  let s = initial;
  for (let i = 0; i < 30 && (s.stack.length || s.pendingChoice); i++) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? actions[0]
      : actions.find((a) => a.category === "pass");
    if (!a) throw new Error("Stuck choice");
    s = applyAction(s, a);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function playCounter(s: GameState, targetId: string, cardId = "ogn-064-298") {
  s.players[0].hand.push(cardId);
  const a = getLegalActions(s, 0).find(
    (a) =>
      a.cardId === cardId && a.targetId === targetId && a.category === "play",
  );
  expect(a).toBeDefined();
  return applyAction(s, a!);
}
function unit(): Unit {
  return {
    id: "unit",
    cardId: "ogn-049-298",
    owner: 0,
    location: "field:0",
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
}

describe("catalog rules primitives", () => {
  it("rune targets are announced and saved before responses, and departed runes are not replaced", () => {
    let s = fixture();
    const sona = unit();
    sona.cardId = "ogn-073-298";
    s.units = [sona];
    s.players[0].runes = [
      { id: "selected", domain: "Mind", ready: false },
      { id: "other", domain: "Mind", ready: false },
    ];
    s = applyAction(s, "end-turn");
    expect(s.pendingChoice?.finalizingTrigger).toBe(true);
    s = applyAction(s, "choose-rune:selected");
    expect(s.players[0].runes.every((rune) => !rune.ready)).toBe(true);
    const restored = parseSession(
      JSON.stringify({ match: s, review: null }),
    ).match;
    expect(restored).toEqual(s);
    s = applyAction(restored!, "choose-rune:skip");
    expect(s.stack[0].effects[0].runeIds).toEqual(["selected"]);
    const recycled = s.players[0].runes.shift()!;
    s.players[0].runeDeck.push(recycled.domain);
    s = settle(s);
    expect(s.players[0].runes).toEqual([
      { id: "other", domain: "Mind", ready: false },
    ]);
  });
  it("counters the selected lower spell, preserves an intervening ability and conserves both spells", () => {
    const s = fixture();
    s.stack = [
      stack("lower"),
      stack("ability", "ogn-049-298", [{ type: "draw", amount: 2 }], "ability"),
    ];
    const result = settle(playCounter(s, "lower"));
    expect(result.players[1].hand).toHaveLength(2);
    expect(result.players[1].discard).toEqual(["ogn-014-298"]);
    expect(result.players[0].discard).toEqual(["ogn-064-298"]);
  });
  it("offers no counter play without a spell and cannot choose abilities", () => {
    const s = fixture();
    s.players[0].hand = ["ogn-064-298"];
    s.stack = [stack("ability", "ogn-049-298", [], "ability")];
    expect(
      getLegalActions(s, 0).filter((a) => a.cardId === "ogn-064-298"),
    ).toEqual([]);
  });
  it("Defy checks both printed cost limits, even for a discounted spell", () => {
    const s = fixture();
    s.players[0].hand = ["ogn-045-298"];
    s.stack = [
      stack("small", "ogn-004-298"),
      stack("large", "ogs-022-024"),
      stack("power", "ogn-122-298"),
    ];
    const actions = getLegalActions(s, 0).filter(
      (a) => a.cardId === "ogn-045-298",
    );
    expect(actions.map((a) => a.targetId)).toEqual(["small"]);
    expect(settle(applyAction(s, actions[0])).players[1].discard).toContain(
      "ogn-004-298",
    );
  });
  it("a counter with a departed target cannot remove a different chain item", () => {
    const s = fixture();
    s.stack = [stack("selected"), stack("other")];
    const selected = playCounter(s, "selected");
    const vanished = selected.stack.splice(0, 1)[0];
    selected.players[1].discard.push(vanished.cardId);
    const result = settle(selected);
    expect(result.players[1].hand).toHaveLength(1);
    expect(result.players[1].discard).toHaveLength(2);
  });
  it("counter return replacement puts the card in hand, then continues to Predict", () => {
    const s = fixture();
    s.stack = [
      stack("selected"),
      {
        ...stack("return", "ogn-064-298", [
          {
            type: "counter",
            target: "spell",
            condition: "returnCounteredToHand",
          },
          { type: "predict" },
        ]),
        player: 0,
        targetId: "selected",
      },
    ];
    const result = settle(deserializeGame(serializeGame(s))!);
    expect(result.players[1].hand).toEqual(["ogn-014-298"]);
    expect(result.players[1].discard).toEqual([]);
  });
  it("countered second cards count for Legion but do not trigger Darius", () => {
    const s = fixture(),
      darius = unit();
    darius.cardId = "ogn-027-298";
    darius.ready = false;
    s.units = [darius];
    s.players[0].cardsPlayedThisTurn = 1;
    s.players[0].hand = ["sfd-087-221"];
    const second = getLegalActions(s, 0).find(
      (a) => a.cardId === "sfd-087-221" && a.category === "play",
    )!;
    let result = applyAction(s, second);
    const targetId = result.stack[0].id;
    result = applyAction(
      result,
      getLegalActions(result, 0).find((a) => a.category === "pass")!,
    );
    result.players[1].hand.push("ogn-064-298");
    const counter = getLegalActions(result, 1).find(
      (a) => a.cardId === "ogn-064-298" && a.targetId === targetId,
    )!;
    result = settle(applyAction(result, counter));
    expect(result.players[0].cardsPlayedThisTurn).toBe(2);
    expect(result.units[0].ready).toBe(false);
    expect(result.units[0].temporaryMight).toBe(0);
  });
  it("Flow replaces the countered spell's departure from the chain with banishment", () => {
    const s = fixture();
    s.stack = [{ ...stack("flow"), flowed: true }];
    const result = settle(playCounter(s, "flow"));
    expect(result.players[1].discard).toEqual([]);
    expect(result.players[1].banished).toEqual(["ogn-014-298"]);
    expect(result.players[1].hand).toEqual([]);
  });
  it("the bot counters an enemy spell and passes rather than countering its own", () => {
    const s = fixture();
    s.players[0].hand = ["ogn-064-298"];
    s.stack = [stack("enemy")];
    expect(getBotAction(s, 0)?.targetId).toBe("enemy");
    s.stack[0].player = 0;
    expect(getBotAction(s, 0)?.category).toBe("pass");
  });
  it("no-combat-damage units still have Might but contribute zero combat damage", () => {
    const s = fixture(),
      u = unit();
    u.temporaryKeywords = ["No combat damage"];
    s.units = [u];
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getCombatPower(s, u)).toBe(0);
    u.temporaryKeywords = [];
    expect(getCombatPower(s, u)).toBeGreaterThan(0);
  });
  it("cannot-move-to-base blocks normal and effect movement while allowing recall", () => {
    const s = fixture(),
      u = unit();
    u.temporaryKeywords = ["Cannot move to base"];
    s.units = [u];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "move" && a.locationId === "base:0",
      ),
    ).toBe(false);
    s.stack = [
      {
        ...stack(
          "move",
          "ogn-064-298",
          [{ type: "moveTarget", target: "friendlyUnit" }],
          "ability",
        ),
        player: 0,
        targetId: u.id,
      },
    ];
    const moved = settle(s);
    expect(moved.units[0].location).toBe("field:0");
    moved.stack.push({
      ...stack(
        "recall",
        "ogn-064-298",
        [{ type: "recall", target: "friendlyUnit" }],
        "ability",
      ),
      player: 0,
      targetId: u.id,
    });
    expect(settle(moved).units[0].location).toBe("base:0");
  });
});
