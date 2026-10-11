import { describe, expect, it } from "vitest";
import { decideBot } from "../src/game/bot";
import { applyAction, getLegalActions } from "../src/game/engine";
import { DIFFICULTIES, SearchBudget } from "../src/game/ai/config";
import { evaluate } from "../src/game/ai/evaluate";
import { settleSimulation } from "../src/game/ai/planner";
import type { PlayerId } from "../src/game/types";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

const STUPEFY = "ogn-095-298";
function holdingPosition(actor: PlayerId = 0) {
  const s = createCombatFixture();
  const enemy = (1 - actor) as PlayerId;
  s.phase = "main";
  s.combat = null;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = actor;
  s.units = [
    combatUnit("holder", actor, 3),
    {
      ...combatUnit("reserve", enemy, 3),
      location: `base:${enemy}` as const,
      ready: true,
    },
  ];
  s.fields[0].controller = actor;
  s.fields[1].controller = null;
  s.players[actor].hand = [STUPEFY];
  s.players[actor].energy = 1;
  for (const p of s.players) {
    p.legendUsedTurn = s.turn;
    p.deck = Array(20).fill("ogn-001-298");
    p.deckList = Array(20).fill("ogn-001-298");
  }
  return s;
}

describe("temporary debuff planning", () => {
  for (const actor of [0, 1] as const) {
    it.each(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[])(
      `player ${actor} preserves Stupefy against an idle base unit on %s`,
      (difficulty) => {
        const s = holdingPosition(actor);
        expect(
          getLegalActions(s, actor).some((a) => a.cardId === STUPEFY),
        ).toBe(true);
        const result = decideBot(s, actor, {
          difficulty,
          deterministic: true,
          seed: 321,
        })!;
        expect(result.action.id).toBe("end-turn");
        const after = applyAction(s, result.action);
        expect(after.players[actor].hand).toContain(STUPEFY);
      },
    );
  }

  it("does not count a reserve debuff or defender buff after their turn ends", () => {
    const s = holdingPosition();
    const before = evaluate(s, 0, "tempo");
    s.units[1].temporaryMight = -1;
    expect(evaluate(s, 0, "tempo").nextScore).toBe(before.nextScore);
    s.units[0].temporaryMight = 3;
    expect(evaluate(s, 0, "tempo").nextScore).toBe(before.nextScore);
  });

  it("preserves Stupefy against an exhausted reserve as well", () => {
    const s = holdingPosition();
    s.units[1].ready = false;
    expect(decideBot(s, 0, { deterministic: true, seed: 321 })!.action.id).toBe(
      "end-turn",
    );
  });

  it("still counts current Might when an opponent can attack this turn", () => {
    const s = holdingPosition();
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    const before = evaluate(s, 0, "tempo").nextScore;
    s.units[1].temporaryMight = -1;
    expect(evaluate(s, 0, "tempo").nextScore).toBeGreaterThan(before);
  });

  it("does not turn an unrelated base debuff into material during a showdown", () => {
    const s = createCombatFixture();
    s.units.push({ ...combatUnit("reserve", 1, 4), location: "base:1" });
    const before = evaluate(s, 0, "tempo").material;
    s.units.at(-1)!.temporaryMight = -1;
    expect(evaluate(s, 0, "tempo").material).toBe(before);
  });

  it("uses Stupefy on a damaged base unit when the reduction actually kills it", () => {
    const s = holdingPosition();
    s.units[1].damage = 2;
    const result = decideBot(s, 0, { deterministic: true, seed: 321 })!;
    expect(result.action.cardId).toBe(STUPEFY);
    expect(result.action.targetId).toBe("reserve");
    const after = settleSimulation(
      applyAction(s, result.action),
      0,
      new SearchBudget(1000, 9999, true),
    )!;
    expect(after.units.some((u) => u.id === "reserve")).toBe(false);
  });

  it("targets the fighting unit over a larger reserve to win combat", () => {
    const s = createCombatFixture();
    s.phase = "showdown";
    s.combat!.stage = "priority";
    s.units = [
      combatUnit("own", 0, 3),
      combatUnit("defender", 1, 3),
      { ...combatUnit("reserve", 1, 9), location: "base:1" },
    ];
    s.players[0].hand = [STUPEFY];
    s.players[0].energy = 1;
    const result = decideBot(s, 0, { deterministic: true, seed: 321 })!;
    expect(result.action.cardId).toBe(STUPEFY);
    expect(result.action.targetId).toBe("defender");
    const after = settleSimulation(
      applyAction(s, result.action),
      0,
      new SearchBudget(1000, 9999, true),
    )!;
    expect(after.units.some((u) => u.id === "own")).toBe(true);
    expect(after.units.some((u) => u.id === "defender")).toBe(false);
  });

  it("keeps the reaction when combat is already won and the reserve is irrelevant", () => {
    const s = createCombatFixture();
    s.phase = "showdown";
    s.combat!.stage = "priority";
    s.units = [
      combatUnit("own", 0, 6),
      combatUnit("defender", 1, 3),
      { ...combatUnit("reserve", 1, 9), location: "base:1" },
    ];
    s.players[0].hand = [STUPEFY];
    s.players[0].energy = 1;
    expect(decideBot(s, 0, { deterministic: true, seed: 321 })!.action.id).toBe(
      "pass",
    );
  });
});
