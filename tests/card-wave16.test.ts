import { describe, it, expect } from "vitest";
import { cards } from "../src/data/cards";
import { getLegalActions, getGameView } from "../src/game/engine";
import { physicalOwner, control } from "../src/game/objects";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import { w16 } from "../src/game/card-wave16";
import type { Effect, GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
function cast(s: GameState, cardId: string, targetId?: string, paid = false) {
  s.players[s.priorityPlayer].hand.push(cardId);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (!targetId || a.targetId === targetId) &&
      Boolean(a.additionalCostPaid) === paid,
  );
}
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function run(
  s: GameState,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
) {
  s.stack.push({
    id: "test",
    player: 0,
    cardId: ogn(49),
    kind: "ability",
    effects,
    targetId,
    sourceId,
  });
  return resolve(s);
}
describe("wave16 ownership and control", () => {
  it("Possession transfers control but a bounced unit returns to its owner", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0")];
    s = chain(cast(s, ogn(203), "enemy"));
    expect(s.units[0]).toMatchObject({
      owner: 0,
      originalOwner: 1,
      location: "base:0",
    });
    s = run(s, [{ type: "bounce", target: "anyUnit" }], "enemy");
    expect(s.players[1].hand).toContain(ogn(49));
    expect(s.players[0].hand).not.toContain(ogn(49));
  });
  it("a stolen unit dies into its owner's trash and keeps attachments' controllers", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0")];
    addGear(s, 33, "equipment", "enemy", 1);
    s = chain(cast(s, ogn(203), "enemy"));
    expect(s.gears[0].owner).toBe(1);
    expect(s.gears[0].attachedTo).toBe("enemy");
    s = run(s, [{ type: "kill", target: "anyUnit" }], "enemy");
    expect(s.players[1].discard).toContain(ogn(49));
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("Hostile Takeover readies then restores and recalls the unit at end of turn", () => {
    let s = fixture();
    s.units = [{ ...unit("enemy", 1, "field:0"), ready: false }];
    s = chain(cast(s, sfd(202), "enemy"));
    expect(s.units[0]).toMatchObject({ owner: 0, ready: true });
    // Close the noncombat showdown before ending the turn.
    if (s.combat) s = resolve(s);
    s = chain(act(s, "end-turn"));
    expect(s.units[0]).toMatchObject({ owner: 1, location: "base:1" });
  });
  it("Conscription's XP payment expands legal targets before it is played", () => {
    let s = fixture();
    s.units = [unit("big", 1, "field:0", 7), unit("small", 1, "field:1", 2)];
    s.players[0].hand = [unl(140)];
    s.players[0].xp = 5;
    expect(
      getLegalActions(s, 0).some(
        (a) =>
          a.targetId === "big" &&
          !a.additionalCostPaid &&
          a.category === "play",
      ),
    ).toBe(false);
    s = act(s, (a) => a.targetId === "big" && a.additionalCostPaid === true);
    expect(s.players[0].xp).toBe(0);
    s = chain(s);
    expect(s.units.find((u) => u.id === "big")).toMatchObject({
      owner: 0,
      location: "base:0",
      ready: false,
    });
  });
  it("Akshan returns stolen equipment when he leaves the board", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0")];
    addGear(s, 33, "equipment", "enemy", 1);
    s = cast(s, sfd(109), undefined, true);
    s = chain(s);
    const akshan = s.units.find((u) => u.cardId === sfd(109))!;
    expect(s.gears[0]).toMatchObject({ owner: 0, attachedTo: akshan.id });
    s = run(s, [{ type: "bounce", target: "anyUnit" }], akshan.id);
    expect(s.gears[0]).toMatchObject({ owner: 1 });
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("Blind Fury plays an opponent's revealed card and preserves its ownership", () => {
    let s = fixture();
    s.players[1].deck = [ogn(49), ogn(52)];
    s = chain(cast(s, ogn(25)));
    expect(s.units[0]).toMatchObject({
      owner: 0,
      originalOwner: 1,
      cardId: ogn(49),
    });
    expect(s.players[1].deck).toEqual([ogn(52)]);
    s = run(s, [{ type: "kill", target: "anyUnit" }], s.units[0].id);
    expect(s.players[1].discard).toContain(ogn(49));
  });
  it("Mystic Reversal can keep an existing target and sends the spell to its owner's trash", () => {
    let s = fixture();
    s.units = [unit("target", 0, "field:0", 8)];
    s.stack = [
      {
        id: "enemy-spell",
        cardId: ogn(9),
        player: 1,
        kind: "spell",
        targetId: "target",
        effects: [{ type: "damage", amount: 3, target: "unitAtBattlefield" }],
      },
    ];
    s = resolve(cast(s, ogn(80), "enemy-spell"));
    expect(s.stack[0]).toMatchObject({ player: 0, originalOwner: 1 });
    s = act(s, "choose-custom:retarget:keep");
    s = chain(s);
    expect(s.units[0].damage).toBe(3);
    expect(s.players[1].discard).toContain(ogn(9));
  });
  it("retargeting preserves a Hidden spell's location restriction", () => {
    let s = fixture();
    s.units = [unit("here", 1, "field:0"), unit("elsewhere", 1, "field:1")];
    s.stack = [
      {
        id: "spell",
        cardId: ogn(9),
        player: 1,
        kind: "spell",
        targetId: "here",
        fromHidden: true,
        locationId: "field:0",
        effects: [
          {
            type: "damage",
            amount: 3,
            target: "unitAtBattlefield",
            targetLocations: ["field:0"],
          },
        ],
      },
    ];
    s = run(s, [w16("take-spell", { target: "spell" })], "spell");
    expect(getLegalActions(s, 0).some((a) => a.id.includes("elsewhere"))).toBe(
      false,
    );
  });
  it("Rebuttal declines the payment and counters", () => {
    let s = fixture();
    s.stack = [
      { id: "spell", cardId: ogn(9), player: 1, kind: "spell", effects: [] },
    ];
    s = chain(cast(s, ven(152), "spell"));
    expect(s.players[1].discard).toContain(ogn(9));
  });
  it("Ashe's banishment returns on hold even after Ashe leaves", () => {
    let s = fixture();
    s.players[1].hand = [ogn(49), ogn(52)];
    s = chain(cast(s, unl(169)));
    expect(s.heldBanishments).toHaveLength(1);
    s.units = [];
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.fields[0].controller = 1;
    s.units = [unit("holder", 1, "field:0")];
    // Event is dispatched by the regular turn opening.
    s = chain(act(s, "end-turn"));
    s = chain(act(s, "end-turn"));
    expect(s.players[1].hand).toContain(ogn(49));
    expect(s.heldBanishments).toEqual([]);
  });
  it("Bone Skewer exposes choices to the chooser then makes the opponent play and stuns reflexively", () => {
    let s = fixture();
    s.players[1].hand = [ogn(49)];
    s = resolve(cast(s, unl(139), "field:0"));
    expect(s.pendingChoice?.player).toBe(0);
    s = act(s, (a) => a.cardId === ogn(49));
    expect(s.pendingChoice?.player).toBe(1);
    s = act(s, (a) => a.category === "play");
    expect(s.units[0]).toMatchObject({ owner: 1, location: "field:0" });
    expect(s.units[0].stunned).toBe(false);
    s = chain(s);
    expect(s.units[0].stunned).toBe(true);
  });
  it("Kharox can play an enemy trash unit, keeping its original owner", () => {
    let s = fixture();
    s.units = [{ ...unit("kharox"), cardId: ven(114) }];
    s.players[1].deck = [ogn(49), ogn(52), ogn(13)];
    s = act(s, (a) => a.sourceId === "kharox" && a.label.includes("Empower"));
    s = chain(s);
    expect(s.players[1].deck).toHaveLength(0);
    expect(s.units.filter((u) => u.originalOwner === 1)).toHaveLength(1);
  });
  it("Glowstone has Empower and a disempower cost before responses", () => {
    let s = fixture();
    s.gears = [
      { id: "stone", cardId: ven(133), owner: 0, ready: true, empowered: true },
    ];
    s = act(s, (a) => a.sourceId === "stone" && a.label.includes("Give"));
    expect(s.gears[0]).toMatchObject({ empowered: false, ready: false });
    s = resolve(s);
    s = act(s, "choose-custom:glowstone:1");
    expect(s.gears[0]).toMatchObject({ owner: 1, originalOwner: 0 });
    expect(physicalOwner(s.gears[0])).toBe(0);
  });
});
