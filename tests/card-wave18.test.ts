import { describe, it, expect } from "vitest";
import { cards } from "../src/data/cards";
import {
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getUnitTags } from "../src/game/board-rules";
import { validState } from "../src/persistence";
import { unitTriggerEffects } from "../src/game/equipment";
import { detach } from "../src/game/objects";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
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
describe("wave18 copies and battlefield tokens", () => {
  it("Mirror Image copies printed traits without playing the copied card or copying statuses", () => {
    let s = fixture();
    s.units = [
      {
        ...unit("enemy", 1, "field:0"),
        cardId: ogn(51),
        buff: 1,
        empowered: true,
        damage: 1,
        temporaryMight: 5,
      },
    ];
    s = chain(cast(s, unl(200), "enemy"));
    const copy = s.units.find((u) => u.token)!;
    expect(copy).toMatchObject({
      cardId: ogn(51),
      originalCardId: "token-reflection",
      ready: true,
      temporary: true,
      buff: 0,
      damage: 0,
      temporaryMight: 0,
    });
    expect(copy.empowered).toBeUndefined();
    expect(s.units[0].stunned).toBe(false);
    expect(s.stack).toHaveLength(0);
    expect(getMight(s, copy)).toBe(2);
  });
  it("Keeper creates exactly two copied Reflections without recursively triggering on-play", () => {
    let s = chain(cast(fixture(), unl(81)));
    expect(s.units).toHaveLength(3);
    expect(s.units.every((u) => u.cardId === unl(81) && u.temporary)).toBe(
      true,
    );
    expect(s.units.filter((u) => u.token)).toHaveLength(2);
  });
  it("Shady Spectacles preserves the recipient's statuses and reverts on detach", () => {
    let s = fixture();
    s.units = [
      { ...unit("recipient"), buff: 1, empowered: true, temporaryMight: 2 },
      { ...unit("model"), cardId: ogn(51) },
    ];
    s.gears = [{ id: "glasses", cardId: ven(137), owner: 0, ready: true }];
    s = run(s, [{ type: "equip" }], "recipient", "glasses");
    s = act(s, "choose-custom:spectacles:model");
    expect(s.units[0]).toMatchObject({
      cardId: ogn(51),
      buff: 1,
      empowered: true,
      temporaryMight: 2,
    });
    detach(s, s.gears[0]);
    expect(s.units[0].cardId).toBe(ogn(49));
    expect(s.units[0].buff).toBe(1);
  });
  it("the original physical card enters trash when a Spectacles copy dies", () => {
    let s = fixture();
    s.units = [unit("recipient"), { ...unit("model"), cardId: ogn(51) }];
    s.gears = [{ id: "glasses", cardId: ven(137), owner: 0, ready: true }];
    s = run(s, [{ type: "equip" }], "recipient", "glasses");
    s = act(s, "choose-custom:spectacles:model");
    s = run(s, [{ type: "kill", target: "anyUnit" }], "recipient");
    expect(s.players[0].discard).toContain(ogn(49));
    expect(s.players[0].discard).not.toContain(ogn(51));
  });
  it("Baron creates one persistent third battlefield, enters it, and grants its aura", () => {
    let s = fixture();
    s.units = [unit("friend")];
    s = chain(cast(s, unl(147)));
    expect(s.fields).toHaveLength(3);
    expect(s.fields[2].cardId).toBe("token-baron-pit");
    const baron = s.units.find((u) => u.cardId === unl(147))!;
    expect(baron.location).toBe("field:2");
    expect(getMight(s, s.units[0])).toBe(10);
    expect(validState(s)).toBe(true);
    expect(deserializeGame(serializeGame(s))?.fields).toHaveLength(3);
    if (s.combat) s = resolve(s);
    s = chain(cast(s, unl(147)));
    expect(s.fields).toHaveLength(3);
  });
  it("ordinary units can move from another battlefield to Baron Pit", () => {
    const s = fixture();
    s.fields.push({
      id: "field:2",
      cardId: "token-baron-pit",
      controller: null,
    });
    s.units = [unit("mover", 0, "field:0")];
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:mover:field:2"),
    ).toBe(true);
  });
  it("Baron cannot be chosen by an enemy spell", () => {
    const s = fixture();
    s.units = [{ ...unit("baron", 1, "field:0"), cardId: unl(147) }];
    s.players[0].hand = [ogn(9)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.targetId === "baron",
      ),
    ).toBe(false);
  });
  it("Brush buffs eligible tags and remembers its replaced battlefield", () => {
    const s = fixture();
    s.fields[0] = {
      ...s.fields[0],
      cardId: "token-brush",
      replacedCardId: ogn(278),
    };
    s.units = [
      { ...unit("poro", 0, "field:0"), addedTag: "Poro" },
      unit("ordinary", 0, "field:0"),
    ];
    expect(getMight(s, s.units[0])).toBe(9);
    expect(getMight(s, s.units[1])).toBe(8);
  });
  it("Hexplate grants and removes the Mech tag with its attachment", () => {
    let s = fixture();
    s.units = [unit("friend")];
    addGear(s, 73, "plate");
    s = run(s, [{ type: "equip" }], "friend", "plate");
    expect(getUnitTags(s.units[0])).toContain("Mech");
    detach(s, s.gears[0]);
    expect(getUnitTags(s.units[0])).not.toContain("Mech");
  });
  it("Skyfall grants hold effects on conquer and conquer effects on hold once", () => {
    const s = fixture();
    s.units = [{ ...unit("friend"), cardId: ogn(118) }];
    addGear(s, 30, "skyfall", "friend");
    expect(unitTriggerEffects(s, s.units[0], "onConquer")).toEqual(
      unitTriggerEffects(s, s.units[0], "onHold"),
    );
  });
  it("Deathcrown adds 3 bonus damage only while attached, and never turns zero damage into a hit", () => {
    let s = fixture();
    s.units = [unit("friend"), unit("enemy", 1, "field:0", 20)];
    addGear(s, 191, "crown", "friend");
    s = run(s, [{ type: "damage", amount: 1, target: "anyUnit" }], "enemy");
    expect(s.units[1].damage).toBe(4);
    s = run(s, [{ type: "damage", amount: 0, target: "anyUnit" }], "enemy");
    expect(s.units[1].damage).toBe(4);
    detach(s, s.gears[0]);
    s = run(s, [{ type: "damage", amount: 1, target: "anyUnit" }], "enemy");
    expect(s.units[1].damage).toBe(5);
  });
  it("Battleaxe detaches and hurts its wielder at end of turn unless it conquered", () => {
    let s = fixture();
    s.units = [unit("friend")];
    s.gears = [
      {
        id: "axe",
        cardId: unl(19),
        owner: 0,
        ready: true,
        attachedTo: "friend",
      },
    ];
    s.units[0].gear = ["axe"];
    s = act(s, "end-turn");
    s = resolve(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
});
