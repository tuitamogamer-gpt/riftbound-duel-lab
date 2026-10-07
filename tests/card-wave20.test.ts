import { describe, it, expect } from "vitest";
import { cards } from "../src/data/cards";
import { getLegalActions } from "../src/game/engine";
import { fixture, unit, act, chain, ogn } from "./fixtures/cards";
import type { GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
describe("wave20 board costs", () => {
  it("Kraken Hunter can spend multiple buffs without choosing those units as targets", () => {
    let s = fixture();
    s.players[0].hand = [ogn(150)];
    s.players[0].power = 0;
    s.units = [
      { ...unit("a"), buff: 1 },
      { ...unit("b"), buff: 1 },
    ];
    s = act(s, (a) => a.category === "play" && a.additionalCostPaid === true);
    expect(s.pendingChoice?.kind).toBe("costTargets");
    s = act(s, "choose-cost:add:a");
    expect(getLegalActions(s, 0).some((a) => a.id === "choose-cost:done")).toBe(
      false,
    );
    s = act(s, "choose-cost:add:b");
    s = act(s, "choose-cost:done");
    expect(s.units.slice(0, 2).map((u) => u.buff)).toEqual([0, 0]);
    expect(s.units.at(-1)?.cardId).toBe(ogn(150));
  });
  it("Ledros kills selected units simultaneously and discounts only base power", () => {
    let s = fixture();
    s.players[0].hand = [ogn(231)];
    s.players[0].power = 2;
    s.units = [unit("a"), unit("b")];
    s = act(s, (a) => a.category === "play" && a.additionalCostPaid === true);
    s = act(s, "choose-cost:add:a");
    s = act(s, "choose-cost:add:b");
    s = act(s, "choose-cost:done");
    expect(s.units.map((u) => u.cardId)).toEqual([ogn(231)]);
    expect(s.players[0].power).toBe(0);
    expect(s.players[0].discard).toEqual([ogn(49), ogn(49)]);
  });
  it("Atakhan discounts energy and power using the sacrificed unit's printed costs", () => {
    let s = fixture();
    s.players[0].hand = [unl(170)];
    s.units = [{ ...unit("victim"), cardId: ogn(41) }];
    s.players[0].energy = 0;
    s.players[0].power = 1;
    s = act(s, (a) => a.cardId === unl(170) && a.additionalCostPaid === true);
    expect(s.units.map((u) => u.cardId)).toEqual([unl(170)]);
    expect(s.players[0].power).toBe(0);
  });
  it("Stalking Wolf requires a tribe cost and can enter the sacrificed unit's battlefield", () => {
    let s = fixture();
    s.players[0].hand = [unl(166)];
    s.units = [
      { ...unit("poro", 0, "field:0"), addedTag: "Poro" },
      unit("other"),
    ];
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.cardId === unl(166))
        .every((a) => a.costSourceId === "poro"),
    ).toBe(true);
    s = act(s, (a) => a.cardId === unl(166) && a.locationId === "field:0");
    expect(s.units.some((u) => u.id === "poro")).toBe(false);
    expect(s.units.find((u) => u.cardId === unl(166))?.location).toBe(
      "field:0",
    );
  });
  it("Heedless Resurrection constrains the public trash choice before paying its kill cost", () => {
    let s = fixture();
    s.players[0].hand = [unl(142)];
    s.players[0].discard = [ogn(49), ogn(41)];
    s.units = [{ ...unit("victim"), cardId: ogn(49) }];
    const actions = getLegalActions(s, 0).filter((a) => a.cardId === unl(142));
    expect(actions).toHaveLength(1);
    expect(actions[0].effects?.[0].maxEnergy).toBe(5);
    s = act(s, actions[0].id);
    expect(s.units).toEqual([]);
    s = chain(s);
    expect(s.units.map((u) => u.cardId)).toEqual([ogn(49)]);
    expect(s.players[0].discard).toContain(ogn(41));
  });
  it("Bottled Constellation sacrifices three other objects as a trigger cost", () => {
    let s = fixture();
    s.gears = [{ id: "bottle", cardId: ven(67), owner: 1, ready: true }];
    s.units = [
      unit("a", 1, "base:1"),
      unit("b", 1, "base:1"),
      unit("c", 1, "base:1"),
    ];
    s = act(s, "end-turn");
    s = chain(s);
    expect(s.players[1].points).toBe(1);
    expect(s.units).toEqual([]);
    expect(s.gears.map((g) => g.id)).toEqual(["bottle"]);
  });
});
