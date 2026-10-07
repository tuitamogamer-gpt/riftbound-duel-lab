import { describe, it, expect } from "vitest";
import { getLegalActions } from "../src/game/engine";
import { fixture, unit, addGear, act, chain, ogn, sfd } from "./fixtures/cards";
import { trashCards } from "../src/game/trash";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
describe("wave21 recycling and linked cards", () => {
  it("Karma sees recycling a card but not spending a rune", () => {
    let s = fixture();
    s.units = [{ ...unit("karma"), cardId: ogn(235) }];
    s.players[0].hand = [ogn(235)];
    s = act(s, (a) => a.cardId === ogn(235) && a.category === "play");
    s = act(act(s, "pass"), "pass");
    s = act(s, "choose-predict:recycle");
    s = chain(s);
    expect(s.units.reduce((n, u) => n + u.buff, 0)).toBe(1);
  });
  it("Sivir exhausts during rune recycling and readies after an enemy death", () => {
    let s = fixture();
    s.players[0].legendId = sfd(203);
    s.players[0].runes = [{ id: "r", domain: "Fury", ready: true }];
    s.players[0].power = 0;
    s.players[0].hand = [ogn(9)];
    s.units = [unit("enemy", 1, "field:0", 1)];
    s = act(s, (a) => a.category === "play" && a.targetId === "enemy");
    s = chain(s);
    expect(s.gears.some((g) => g.token && g.owner === 0)).toBe(true);
    expect(s.players[0].legendUsedTurn).toBe(-1);
  });
  it("Sarcophagus keeps links to physical banishments after array indexes change", () => {
    let s = fixture();
    s.players[0].discard = [ogn(49), ogn(49), ogn(24)];
    s.players[0].hand = [unl(148)];
    s = chain(act(s, (a) => a.category === "play"));
    expect(s.players[0].banished).toEqual([ogn(49), ogn(49)]);
    expect(s.players[0].discard).toEqual([ogn(24)]);
    s = act(s, (a) => a.category === "ability" && a.cardId === unl(148));
    s = chain(s);
    expect(s.units).toHaveLength(1);
    expect(s.players[0].banished).toHaveLength(1);
  });
  it("Zero Drive links the dead unit and pays banish-self before responses", () => {
    let s = fixture();
    s.units = [unit("victim", 0, "field:0", 1)];
    addGear(s, 90, "drive", "victim");
    s.players[0].hand = [ogn(9)];
    s = chain(act(s, (a) => a.category === "play" && a.targetId === "victim"));
    expect(s.players[0].banished).toContain(ogn(49));
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = act(s, (a) => a.sourceId === "drive" && a.id.startsWith("ability|"));
    expect(s.gears).toEqual([]);
    s = chain(s);
    expect(s.units.map((u) => u.cardId)).toContain(ogn(49));
  });
  it("Last Rites pays the two-card recycle cost before attaching", () => {
    let s = fixture();
    s.units = [unit("a")];
    addGear(s, 150, "rites");
    s.players[0].discard = [ogn(24), ogn(49), ogn(49)];
    s = act(
      s,
      (a) => a.id.startsWith("equip:") && a.cardIndices?.join(",") === "0,1",
    );
    expect(s.players[0].discard).toEqual([ogn(49)]);
    s = chain(s);
    expect(s.gears[0].attachedTo).toBe("a");
  });
  it("Blade can sacrifice the target as a cost and then fails to attach", () => {
    let s = fixture();
    s.units = [unit("a")];
    addGear(s, 178, "blade");
    s = act(s, (a) => a.id.startsWith("equip:") && a.costSourceId === "a");
    expect(s.units).toEqual([]);
    s = chain(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("Jhin remembers four distinct spell visits and returns all on the fourth", () => {
    let s = fixture();
    s.players[0].legendId = unl(181);
    s.players[0].hand = Array(4).fill(ogn(154));
    s.units = [unit("a")];
    for (let i = 0; i < 4; i++)
      s = chain(act(s, (a) => a.category === "play" && a.targetId === "a"));
    expect(s.players[0].banished).toEqual([]);
    expect(trashCards(s, 0).filter((c) => c.cardId === ogn(154))).toHaveLength(
      4,
    );
    expect(s.players[0].runes).toHaveLength(4);
  });
});
