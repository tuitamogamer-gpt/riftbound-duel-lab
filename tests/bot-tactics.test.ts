import { describe, expect, it } from "vitest";
import { getBotAction } from "../src/game/bot";
import { applyAction, getLegalActions } from "../src/game/engine";
import { battleBalance, planAttack } from "../src/game/bot-tactics";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

function main() {
  const s = createCombatFixture();
  s.phase = "main";
  s.combat = null;
  s.units = [];
  s.gears = [];
  s.players[0].legendId = "ogs-001-024";
  s.players[1].legendId = "ogs-009-024";
  s.fields[0].controller = 1;
  s.fields[1].controller = 0;
  return s;
}
describe("public-board tactical decisions", () => {
  it("finishes a kill instead of wasting all damage on a large protected unit", () => {
    const s = createCombatFixture();
    s.units = [
      combatUnit("attacker", 0, 3),
      combatUnit("huge", 1, 9),
      combatUnit("small", 1, 3),
    ];
    s.combat!.remaining[0] = 3;
    s.combat!.total[0] = 3;
    expect(getBotAction(s)?.targetId).toBe("small");
  });
  it("chooses two valuable kills over one larger target", () => {
    const s = createCombatFixture();
    s.units = [
      combatUnit("attacker", 0, 6),
      combatUnit("large", 1, 6),
      combatUnit("first", 1, 3),
      combatUnit("second", 1, 3),
    ];
    s.combat!.remaining[0] = 6;
    s.combat!.total[0] = 6;
    expect(getBotAction(s)?.targetId).not.toBe("large");
    const next = applyAction(s, getBotAction(s)!);
    expect(getBotAction(next)?.targetId).not.toBe("large");
  });
  it("respects Tank before other lethal targets", () => {
    const s = createCombatFixture();
    s.units = [
      combatUnit("attacker", 0, 3),
      { ...combatUnit("tank", 1, 8), temporaryKeywords: ["Tank"] },
      combatUnit("small", 1, 3),
    ];
    s.combat!.remaining[0] = 3;
    expect(getBotAction(s)?.targetId).toBe("tank");
  });
  it("uses public damage and prevention, and excludes stunned combat power", () => {
    const s = main();
    s.units = [
      {
        ...combatUnit("own", 0, 4),
        ready: true,
        location: "base:0",
        damage: 3,
      },
      combatUnit("enemy", 1, 3),
    ];
    expect(battleBalance(s, 0, "field:0", [s.units[0]]).wins).toBe(false);
    s.units[0].preventDamage = 4;
    expect(battleBalance(s, 0, "field:0", [s.units[0]]).wins).toBe(true);
    s.units[0].stunned = true;
    expect(battleBalance(s, 0, "field:0", [s.units[0]]).wins).toBe(false);
  });
  it("uses only one inexpensive unit to claim an empty field", () => {
    const s = main();
    s.fields[0].controller = null;
    s.units = [
      { ...combatUnit("small", 0, 2), ready: true, location: "base:0" },
      { ...combatUnit("large", 0, 7), ready: true, location: "base:0" },
    ];
    const action = getBotAction(s)!;
    expect(action.sourceId).toBe("small");
    const selecting = applyAction(s, action);
    expect(getBotAction(selecting)?.id).toBe("move-confirm");
    expect(selecting.pendingMove?.unitIds).toEqual(["small"]);
  });
  it("assembles a winning group and stops adding units once the plan is complete", () => {
    const s = main();
    s.units = [
      { ...combatUnit("a", 0, 3), ready: true, location: "base:0" },
      { ...combatUnit("b", 0, 3), ready: true, location: "base:0" },
      { ...combatUnit("c", 0, 3), ready: true, location: "base:0" },
      combatUnit("enemy", 1, 4),
    ];
    const plan = planAttack(s, 0, "field:0", s.units.slice(0, 3));
    expect(plan?.ids).toHaveLength(2);
    let moving = applyAction(s, getBotAction(s)!);
    moving = applyAction(moving, getBotAction(moving)!);
    expect(moving.pendingMove?.unitIds).toHaveLength(2);
    expect(getBotAction(moving)?.id).toBe("move-confirm");
  });
  it("keeps a holding unit when a base unit can capture the other field", () => {
    const s = main();
    s.players[0].scoredFieldsThisTurn = [1];
    s.fields[0].controller = null;
    s.units = [
      {
        ...combatUnit("holding", 0, 2),
        location: "field:1",
        ready: true,
        temporaryKeywords: ["Ganking"],
      },
      { ...combatUnit("reserve", 0, 3), location: "base:0", ready: true },
    ];
    expect(getBotAction(s)?.sourceId).toBe("reserve");
  });
  it("does not spend nonlethal removal on damage that will simply heal at turn end", () => {
    const s = main();
    s.units = [combatUnit("huge", 1, 10)];
    s.players[0].hand = ["ogn-009-298"];
    s.players[0].energy = 10;
    s.players[0].runes = [{ id: "f", domain: "Fury", ready: true }];
    expect(getLegalActions(s, 0).some((a) => a.category === "play")).toBe(true);
    expect(getBotAction(s)?.id).toBe("end-turn");
  });
});

describe("combat tricks and combat keywords", () => {
  it("includes Assault and Shield in prospective combat instead of printed Might alone", () => {
    const s = main();
    const attacker = {
      ...combatUnit("attacker", 0, 3, "ogn-210-298"),
      location: "base:0" as const,
      ready: true,
    };
    const defender = combatUnit("defender", 1, 2, "ogn-052-298");
    s.units = [attacker, defender];
    const result = battleBalance(s, 0, "field:0", [attacker]);
    expect(result.attack).toBe(4);
    expect(result.defense).toBe(3);
    expect(result.wins).toBe(true);
    attacker.damage = 2;
    expect(battleBalance(s, 0, "field:0", [attacker]).wins).toBe(false);
  });
  it("conserves a combat buff when already winning, but plays it to turn a loss into a win", () => {
    const s = createCombatFixture();
    s.phase = "showdown";
    s.combat!.stage = "priority";
    s.players[0].hand = ["ogn-058-298"];
    s.players[0].energy = 10;
    s.units = [combatUnit("own", 0, 6), combatUnit("enemy", 1, 3)];
    expect(getBotAction(s)?.id).toBe("pass");
    s.units[0].baseMightOverride = 2;
    expect(getBotAction(s)?.cardId).toBe("ogn-058-298");
  });
  it("declines a buff that cannot save a unit from lethal damage on the chain", () => {
    const s = createCombatFixture();
    s.phase = "showdown";
    s.combat!.stage = "priority";
    s.units = [combatUnit("own", 0, 4), combatUnit("enemy", 1, 3)];
    s.players[0].hand = ["ogn-058-298"];
    s.players[0].energy = 10;
    s.stack = [
      {
        id: "overkill",
        cardId: "ogn-009-298",
        player: 1,
        targetId: "own",
        effects: [{ type: "damage", amount: 10 }],
        kind: "spell",
      },
    ];
    expect(getBotAction(s)?.id).toBe("pass");
  });
});
