import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { emitGameEvent, getMight } from "../src/game/engine";
import { validState } from "../src/persistence";
import type { GameState, Unit } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  deployGear,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

const as = (u: Unit, n: number): Unit => ({ ...u, cardId: rad(n) });
const kill = (s: GameState, targetId: string) => {
  s.stack.push({
    id: `kill-${targetId}`,
    kind: "ability",
    cardId: rad(59),
    player: 0,
    effects: [{ type: "kill", target: "anyUnit" }],
    targetId,
  });
  s.priorityPlayer = 0;
  return s;
};
const saves = (s: GameState) =>
  expect(validState(JSON.parse(JSON.stringify(s)))).toBe(true);
const move = (s: GameState, id: string, to: string) =>
  act(act(s, `move-start:${id}:${to}`), "move-confirm");

describe("Radiance wave 7", () => {
  it("Mordekaiser, Twice Slain kills a friendly unit instead of dying, once each turn", () => {
    let s = fixture();
    s.units = [
      { ...as(unit("m", 0, "field:0", 5), 20), damage: 3 },
      unit("v", 0, "base:0", 2),
    ];
    s = settle(until(kill(s, "m"), "Kill Playful Phantom to heal"));
    const m = byId(s, "m");
    expect(m.location).toBe("base:0");
    expect(m.damage).toBe(0);
    expect(m.ready).toBe(false);
    expect(s.units.some((u) => u.id === "v")).toBe(false);
    // Once each turn: the second death this turn is not replaced.
    s.units.push(unit("w", 0, "base:0", 2));
    s = settle(kill(s, "m"));
    expect(s.units.some((u) => u.id === "m")).toBe(false);
  });

  it("Mordekaiser, Twice Slain may let himself die", () => {
    let s = fixture();
    s.units = [as(unit("m", 0, "field:0", 5), 20), unit("v", 0, "base:0", 2)];
    s = settle(until(kill(s, "m"), "Let the units die"));
    expect(s.units.map((u) => u.id)).toEqual(["v"]);
  });

  it("Gravity Field taxes enemy moves to its battlefield and draws when it dies", () => {
    let s = fixture();
    deployGear(s, rad(62), "field:0", 1, "gf");
    s.units = [unit("a", 0, "base:0", 2)];
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(move(s, "a", "field:0"));
    expect(s.players[0].energy).toBe(energy - 1);
    expect(s.players[0].power).toBe(power - 1);
    let poor = fixture();
    deployGear(poor, rad(62), "field:0", 1, "gf");
    poor.units = [unit("a", 0, "base:0", 2)];
    poor.players[0].energy = 0;
    poor = act(poor, "move-start:a:field:0");
    expect(actions(poor).some((a) => a.id === "move-confirm")).toBe(false);
    const hand = s.players[1].hand.length;
    s = settle(
      resolveEffects(s, rad(59), [{ type: "kill", target: "anyGear" }], {
        targetId: "gf",
      }),
    );
    expect(s.players[1].hand.length).toBe(hand + 1);
  });

  it("Dockside Lock-Up banishes a unit here and releases it to you when you hold", () => {
    let s = fixture();
    s.units = [unit("e", 1, "field:0", 3)];
    s.players[0].hand = [rad(136)];
    s = settle(
      until(play(s, rad(136), { locationId: "field:0" }), "Banish Playful"),
    );
    expect(s.units).toHaveLength(0);
    expect(s.players[1].banished).toEqual(["ogn-049-298"]);
    saves(s);
    const lockUp = s.gears.find((g) => g.cardId === rad(136))!;
    s.fields[0].controller = 0;
    emitGameEvent(s, "hold", 0, s.fields[0].cardId, "field:0", "field:0");
    s = settle(s);
    expect(s.gears.some((g) => g.id === lockUp.id)).toBe(false);
    expect(s.players[1].banished).toHaveLength(0);
    const freed = s.units.find((u) => u.cardId === "ogn-049-298")!;
    expect(freed.owner).toBe(0);
    expect(freed.originalOwner ?? 1).toBe(1);
  });

  it("Chronobreak pays any amount of Power and replays that many of your units", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "field:0", 2), damage: 1, buff: 1 },
      unit("b", 0, "base:0", 2),
    ];
    s.fields[0].controller = 0;
    s.players[0].hand = [rad(140)];
    const power = s.players[0].power ?? 0;
    expect(
      actions(s)
        .filter((a) => a.cardId === rad(140))
        .map((a) => a.id),
    ).toEqual(["play|hand:0||", "play|hand:0|||x:1", "play|hand:0|||x:2"]);
    s = play(s, rad(140), { id: "|x:2" });
    expect(power - (s.players[0].power ?? 0)).toBe(2);
    s = settle(s);
    expect(s.units).toHaveLength(2);
    expect(s.units.some((u) => u.id === "a" || u.id === "b")).toBe(false);
    expect(s.units.every((u) => u.damage === 0 && !u.buff)).toBe(true);
    expect(s.players[0].banished).toHaveLength(0);
  });

  it("Iron Revenant banishes a trash unit to add Power only for units or gear", () => {
    let s = fixture();
    s.players[0].legendId = rad(143);
    s.players[0].power = 0;
    s.players[0].discard = ["ogn-049-298"];
    s.players[0].hand = [rad(40), rad(59)];
    s.units = [unit("e", 1, "base:1", 3)];
    expect(actions(s).some((a) => a.cardId === rad(40))).toBe(false);
    s = act(s, (a) => a.id.startsWith("radiance:revenant:"));
    expect(s.players[0].permanentPower).toBe(1);
    expect(s.players[0].banished).toEqual(["ogn-049-298"]);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    saves(s);
    // A spell cannot spend it.
    expect(actions(s).some((a) => a.cardId === rad(59))).toBe(false);
    s = settle(play(s, rad(40), { locationId: "base:0" }));
    expect(s.players[0].permanentPower).toBe(0);
    expect(s.units.some((u) => u.cardId === rad(40))).toBe(true);
  });

  it("Lady of Clockwork turns a friendly gear into a unit with Might equal to its cost", () => {
    let s = fixture();
    s.players[0].legendId = rad(145);
    const twirl = deployGear(s, rad(22), "base:0", 0, "tw");
    delete twirl.deployedAt;
    const anvil = deployGear(s, rad(12), "base:0", 0, "an");
    delete anvil.deployedAt;
    emitGameEvent(s, "main", 0, rad(145), "legend");
    const energy = s.players[0].energy;
    s = settle(until(until(s, "Use triggered"), "Whirling Twirligig becomes"));
    expect(s.players[0].energy).toBe(energy - 1);
    const animated = byId(s, "tw");
    expect(getMight(s, animated)).toBe(4);
    expect(s.gears.some((g) => g.id === "tw")).toBe(true);
    saves(s);
    expect(actions(s).some((a) => a.id === "move-start:tw:field:0")).toBe(true);
    // It stays a unit after the turn ends.
    s = settle(act(s, "end-turn"));
    expect(getMight(s, byId(s, "tw"))).toBe(4);
    // Choosing another gear ends the first one's unit status.
    emitGameEvent(s, "main", 0, rad(145), "legend");
    s = settle(until(until(s, "Use triggered"), "Runeblade Anvil becomes"));
    expect(s.units.map((u) => u.id)).toEqual(["an"]);
    expect(s.gears.map((g) => g.id).sort()).toEqual(["an", "tw"]);
  });

  it("The Ball draws or damages enemies here when played or moved", () => {
    let s = fixture();
    s.units = [unit("e1", 1, "field:0", 2), unit("e2", 1, "field:0", 2)];
    s.players[0].hand = [rad(146), rad(33)];
    s = settle(
      until(play(s, rad(146), { locationId: "field:0" }), "Deal 2 to enemy"),
    );
    expect(s.units).toHaveLength(0);
    const hand = s.players[0].hand.length;
    s = play(s, rad(33), { id: "|mode:0" });
    s = settle(until(until(s, "Move The Ball"), "Draw 1"));
    expect(s.players[0].hand.length).toBe(hand);
    expect(s.gears.find((g) => g.cardId === rad(146))!.deployedAt).toBe(
      "field:1",
    );
  });

  it("The Ball's damage is a gear ability, so Ziggs adds Bonus Damage", () => {
    let s = fixture();
    s.units = [
      { ...unit("ziggs", 0, "base:0", 5), cardId: rad(23) },
      unit("e", 1, "field:0", 3),
    ];
    s.players[0].hand = [rad(146)];
    s = settle(
      until(play(s, rad(146), { locationId: "field:0" }), "Deal 2 to enemy"),
    );
    expect(s.units.map((u) => u.id)).toEqual(["ziggs"]);
  });

  it("alternate printings share their source rules", () => {
    for (const [variant, source] of [
      ["rad-020a-167", rad(20)],
      ["rad-170-167", rad(143)],
      ["rad-171-167", rad(145)],
    ])
      expect(getCard(variant).name).toBe(getCard(source).name);
  });
});
