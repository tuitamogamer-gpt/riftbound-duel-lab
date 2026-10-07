import { describe, it, expect } from "vitest";
import { fixture, unit, act, chain, ogn } from "./fixtures/cards";
import { getLegalActions } from "../src/game/engine";
import type { GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
describe("wave22 physical spell replays and trash replacement", () => {
  it("Phoenix returns for 1 Energy and Fury after a direct spell kill", () => {
    let s = fixture();
    s.players[0].discard = [ogn(37)];
    s.players[0].hand = [ogn(9)];
    s.units = [unit("enemy", 1, "field:0", 2)];
    s = chain(act(s, (a) => a.category === "play"));
    expect(s.units.map((u) => u.cardId)).toContain(ogn(37));
    expect(s.players[0].energy).toBe(28);
    expect(s.players[0].power).toBe(28);
  });
  it("a Might reduction on earlier damage does not return Phoenix", () => {
    let s = fixture();
    s.players[0].discard = [ogn(37)];
    s.units = [{ ...unit("enemy", 1, "field:0", 5), damage: 4 }];
    s.stack = [
      {
        id: "reduce",
        kind: "spell",
        player: 0,
        cardId: ogn(9),
        effects: [{ type: "might", amount: -3, target: "anyUnit" }],
        targetId: "enemy",
      },
    ];
    s = resolve(s);
    expect(s.players[0].discard).toContain(ogn(37));
    expect(s.pendingChoice).toBeNull();
  });
  it("Dancing Grenade transfers control but preserves physical ownership and accumulates damage", () => {
    let s = fixture();
    s.players[0].hand = [unl(20)];
    s.units = [unit("enemy", 1, "field:0", 20), unit("ally", 0, "field:1", 20)];
    s = resolve(act(s, (a) => a.category === "play" && a.targetId === "enemy"));
    expect(s.units[0].damage).toBe(2);
    expect(s.pendingChoice?.kind).toBe("effectPlay");
    expect(s.priorityPlayer).toBe(1);
    s = act(s, (a) => a.category === "play" && a.targetId === "ally");
    expect(s.stack[0].originalOwner).toBe(0);
    s = resolve(s);
    expect(s.units[1].damage).toBe(3);
    s = act(s, "cancel-effect-play");
    expect(s.players[0].discard).toContain(unl(20));
    expect(s.players[1].discard).not.toContain(unl(20));
  });
  it("Death from Below only replays this physical spell after killing a small unit", () => {
    let s = fixture();
    s.players[0].hand = [unl(186)];
    s.players[0].discard = [unl(186)];
    s.units = [unit("enemy", 1, "field:0", 2)];
    s = resolve(act(s, (a) => a.category === "play"));
    expect(s.players[0].discard).toEqual([unl(186)]);
    expect(s.pendingChoice?.kind).toBe("effectPlay");
    s = act(s, "cancel-effect-play");
    expect(s.players[0].discard).toEqual([unl(186), unl(186)]);
  });
  it("Endless Riches banishes hand and trash, burns seven, allows normal-cost trash plays", () => {
    let s = fixture();
    s.players[0].hand = ["ven-022-166", ogn(9)];
    s.players[0].discard = [ogn(37)];
    s = chain(act(s, (a) => a.cardId === "ven-022-166"));
    expect(s.players[0].banished).toEqual([ogn(9), ogn(37)]);
    expect(s.players[0].discard).toHaveLength(7);
    expect(
      getLegalActions(s, 0).some((a) => a.sourceId?.endsWith(":riches")),
    ).toBe(true);
    s = act(s, (a) => a.sourceId?.endsWith(":riches") === true);
    expect(s.units).toHaveLength(1);
    s.stack = [
      {
        id: "kill",
        kind: "ability",
        player: 0,
        cardId: ogn(49),
        effects: [{ type: "kill", chosenTargetId: s.units[0].id }],
      },
    ];
    s = resolve(s);
    expect(s.players[0].banished).toContain(ogn(49));
    expect(s.players[0].discard).toHaveLength(6);
  });
});
