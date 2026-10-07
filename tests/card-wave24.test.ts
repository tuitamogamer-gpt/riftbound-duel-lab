import { describe, it, expect } from "vitest";
import { fixture, unit, act, chain, ogn } from "./fixtures/cards";
import { getLegalActions } from "../src/game/engine";
import type { GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
describe("wave24 staged spell decisions", () => {
  it("Rain announces all six choices, pays Deflect each time, then deals six instances", () => {
    let s = fixture();
    s.units = [{ ...unit("enemy", 1, "field:0", 30), cardId: ogn(41) }];
    s.players[0].hand = [ogn(248)];
    s = act(s, (a) => a.category === "play");
    for (let i = 0; i < 6; i++) s = act(s, "draft:target:enemy");
    expect(s.stack).toEqual([]);
    s = act(s, "draft:done");
    expect(s.stack[0].effects).toHaveLength(6);
    expect(s.players[0].power).toBe(15);
    s = chain(s);
    expect(s.units[0].damage).toBe(12);
  });
  it("Alpha chooses targets up front but assigns current Might on resolution and grants XP for actual kills", () => {
    let s = fixture();
    s.units = [
      unit("friend", 0, "base:0", 4),
      unit("a", 1, "field:0", 2),
      unit("b", 1, "field:1", 3),
    ];
    s.players[0].hand = [unl(192)];
    s = act(s, (a) => a.category === "play");
    s = act(s, "draft:target:friend");
    s = act(s, "draft:board:a");
    s = act(s, "draft:board:b");
    s = act(s, "draft:step");
    s = act(s, "draft:done");
    expect(s.stack[0].targetId).toBe("friend~a~b");
    s.units[0].temporaryMight = 1;
    s = resolve(s);
    s = act(s, "choose-custom:split:assign:a:2");
    s = act(s, "choose-custom:split:assign:b:3");
    s = chain(s);
    expect(s.units.map((u) => u.id)).toEqual(["friend"]);
    expect(s.players[0].xp).toBe(2);
  });
  it("Alpha losing Might requires dropping only the excess targets", () => {
    let s = fixture();
    s.units = [
      unit("friend", 0, "base:0", 3),
      unit("a", 1, "field:0", 8),
      unit("b", 1, "field:1", 8),
      unit("c", 1, "field:1", 8),
    ];
    s.players[0].hand = [unl(192)];
    s = act(s, (a) => a.category === "play");
    s = act(s, "draft:target:friend");
    for (const id of ["a", "b", "c"]) s = act(s, `draft:board:${id}`);
    s = act(act(s, "draft:step"), "draft:done");
    s.units[0].temporaryMight = -2;
    s = resolve(s);
    s = act(s, "choose-custom:split:drop:a");
    s = act(s, "choose-custom:split:drop:b");
    expect(getLegalActions(s, 0).map((a) => a.id)).toEqual([
      "choose-custom:split:assign:c:1",
    ]);
    s = act(s, "choose-custom:split:assign:c:1");
    expect(s.units.find((u) => u.id === "c")?.damage).toBe(1);
  });
  it("Void Assault fixes both units and destinations before either moves", () => {
    let s = fixture();
    s.units = [unit("friend"), unit("enemy", 1, "base:1")];
    s.players[0].hand = [unl(202)];
    s = act(s, (a) => a.category === "play");
    s = act(s, "draft:move:friend:field:0");
    s = act(s, "draft:move:enemy:field:0");
    s = act(s, "draft:done");
    expect(s.units.every((u) => u.location.startsWith("base:"))).toBe(true);
    s = resolve(s);
    expect(s.units.every((u) => u.location === "field:0")).toBe(true);
    expect(s.combat?.attacker).toBe(0);
  });
  it("Curtain Call pays three separate costs and chooses each mode only once", () => {
    let s = fixture();
    s.players[0].hand = [unl(182)];
    s.units = [unit("a", 1, "field:0", 20), unit("b", 1, "base:1", 20)];
    s = act(s, (a) => a.category === "play" && a.repeatMask === 7);
    for (let i = 0; i < 4; i++) {
      s = act(s, `draft:mode:${i}`);
      s = act(
        s,
        i === 0
          ? "draft:target:none"
          : i === 2
            ? "draft:target:b"
            : "draft:target:a",
      );
    }
    s = act(s, "draft:done");
    expect(s.players[0].energy).toBe(24);
    expect(s.players[0].power).toBe(28);
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.units[0]).toMatchObject({ damage: 2, temporaryMight: -4 });
    expect(s.units[1].damage).toBe(3);
  });
  it("Divine Judgment lets both players retain two of each category and recycles the rest without deaths", () => {
    let s = fixture();
    s.players[0].hand = [ogn(244), ogn(9), ogn(37), ogn(49)];
    s.players[1].hand = [ogn(9), ogn(37), ogn(49)];
    s.units = [
      unit("a"),
      unit("b"),
      unit("c"),
      unit("x", 1, "base:1"),
      unit("y", 1, "base:1"),
      unit("z", 1, "base:1"),
    ];
    s = chain(act(s, (a) => a.cardId === ogn(244)));
    expect(s.units.filter((u) => u.owner === 0)).toHaveLength(2);
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(2);
    expect(s.players.map((p) => p.hand.length)).toEqual([2, 2]);
    expect(s.players[1].discard).toEqual([]);
    expect(s.players[0].discard).toEqual([ogn(244)]);
  });
});
