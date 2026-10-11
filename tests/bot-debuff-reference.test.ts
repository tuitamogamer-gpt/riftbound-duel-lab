import { describe, expect, it } from "vitest";
import { getReferenceAction } from "../src/game/bot-reference";
import { applyAction, getLegalActions } from "../src/game/engine";
import type { GameState } from "../src/game/types";
import { chain } from "./fixtures/cards";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

const stupefy = "ogn-095-298";

function fixture(combat = false) {
  const s = createCombatFixture();
  s.phase = combat ? "showdown" : "main";
  if (combat) s.combat!.stage = "priority";
  else s.combat = null;
  s.players[0].legendId = "ogs-001-024";
  s.players[1].legendId = "ogs-009-024";
  s.players[0].hand = [stupefy];
  s.players[0].energy = 1;
  s.units = [];
  s.gears = [];
  return s;
}

function choose(s: GameState) {
  const actions = getLegalActions(s, 0).filter(
    (a) => a.category === "play" || a.id === "pass" || a.id === "end-turn",
  );
  expect(actions.some((a) => a.cardId === stupefy)).toBe(true);
  return getReferenceAction(s, 0, actions)!;
}

describe("reference bot temporary Might reductions", () => {
  it("keeps Stupefy instead of cycling it on an undamaged enemy in base", () => {
    const s = fixture();
    s.units = [{ ...combatUnit("reserve", 1, 4), location: "base:1" }];
    expect(choose(s).id).toBe("end-turn");
  });

  it("debuffs the enemy that changes the combat result, not a larger reserve", () => {
    const s = fixture(true);
    s.units = [
      combatUnit("friend", 0, 3),
      combatUnit("enemy", 1, 3),
      { ...combatUnit("reserve", 1, 9), location: "base:1" },
    ];
    const action = choose(s);
    expect(action.cardId).toBe(stupefy);
    expect(action.targetId).toBe("enemy");
  });

  it.each([
    { own: 6, enemy: 3, description: "already won" },
    { own: 2, enemy: 9, description: "still lost" },
    { own: 1, enemy: 1, description: "unchanged at the minimum of 1" },
  ])("passes when combat is $description", ({ own, enemy }) => {
    const s = fixture(true);
    s.units = [combatUnit("friend", 0, own), combatUnit("enemy", 1, enemy)];
    expect(choose(s).id).toBe("pass");
  });

  it("finishes a damaged enemy in base without counting prevention as health", () => {
    const s = fixture();
    s.units = [
      {
        ...combatUnit("reserve", 1, 3),
        location: "base:1",
        damage: 2,
        preventDamage: 5,
      },
    ];
    const action = choose(s);
    expect(action.targetId).toBe("reserve");
    expect(action.cardId).toBe(stupefy);
    const resolved = chain(applyAction(s, action));
    expect(resolved.units.some((u) => u.id === "reserve")).toBe(false);
  });

  it("combines with pending damage to finish an enemy in base", () => {
    const s = fixture();
    s.units = [{ ...combatUnit("reserve", 1, 3), location: "base:1" }];
    s.stack = [
      {
        id: "pending-damage",
        cardId: "ogn-009-298",
        player: 0,
        targetId: "reserve",
        effects: [{ type: "damage", amount: 2 }],
        kind: "spell",
      },
    ];
    const action = choose(s);
    expect(action.targetId).toBe("reserve");
    expect(action.cardId).toBe(stupefy);
    const resolved = chain(applyAction(s, action));
    expect(resolved.units.some((u) => u.id === "reserve")).toBe(false);
  });

  it.each([
    { might: 4, prevention: 0, pending: 2, description: "remains nonlethal" },
    { might: 3, prevention: 0, pending: 3, description: "is already lethal" },
    { might: 3, prevention: 1, pending: 2, description: "is prevented" },
  ])(
    "keeps Stupefy when pending damage $description",
    ({ might, prevention, pending }) => {
      const s = fixture();
      s.units = [
        {
          ...combatUnit("reserve", 1, might),
          location: "base:1",
          preventDamage: prevention,
        },
      ];
      s.stack = [
        {
          id: "pending-damage",
          cardId: "ogn-009-298",
          player: 0,
          targetId: "reserve",
          effects: [{ type: "damage", amount: pending }],
          kind: "spell",
        },
      ];
      expect(choose(s).id).toBe("pass");
    },
  );
});
