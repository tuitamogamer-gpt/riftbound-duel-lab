import { describe, it, expect } from "vitest";
import { fixture, unit, act, chain, addGear, ogn, sfd } from "./fixtures/cards";
import { getKeywords, getMight, getLegalActions } from "../src/game/engine";
import { copyUnit, detach } from "../src/game/objects";
import { validState } from "../src/persistence";
import type { GameState, Effect } from "../src/game/types";
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function run(
  s: GameState,
  effects: Effect[],
  sourceId?: string,
  targetId?: string,
) {
  s.stack = [
    {
      id: "test",
      player: 0,
      cardId: ogn(49),
      kind: "ability",
      effects,
      sourceId,
      targetId,
    },
  ];
  return resolve(s);
}
function attach(s: GameState, id: string, target = "ally") {
  return run(s, [{ type: "equip" }], id, target);
}
describe("Svellsongur independent copied text", () => {
  it("copies a static bonus exactly once per attachment and preserves physical stats", () => {
    let s = fixture();
    s.units = [{ ...unit("ally"), cardId: sfd(85) }];
    addGear(s, 59, "svell");
    s = chain(attach(s, "svell"));
    expect(getMight(s, s.units[0])).toBe(10);
    addGear(s, 59, "second");
    s = chain(attach(s, "second"));
    expect(getMight(s, s.units[0])).toBe(14);
    expect(s.gears[0].copiedText).toBe(sfd(85));
    expect(validState(s)).toBe(true);
  });
  it("copies printed keywords without copying temporary or other equipment text", () => {
    let s = fixture();
    s.units = [
      { ...unit("ally"), cardId: ogn(194), temporaryKeywords: ["Tank"] },
    ];
    addGear(s, 59, "svell");
    s = chain(attach(s, "svell"));
    expect(
      getKeywords(s, s.units[0]).filter((x) => x === "Ganking"),
    ).toHaveLength(2);
    expect(getKeywords(s, s.units[0]).filter((x) => x === "Tank")).toHaveLength(
      1,
    );
    copyUnit(s.units[0], ogn(49), "test");
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
    detach(s, s.gears[0]);
    expect(getKeywords(s, s.units[0])).not.toContain("Ganking");
  });
  it("copies a global passive with the same physical unit as its source", () => {
    let s = fixture();
    s.units = [
      { ...unit("ally"), cardId: "ogs-001-024" },
      unit("enemy", 1, "field:0", 20),
    ];
    addGear(s, 59, "svell");
    s = chain(attach(s, "svell"));
    s.players[0].hand = [ogn(9)];
    s = chain(act(s, (a) => a.category === "play" && a.targetId === "enemy"));
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(5);
  });
  it("attaches before copying Aphelios and tracks each copied mode separately", () => {
    let s = fixture();
    s.units = [{ ...unit("ally"), cardId: sfd(49) }];
    addGear(s, 59, "svell");
    s = attach(s, "svell");
    s = act(s, (a) => a.label.startsWith("Channel"));
    s = chain(s);
    expect(s.units[0].usedAbilities).toEqual(["aphelios:1"]);
    expect(s.players[0].runes).toHaveLength(1);
    addGear(s, 33, "shield");
    s = attach(s, "shield");
    s = act(s, (a) => a.label.startsWith("Channel"));
    s = chain(s);
    expect(s.units[0].buff).toBe(1);
    expect(s.units[0].usedAbilities).toContain("aphelios:svell:1");
    expect(s.players[0].runes).toHaveLength(2);
  });
  it("each copied Zilean replacement has its own once-per-turn use", () => {
    let s = fixture();
    s.units = [{ ...unit("ally", 0, "field:0"), cardId: "unl-086-219" }];
    addGear(s, 59, "svell");
    s = chain(attach(s, "svell"));
    s = run(s, [{ type: "token", cardName: "Recruit", location: "base" }]);
    s = chain(s);
    expect(s.units.filter((u) => u.token)).toHaveLength(3);
    s = run(s, [{ type: "token", cardName: "Recruit", location: "base" }]);
    s = chain(s);
    expect(s.units.filter((u) => u.token)).toHaveLength(4);
    expect(s.gears[0].copiedTokenTurn).toBe(s.turn);
  });
});
