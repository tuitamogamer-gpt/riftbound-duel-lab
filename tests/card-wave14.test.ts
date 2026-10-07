import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  getLegalActions,
  getMight,
  getKeywords,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { sourceActions } from "../src/game/flow";
import { validState } from "../src/persistence";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import type { Effect, GameState, LocationId } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const options = (s: GameState) => getLegalActions(s, s.priorityPlayer);
function cast(
  s: GameState,
  id: string,
  find = (a: ReturnType<typeof options>[number]) =>
    a.category === "play" && a.cardId === id,
) {
  s.players[s.priorityPlayer].hand.push(id);
  return act(s, find);
}
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function run(
  s: GameState,
  effects: Effect[],
  sourceId?: string,
  locationId: LocationId = "base:0",
  targetId?: string,
) {
  s.stack.push({
    id: "test",
    player: 0,
    cardId: ogn(49),
    kind: "ability",
    effects,
    sourceId,
    locationId,
    targetId,
  });
  return resolve(s);
}
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave14:${key}`,
  ...rest,
});
const playPending = (s: GameState, id: string) =>
  act(s, (a) => a.category === "play" && a.cardId === id);

describe("wave14 play and equipment effects", () => {
  it("Ava offers only Hidden units at her current location", () => {
    let s = fixture();
    s.units = [{ ...unit("ava", 0, "field:0"), cardId: ogn(107) }];
    s.players[0].hand = [
      ogn(49),
      ogn(50),
      ogn(121),
      ...cards
        .filter((c) => c.type !== "Unit" && getScript(c.id)?.hidden)
        .map((c) => c.id),
    ];
    s = run(s, getScript(ogn(107))!.onAttack!, "ava", "field:0");
    expect(
      options(s)
        .filter((a) => a.cardId)
        .map((a) => a.cardId),
    ).toEqual([ogn(121)]);
    s = act(s, (a) => a.cardId === ogn(121));
    expect(
      options(s)
        .filter((a) => a.category === "play")
        .map((a) => a.locationId),
    ).toEqual(["field:0"]);
    s = playPending(s, ogn(121));
    expect(s.units.find((u) => u.cardId === ogn(121))?.playedFromHidden).toBe(
      false,
    );
  });
  it.each(["base:0", "field:1"] as const)(
    "Ava's here follows her current location at %s",
    (location) => {
      let s = fixture();
      s.units = [{ ...unit("ava", 0, location), cardId: ogn(107) }];
      s.players[0].hand = [ogn(121)];
      s = run(s, getScript(ogn(107))!.onAttack!, "ava", "field:0");
      s = act(s, (a) => a.cardId === ogn(121));
      expect(
        options(s)
          .filter((a) => a.category === "play")
          .map((a) => a.locationId),
      ).toEqual([location]);
    },
  );
  it("Ava leaving the board removes the here destination", () => {
    let s = fixture();
    s.players[0].hand = [ogn(121)];
    s = run(s, getScript(ogn(107))!.onAttack!, "ava", "field:0");
    s = act(s, (a) => a.cardId === ogn(121));
    expect(options(s).filter((a) => a.category === "play")).toHaveLength(0);
    s = act(s, "cancel-effect-play");
    expect(s.players[0].hand).toEqual([ogn(121)]);
  });
  it("Wild Claw plays first, then offers a separately counterable optional Empower trigger", () => {
    let s = fixture();
    s.players[0].deck = [ogn(49), ogn(50)];
    s = resolve(cast(s, ven(89)));
    s = act(s, (a) => a.cardId === ogn(49));
    s = playPending(s, ogn(49));
    expect(s.units[0].empowered).not.toBe(true);
    s = act(s, (a) => !a.id.includes("skip"));
    expect(s.stack.at(-1)?.kind).toBe("trigger");
    s = chain(s);
    expect(s.units[0].empowered).toBe(true);
  });
  it("Matriarch has a normal-cost Empower and a targeted free base revival", () => {
    let s = fixture();
    s.units = [{ ...unit("matriarch"), cardId: ven(104) }];
    s.players[0].discard = [ogn(52), ogn(49)];
    s = act(s, (a) => a.sourceId === "matriarch" && a.category === "ability");
    expect(s.players[0].energy).toBe(28);
    expect(s.players[0].power).toBe(29);
    s = chain(s);
    expect(s.units.find((u) => u.cardId === ogn(52))?.location).toBe("base:0");
    expect(s.players[0].discard).toContain(ogn(49));
    expect(s.units[0].empowered).toBe(true);
    expect(
      options(s).filter(
        (a) => a.sourceId === "matriarch" && a.category === "ability",
      ),
    ).toHaveLength(0);
  });
  it("Jayce kills the selected gear and grants one optional hand play for the turn", () => {
    let s = fixture();
    addGear(s, 33, "old");
    s = cast(s, sfd(84));
    s = act(s, "choose-board:old");
    s = act(s, "choose-board:done");
    s = chain(s);
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].gearPlayPermissions).toHaveLength(1);
    s.players[0].hand = [sfd(33), ogn(160)];
    const free = options(s).filter((a) => a.sourceId?.includes(":jayce:"));
    expect(free).toHaveLength(1);
    expect(sourceActions(s, options(s), "hand:0")).toContainEqual(free[0]);
    expect(sourceActions(s, options(s), "hand:1")).not.toContainEqual(free[0]);
    const energy = s.players[0].energy;
    s = act(s, free[0].id);
    expect(s.players[0].energy).toBe(energy);
    expect(s.players[0].gearPlayPermissions).toHaveLength(0);
  });
  it("Jayce may decline, and cannot use a permission on an oversized gear", () => {
    let s = fixture();
    addGear(s, 33, "old");
    s = cast(s, sfd(84));
    s = act(s, "choose-board:done");
    s = chain(s);
    expect(s.gears).toHaveLength(1);
    expect(s.players[0].gearPlayPermissions ?? []).toHaveLength(0);
    s.players[0].gearPlayPermissions = [{ id: "test", turn: s.turn }];
    s.players[0].hand = [ogn(160)];
    expect(options(s).some((a) => a.sourceId?.includes(":jayce:"))).toBe(false);
  });
  it("Bard exhausts the legend before play and moves the chosen group to an open field", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("enemy", 1, "field:1")];
    s = cast(
      s,
      sfd(79),
      (a) => a.cardId === sfd(79) && a.additionalCostPaid === true,
    );
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    s = act(s, "choose-board:ally");
    expect(
      options(s)
        .filter((a) => a.locationId)
        .map((a) => a.locationId),
    ).toEqual(["field:0"]);
    s = act(s, "choose-board:destination:field:0");
    s = act(s, "choose-board:done");
    s = resolve(s);
    expect(s.units.find((u) => u.id === "ally")?.location).toBe("field:0");
  });
  it("Bard cannot exhaust an already exhausted legend", () => {
    let s = fixture();
    s.players[0].legendUsedTurn = s.turn;
    s.players[0].hand = [sfd(79)];
    expect(options(s).some((a) => a.additionalCostPaid)).toBe(false);
  });
  it("Azir swaps both locations and may transfer Equipment once per turn", () => {
    let s = fixture();
    s.units = [
      { ...unit("azir"), cardId: sfd(50) },
      unit("ally", 0, "field:0"),
    ];
    addGear(s, 33, "gear", "ally");
    s = act(s, (a) => a.sourceId === "azir" && a.targetId === "ally~gear");
    expect(s.stack.at(-1)?.targetId).toBe("ally~gear");
    s = resolve(s);
    expect(s.units.map((u) => u.location)).toEqual(["field:0", "base:0"]);
    expect(s.gears[0].attachedTo).toBe("azir");
    expect(
      options(s).filter(
        (a) => a.sourceId === "azir" && a.category === "ability",
      ),
    ).toHaveLength(0);
  });
  it("Azir does not take an Equipment moved away from the chosen unit in response", () => {
    let s = fixture();
    s.units = [
      { ...unit("azir"), cardId: sfd(50) },
      unit("ally", 0, "field:0"),
      unit("other"),
    ];
    addGear(s, 33, "gear", "ally");
    s = act(s, (a) => a.sourceId === "azir" && a.targetId === "ally~gear");
    s.gears[0].attachedTo = "other";
    s.units[1].gear = [];
    s.units[2].gear = ["gear"];
    s = chain(s);
    expect(s.units.slice(0, 2).map((u) => u.location)).toEqual([
      "field:0",
      "base:0",
    ]);
    expect(s.gears[0].attachedTo).toBe("other");
  });
  it("Kato copies current Might and keyword values, preserving the recipient's own keywords", () => {
    let s = fixture();
    s.units = [
      {
        ...unit("kato", 0, "field:0", 4),
        cardId: sfd(112),
        buff: 1,
        temporaryKeywords: ["Ganking", "Assault 2"],
      },
      unit("ally", 0, "base:0", 2),
    ];
    s = run(s, getScript(sfd(112))!.onMove!, "kato", "field:0", "ally");
    expect(getMight(s, s.units[1])).toBe(7);
    expect(getKeywords(s, s.units[1])).toEqual(
      expect.arrayContaining(["Deflect", "Ganking", "Assault 2"]),
    );
  });
  it.each(["kill", "bounce"] as const)(
    "Kato has no current Might or keywords after a response uses %s",
    (type) => {
      let s = fixture();
      s.units = [
        {
          ...unit("kato", 0, "base:0", 4),
          cardId: sfd(112),
          temporaryKeywords: ["Ganking"],
        },
        unit("ally", 0, "base:0", 2),
      ];
      s = act(s, "move-start:kato:field:0");
      s = act(s, "move-confirm");
      s = act(s, (a) => a.targetId === "ally");
      s.units.find((u) => u.id === "kato")!.temporaryMight = 3;
      s = run(s, [{ type, chosenTargetId: "kato" }]);
      expect(s.units.some((u) => u.id === "kato")).toBe(false);
      s = chain(s);
      const ally = s.units.find((u) => u.id === "ally")!;
      expect(getMight(s, ally)).toBe(2);
      expect(getKeywords(s, ally)).not.toContain("Ganking");
    },
  );
  it("Arise counts Equipment and lets two distinct new tokens ready", () => {
    let s = fixture();
    addGear(s, 33, "a");
    addGear(s, 33, "b");
    addGear(s, 33, "c");
    s.gears.push({ id: "seal", cardId: ogn(149), owner: 0, ready: true });
    s = chain(cast(s, sfd(198)));
    expect(s.units).toHaveLength(3);
    expect(s.units.filter((u) => u.ready)).toHaveLength(2);
  });
  it("Forge grants and removes the legend attachment ability with control", () => {
    let s = fixture();
    s.fields[0] = { id: "field:0", cardId: sfd(208), controller: 0 };
    s.units = [unit("ally"), unit("enemy", 1, "field:1")];
    addGear(s, 33, "own");
    addGear(s, 33, "other", undefined, 1);
    const forge = options(s).filter((a) => a.label.includes("Forge"));
    expect(forge).toHaveLength(1);
    expect(forge[0].targetId).toBe("ally~own");
    s = chain(act(s, forge[0].id));
    expect(s.gears[0].attachedTo).toBe("ally");
    s.players[0].legendUsedTurn = -1;
    s.fields[0].controller = null;
    expect(options(s).some((a) => a.label.includes("Forge"))).toBe(false);
  });
  it("Aphelios marks each mode at finalization and cannot reuse it that turn", () => {
    let s = fixture();
    s.players[0].runes = [
      { id: "r1", domain: "Body", ready: false },
      { id: "r2", domain: "Body", ready: false },
    ];
    s.units = [{ ...unit("aphelios"), cardId: sfd(49) }];
    addGear(s, 33, "gear");
    s = run(s, [{ type: "equip" }], "gear", "base:0", "aphelios");
    s = act(s, (a) => a.label.startsWith("Channel"));
    expect(s.units[0].usedAbilities).toContain("aphelios:1");
    s = chain(s);
    expect(s.players[0].runes).toHaveLength(3);
    s = run(s, [{ type: "equip" }], "gear", "base:0", "aphelios");
    expect(s.pendingChoice).toBeNull();
    expect(s.units[0].usedAbilities).toEqual(["aphelios:1"]);
    addGear(s, 34, "second-gear");
    s = run(s, [{ type: "equip" }], "second-gear", "base:0", "aphelios");
    expect(options(s).some((a) => a.label.startsWith("Channel"))).toBe(false);
    s = act(s, (a) => a.label.startsWith("Buff"));
    s = chain(s);
    expect(s.units[0].buff).toBe(1);
  });
  it("Ezreal counts enemy choices from spells and unit abilities but excludes friendly and gear abilities", () => {
    let s = fixture();
    s.players[0].legendId = sfd(199);
    s.units = [unit("enemy", 1, "field:0"), unit("ally")];
    s = chain(
      cast(s, ogn(50), (a) => a.category === "play" && a.targetId === "enemy"),
    );
    expect(options(s).some((a) => a.label.includes("choosing enemies"))).toBe(
      false,
    );
    s = chain(
      cast(s, ogn(50), (a) => a.category === "play" && a.targetId === "ally"),
    );
    expect(s.players[0].enemyChoices?.count).toBe(1);
    s = chain(
      cast(s, ogn(50), (a) => a.category === "play" && a.targetId === "enemy"),
    );
    const before = s.players[0].hand.length;
    s = chain(act(s, (a) => a.label.includes("choosing enemies")));
    expect(s.players[0].hand.length).toBe(before + 1);
  });
  it("Rift Herald draws the revealed unit, recycles the rest, and adds Undertitan's reveal Energy", () => {
    let s = fixture();
    s.players[0].deck = [ogn(50), sfd(175), ogn(52), ogn(49)];
    s = run(s, getScript(unl(179))!.onMove!, undefined, "field:0");
    s = act(s, (a) => a.label.includes("Undertitan"));
    expect(s.players[0].hand).toEqual([sfd(175)]);
    expect(s.players[0].deck[0]).toBe(ogn(49));
    expect(s.players[0].energy).toBe(32);
  });
  it("Rift Herald's death allows a hand unit at base, paying its Power", () => {
    let s = fixture();
    s.units = [{ ...unit("herald"), cardId: unl(179) }];
    s.players[0].hand = [ogn(11)];
    s = run(s, [{ type: "kill", chosenTargetId: "herald" }]);
    s = chain(s);
    expect(s.units[0].cardId).toBe(ogn(11));
    expect(s.players[0].energy).toBe(30);
    expect(s.players[0].power).toBe(29);
  });
  it("Undertitan gives other units temporary Might and generates Energy when revealed", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 2)];
    s = chain(cast(s, sfd(175)));
    expect(getMight(s, s.units[0])).toBe(4);
    expect(getMight(s, s.units[1])).toBe(5);
    s.players[0].deck = [sfd(175), ogn(49)];
    const energy = s.players[0].energy;
    s = resolve(cast(s, sfd(188)));
    expect(s.players[0].energy).toBe(energy);
    s = act(s, "choose-custom:play-card:skip");
    expect(s.players[0].hand).toContain(sfd(175));
  });
  it("new turn counters and grants survive save/load with validated types", () => {
    const s = fixture();
    s.players[0].gearPlayPermissions = [{ id: "jayce:5", turn: s.turn }];
    s.players[0].enemyChoices = { turn: s.turn, count: 2 };
    s.units = [{ ...unit("marked"), recallOnConquerTurn: s.turn }];
    expect(validState(deserializeGame(serializeGame(s)))).toBe(true);
    const bad = structuredClone(s) as any;
    bad.players[0].enemyChoices.count = -1;
    expect(validState(bad)).toBe(false);
  });
});
