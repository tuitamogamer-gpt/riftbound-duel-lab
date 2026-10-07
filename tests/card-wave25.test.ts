import { describe, it, expect } from "vitest";
import { fixture, unit, act, chain, ogn, sfd } from "./fixtures/cards";
import { getLegalActions } from "../src/game/engine";
import type { GameState, Effect } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function run(s: GameState, effects: Effect[]) {
  s.stack = [
    { id: "test", player: 0, cardId: ogn(49), kind: "ability", effects },
  ];
  return resolve(s);
}
describe("wave25 look and token replacements", () => {
  it("Hatchling predicts after selecting a reveal and preserves the originally inspected batch", () => {
    let s = fixture();
    s.units = [{ ...unit("hatch"), cardId: sfd(18) }];
    s.players[0].deck = [ogn(49), ogn(37), ogn(52), ogn(9)];
    s = run(s, [{ type: "special", custom: "wave14:herald" }]);
    s = act(
      s,
      (a) =>
        a.effects?.some(
          (e) => e.custom === "wave14:herald-selected" && e.amount === 1,
        ) === true,
    );
    expect(s.pendingChoice?.kind).toBe("predict");
    s = act(s, "choose-predict:recycle");
    s = chain(s);
    expect(s.players[0].hand).toEqual([ogn(37)]);
    expect(s.players[0].deck[0]).toBe(ogn(9));
    expect(s.players[0].deck.slice(1).sort()).toEqual(
      [ogn(49), ogn(52)].sort(),
    );
  });
  it("a selected Nocturne may replace a later reveal after declining the look replacement", () => {
    let s = fixture();
    s.players[0].deck = [ogn(194), ogn(49), ogn(37), ogn(9)];
    s = run(s, [{ type: "special", custom: "wave14:herald" }]);
    s = act(s, "choose-custom:nocturne:0:keep");
    s = act(
      s,
      (a) =>
        a.effects?.some(
          (e) => e.custom === "wave14:herald-selected" && e.amount === 0,
        ) === true,
    );
    s = act(s, (a) => a.id.endsWith(":banish"));
    s = chain(s);
    expect(s.players[0].hand).toEqual([]);
    expect(s.units[0].cardId).toBe(ogn(194));
    expect(s.players[0].deck[0]).toBe(ogn(9));
  });
  it("Nocturne interrupts looking, preserves the original viewed batch and pays later", () => {
    let s = fixture();
    s.players[0].deck = [ogn(194), ogn(9), ogn(37), ogn(49)];
    s = run(s, [{ type: "special", custom: "origins-more:stacked-deck" }]);
    s = act(s, "choose-custom:nocturne:0:play");
    expect(s.units).toHaveLength(0);
    expect(
      getLegalActions(s, 0).filter((a) =>
        a.effects?.some((e) => e.custom === "origins-more:stacked-selected"),
      ),
    ).toHaveLength(2);
    s = act(
      s,
      (a) =>
        a.effects?.some(
          (e) => e.custom === "origins-more:stacked-selected" && e.amount === 0,
        ) === true,
    );
    s = chain(s);
    expect(s.players[0].hand).toEqual([ogn(9)]);
    expect(s.players[0].deck[0]).toBe(ogn(49));
    expect(s.units[0].cardId).toBe(ogn(194));
    expect(s.players[0].power).toBe(29);
  });
  it("all inspected Nocturnes may be banished without looking at replacement cards", () => {
    let s = fixture();
    s.players[0].deck = [ogn(194), ogn(194), ogn(194), ogn(49)];
    s = run(s, [{ type: "special", custom: "origins-more:stacked-deck" }]);
    for (let i = 0; i < 3; i++) s = act(s, "choose-custom:nocturne:0:play");
    s = chain(s);
    expect(s.units).toHaveLength(3);
    expect(s.players[0].deck).toEqual([ogn(49)]);
    expect(s.players[0].hand).toEqual([]);
  });
  it("Hatchling inspects and may recycle before a public reveal", () => {
    let s = fixture();
    s.units = [{ ...unit("hatch"), cardId: sfd(18) }];
    s.players[0].deck = [ogn(49), ogn(9)];
    s = run(s, [{ type: "special", custom: "sfd:conservatory" }]);
    expect(s.pendingChoice?.kind).toBe("predict");
    s = act(s, "choose-predict:recycle");
    expect(s.players[0].hand).toEqual([ogn(9)]);
    expect(s.players[0].deck).toEqual([ogn(49)]);
  });
  it("Zilean's replacement is optional once each turn and creates a physical second token", () => {
    let s = fixture();
    s.units = [{ ...unit("zilean", 0, "field:0"), cardId: unl(86) }];
    s = run(s, [{ type: "token", cardName: "Recruit", location: "base" }]);
    s = act(s, "choose-custom:zilean:zilean:yes");
    s = chain(s);
    expect(s.units.filter((u) => u.token)).toHaveLength(2);
    s = run(s, [{ type: "token", cardName: "Recruit", location: "base" }]);
    expect(s.pendingChoice).toBeNull();
    expect(s.units.filter((u) => u.token)).toHaveLength(3);
  });
});
