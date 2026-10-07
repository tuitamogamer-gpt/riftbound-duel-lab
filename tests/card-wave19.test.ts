import { describe, it, expect } from "vitest";
import { cards, getCard, getCardTypes } from "../src/data/cards";
import {
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { buildCardRegistry } from "../src/game/card-registry";
import { getScript } from "../src/game/scripts";
import { validState } from "../src/persistence";
import { fixture, unit, act, chain, ogn, sfd } from "./fixtures/cards";
import type { Effect, GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function cast(s: GameState, id: string, target?: string) {
  s.players[s.priorityPlayer].hand.push(id);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === id &&
      (!target || a.targetId === target),
  );
}
function run(s: GameState, effects: Effect[], targetId?: string) {
  s.stack.push({
    id: "test",
    player: 0,
    cardId: ogn(49),
    kind: "ability",
    effects,
    targetId,
  });
  return resolve(s);
}
describe("wave19 hybrid and damage rules", () => {
  it("rejects a keyword-only Porobot script but accepts the complete hybrid", () => {
    const c = getCard(ven(58));
    expect(
      buildCardRegistry(
        [c],
        { [c.id]: { implemented: true } },
        () => undefined,
      )[c.id].status,
    ).toBe("unsupported");
    expect(getScript(c.id)?.cardTypes).toEqual(["Unit", "Gear"]);
    expect(getCardTypes(c)).toEqual(["Unit", "Gear"]);
  });
  it("Porobot is one exhausted physical Unit and Gear and counts other gear", () => {
    let s = fixture();
    s.gears = [1, 2, 3].map((n) => ({
      id: `g${n}`,
      cardId: sfd(73),
      owner: 0 as const,
      ready: true,
    }));
    const before = s.players[0].hand.length;
    s = chain(cast(s, ven(58)));
    const u = s.units[0];
    expect(u.ready).toBe(false);
    expect(s.gears.find((g) => g.id === u.id)).toBe(u);
    expect(s.players[0].hand).toHaveLength(before + 1);
    expect(validState(s)).toBe(true);
  });
  it("killing the Gear view kills the Unit once and creates one trash entry", () => {
    let s = chain(cast(fixture(), ven(58)));
    const id = s.units[0].id;
    s = run(s, [{ type: "kill", target: "anyGear" }], id);
    expect(s.units).toEqual([]);
    expect(s.gears).toEqual([]);
    expect(s.players[0].discard).toEqual([ven(58)]);
  });
  it("JSON round trip restores the two type indexes to one physical object", () => {
    const s = chain(cast(fixture(), ven(58)));
    const r = deserializeGame(serializeGame(s));
    expect(r.gears[0]).toBe(r.units[0]);
    r.units[0].ready = true;
    expect(r.gears[0].ready).toBe(true);
  });
  it("Porobot can be selected from trash by an effect that asks for a Gear", () => {
    let s = fixture();
    s.players[0].discard = [ven(58)];
    s = run(s, [
      {
        type: "playCard",
        play: { zone: "trash", cardTypes: ["Gear"], ignoreCost: true },
      },
    ]);
    expect(getLegalActions(s, 0).some((a) => a.cardId === ven(58))).toBe(true);
  });
  it("empowered Mel makes a friendly spell uncounterable", () => {
    let s = fixture();
    s.units = [
      { ...unit("mel", 1, "base:1"), cardId: ven(69), empowered: true },
    ];
    s.stack = [
      { id: "spell", cardId: ogn(9), player: 1, kind: "spell", effects: [] },
    ];
    s = resolve(cast(s, ogn(64), "spell"));
    expect(s.stack.map((i) => i.id)).toContain("spell");
  });
  it("Mel adds one negative Might and Gangplank replaces the reduction with +3", () => {
    let s = fixture();
    s.units = [
      { ...unit("mel"), cardId: ven(69), empowered: true },
      unit("enemy", 1, "field:0", 10),
      { ...unit("gang", 1, "field:0", 6), cardId: ven(86), empowered: true },
    ];
    s = run(s, [{ type: "might", amount: -2, target: "anyUnit" }], "enemy");
    expect(getMight(s, s.units[1])).toBe(7);
    s = run(s, [{ type: "might", amount: -2, target: "anyUnit" }], "gang");
    expect(getMight(s, s.units[2])).toBe(9);
  });
  it("Gangplank replaces chosen stuns and bounces but not a stun that does not choose", () => {
    let s = fixture();
    s.units = [
      { ...unit("gang", 1, "field:0", 6), cardId: ven(86), empowered: true },
    ];
    s = run(s, [{ type: "stun", target: "anyUnit" }], "gang");
    expect(s.units[0].stunned).toBe(false);
    expect(getMight(s, s.units[0])).toBe(9);
    s = run(s, [{ type: "bounce", target: "anyUnit" }], "gang");
    expect(getMight(s, s.units[0])).toBe(12);
    s = run(s, [{ type: "stun", chosenTargetId: "gang" }]);
    expect(s.units[0].stunned).toBe(true);
  });
  it("Elder Dragon kills from earlier friendly damage when it enters", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 20)];
    s = run(s, [{ type: "damage", amount: 1, target: "anyUnit" }], "enemy");
    expect(s.units[0].damageByPlayer).toEqual([1, 0]);
    s = cast(s, unl(118));
    expect(s.units.some((u) => u.id === "enemy")).toBe(false);
  });
  it("Elder's play trigger allows at most one enemy per location", () => {
    let s = fixture();
    s.units = [
      unit("one", 1, "field:0"),
      unit("two", 1, "field:0"),
      unit("three", 1, "field:1"),
    ];
    s = cast(s, unl(118));
    expect(s.pendingChoice?.kind).toBe("boardTargets");
    s = act(s, (a) => a.targetId === "one");
    expect(getLegalActions(s, 0).some((a) => a.targetId === "two")).toBe(false);
    expect(getLegalActions(s, 0).some((a) => a.targetId === "three")).toBe(
      true,
    );
  });
});
