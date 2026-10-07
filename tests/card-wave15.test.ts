import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { getUnitTags } from "../src/game/board-rules";
import { validState } from "../src/persistence";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import type { Effect, GameState, LocationId } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const options = (s: GameState) => getLegalActions(s, s.priorityPlayer);
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function cast(
  s: GameState,
  id: string,
  find = (a: ReturnType<typeof options>[number]) =>
    a.category === "play" && a.cardId === id,
) {
  s.players[s.priorityPlayer].hand.push(id);
  return act(s, find);
}
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
  custom: `wave15:${key}`,
  ...rest,
});
function move(s: GameState, id: string, to: LocationId = "field:0") {
  s = act(s, (a) => a.id === `move-start:${id}:${to}`);
  return act(s, (a) => a.id.startsWith("move-confirm"));
}

describe("wave15 complete effects", () => {
  it("Time Warp inserts a complete extra turn and banishes only after resolution", () => {
    let s = chain(cast(fixture(), ogn(122)));
    expect(s.extraTurns).toEqual([0]);
    expect(s.players[0].banished).toContain(ogn(122));
    s = chain(act(s, "end-turn"));
    expect(s.currentPlayer).toBe(0);
    expect(s.extraTurns).toEqual([]);
    s = chain(act(s, "end-turn"));
    expect(s.currentPlayer).toBe(1);
  });
  it("a countered Time Warp gives no extra turn", () => {
    let s = cast(fixture(), ogn(122));
    s = act(s, "pass");
    s = cast(s, ogn(64));
    s = chain(s);
    expect(s.extraTurns ?? []).toEqual([]);
    expect(s.players[0].discard).toContain(ogn(122));
  });
  it("Promising Future lets both players select privately and finalizes the opponent first", () => {
    let s = fixture();
    s.players[0].deck = [ogn(49), ogn(52)];
    s.players[1].deck = [ogn(11), ogn(52)];
    s = resolve(cast(s, ogn(115)));
    s = act(s, (a) => a.cardId === ogn(49));
    expect(s.priorityPlayer).toBe(1);
    s = act(s, (a) => a.cardId === ogn(11));
    expect(s.priorityPlayer).toBe(1);
    expect(s.players[0].discard).toContain(ogn(115));
    s = act(s, (a) => a.category === "play");
    expect(s.units[0]).toMatchObject({ owner: 1, cardId: ogn(11) });
    expect(s.priorityPlayer).toBe(0);
    s = act(s, (a) => a.category === "play");
    expect(s.units[1]).toMatchObject({ owner: 0, cardId: ogn(49) });
  });
  it.each([0, 1, 4])(
    "Bullet Time pays %i Power during resolution, without choosing enemy units",
    (amount) => {
      let s = fixture();
      s.units = [
        { ...unit("enemy", 1, "field:0", 10), cardId: ogn(13) },
        unit("elsewhere", 1, "field:1", 10),
        unit("friend", 0, "field:0", 10),
      ];
      s.players[0].power = amount;
      s = resolve(
        cast(
          s,
          ogn(268),
          (a) => a.category === "play" && a.targetId === "field:0",
        ),
      );
      expect(s.players[0].power).toBe(amount);
      s = act(s, `choose-custom:wave15:bullet:${amount}`);
      expect(s.players[0].power).toBe(0);
      expect(s.units.map((u) => u.damage)).toEqual([amount, 0, 0]);
    },
  );
  it("Bullet Time cannot spend restricted spell Power as a resolving cost", () => {
    let s = fixture();
    s.players[0].power = 0;
    s.players[0].spellPower = 10;
    s = resolve(cast(s, ogn(268)));
    expect(options(s).map((a) => a.id)).toEqual([
      "choose-custom:wave15:bullet:0",
    ]);
  });
  it("Super Mega Death Rocket pays discard before its return trigger can be answered", () => {
    let s = fixture();
    s.players[0].discard = [ogn(252)];
    s.players[0].hand = [ogn(52)];
    s.units = [unit("attacker")];
    s = move(s, "attacker");
    s = resolve(s);
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = act(s, (a) => !a.id.includes("skip"));
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].discard).toContain(ogn(52));
    s = chain(s);
    expect(s.players[0].hand).toEqual([ogn(252)]);
  });
  it("Stealthy Pursuer can decline or follow a friendly unit from its own location", () => {
    let s = fixture();
    s.units = [unit("mover"), { ...unit("pursuer"), cardId: ogn(177) }];
    s = move(s, "mover");
    expect(s.pendingChoice?.cardId).toBe(ogn(177));
    s = act(s, (a) => !a.id.includes("skip"));
    s = chain(s);
    expect(s.units.find((u) => u.id === "pursuer")?.location).toBe("field:0");
  });
  it.each(["unit", "gear", "hidden"])(
    "Pack of Wonders returns a selected %s, detaches Equipment, and excludes itself",
    (kind) => {
      let s = fixture();
      s.units = [unit("ally")];
      s.gears = [{ id: "pack", cardId: ogn(181), owner: 0, ready: true }];
      addGear(s, 33, "gear", "ally");
      s.hidden = [
        {
          id: "hidden",
          cardId: ogn(121),
          owner: 0,
          location: "field:0",
          hiddenTurn: 0,
        },
      ];
      s = act(s, (a) => a.sourceId === "pack");
      expect(options(s).some((a) => a.targetId === "pack")).toBe(false);
      s = act(s, `choose-board:${kind === "unit" ? "ally" : kind}`);
      s = act(s, "choose-board:done");
      s = chain(s);
      expect(s.players[0].hand).toContain(
        kind === "unit" ? ogn(49) : kind === "gear" ? sfd(33) : ogn(121),
      );
      if (kind === "unit")
        expect(
          s.gears.find((g) => g.id === "gear")?.attachedTo,
        ).toBeUndefined();
    },
  );
  it.each(["Mind", "Order", "Fury", "Body"])(
    "Twisted Fate reveals and recycles a %s rune, then creates the correct reflexive trigger",
    (domain) => {
      let s = fixture();
      s.players[0].runeDeck = [domain, "Calm"];
      s.units = [
        { ...unit("tf", 0, "field:0"), cardId: ogn(200) },
        unit("e1", 1, "field:0", 8),
        unit("e2", 1, "field:0", 8),
      ];
      s = run(s, getScript(ogn(200))!.onAttack!, "tf", "field:0");
      s = chain(s);
      expect(s.players[0].runeDeck).toEqual(["Calm", domain]);
      if (domain === "Mind") expect(s.players[0].hand).toHaveLength(1);
      if (domain === "Order")
        expect(s.units.filter((u) => u.stunned)).toHaveLength(1);
      if (domain === "Fury")
        expect(
          s.units
            .filter((u) => u.owner === 1)
            .map((u) => u.damage)
            .sort(),
        ).toEqual([1, 2]);
    },
  );
  it("Baited Hook snapshots Might, kills its target during resolution, and recycles unchosen cards", () => {
    let s = fixture();
    s.units = [unit("bait", 0, "base:0", 1)];
    s.gears = [{ id: "hook", cardId: ogn(242), owner: 0, ready: true }];
    s.players[0].deck = [ogn(49), ogn(52)];
    s = act(s, (a) => a.sourceId === "hook");
    expect(s.units).toHaveLength(1);
    s = resolve(s);
    expect(s.units).toHaveLength(0);
    expect(
      options(s)
        .filter((a) => a.cardId)
        .map((a) => a.cardId),
    ).toEqual([ogn(52)]);
    s = chain(s);
    expect(s.units[0].cardId).toBe(ogn(52));
  });
  it("Dragon's Rage moves an enemy to base and creates a separately targeted duel", () => {
    let s = fixture();
    s.units = [unit("first", 1, "field:0", 2), unit("second", 1, "base:1", 3)];
    s.preventEffectDamageTurn = s.turn;
    s = resolve(
      cast(
        s,
        ogn(258),
        (a) => a.category === "play" && a.targetId === "first~base:1",
      ),
    );
    expect(s.units[0].location).toBe("base:1");
    s = chain(s);
    expect(s.units.some((u) => u.id === "first")).toBe(false);
    expect(s.units.find((u) => u.id === "second")?.damage).toBe(2);
  });
  it("Baited Hook still looks and recycles when its chosen unit has left play", () => {
    let s = fixture();
    s.units = [unit("bait")];
    s.gears = [{ id: "hook", cardId: ogn(242), owner: 0, ready: true }];
    s.players[0].deck = [ogn(10), ogn(11), ogn(12), ogn(13), ogn(52), ogn(49)];
    s = act(s, (a) => a.sourceId === "hook");
    s.units = [];
    s = resolve(s);
    expect(options(s).map((a) => a.id)).toEqual([
      "choose-custom:play-card:skip",
    ]);
    s = chain(s);
    expect(s.players[0].deck[0]).toBe(ogn(49));
    expect(s.players[0].deck).toHaveLength(6);
    expect(s.pendingPlays ?? []).toHaveLength(0);
  });
  it("Zenith Blade declares both units and moves its optional ally only if the enemy is still at a battlefield", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0"), unit("ally")];
    s = resolve(
      cast(
        s,
        ogn(262),
        (a) => a.category === "play" && a.targetId === "enemy~ally",
      ),
    );
    expect(s.units[0].stunned).toBe(true);
    expect(s.units[1].location).toBe("field:0");
    s = fixture();
    s.units = [unit("enemy", 1, "field:0"), unit("ally")];
    s = cast(
      s,
      ogn(262),
      (a) => a.category === "play" && a.targetId === "enemy~ally",
    );
    s.units[0].location = "base:1";
    s = chain(s);
    expect(s.units[1].location).toBe("base:0");
    expect(s.units[0].stunned).toBe(false);
  });
  it("Shuriken Flip may omit its damage target, moves its ally, and banishes after Flow", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("enemy", 1, "field:0")];
    s.players[0].discard = [ven(140)];
    s = act(
      s,
      (a) => a.category === "play" && a.targetId === "ally~field:1~enemy",
    );
    s = resolve(s);
    expect(s.units[1].damage).toBe(2);
    expect(s.units[0].location).toBe("field:1");
    expect(s.players[0].banished).toContain(ven(140));
  });
  it("Malzahar exhausts and sacrifices as an immediate resource ability, including sacrificing himself", () => {
    let s = fixture();
    s.units = [{ ...unit("malzahar"), cardId: ogn(113) }];
    s = act(s, (a) => a.category === "resource" && a.sourceId === "malzahar");
    expect(s.units).toHaveLength(0);
    expect(s.stack).toHaveLength(0);
    expect(s.players[0].power).toBe(32);
  });
  it("Forgotten Signpost pays both exhaustion costs and follows the exhausted unit's current location", () => {
    let s = fixture();
    s.units = [unit("cost", 0, "field:0"), unit("traveller")];
    s.gears = [{ id: "sign", cardId: unl(45), owner: 0, ready: true }];
    s = act(s, (a) => a.sourceId === "sign" && a.costSourceId === "cost");
    expect(s.units[0].ready).toBe(false);
    expect(s.gears[0].ready).toBe(false);
    s.units[0].location = "field:1";
    s = chain(s);
    expect(s.units[1].location).toBe("field:1");
  });
  it("Dusk Rose Lab pays its local sacrifice before drawing and before hold scoring", () => {
    let s = fixture();
    s.currentPlayer = s.priorityPlayer = 1;
    s.units = [unit("cost", 0, "field:0")];
    s.fields[0] = { id: "field:0", cardId: unl(209), controller: 0 };
    s = act(s, "end-turn");
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = act(s, (a) => a.costSourceId === "cost");
    expect(s.units).toHaveLength(0);
    s = chain(s);
    expect(s.players[0].points).toBe(0);
    expect(s.players[0].hand.length).toBeGreaterThanOrEqual(1);
  });
  it("Emperor's Dais returns the cost unit before responses and creates its Sand Soldier on resolution", () => {
    let s = fixture();
    s.fields[0].cardId = sfd(207);
    s.units = [unit("attacker")];
    s = resolve(move(s, "attacker"));
    s = act(s, (a) => a.costSourceId === "attacker");
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toContain(ogn(49));
    s = chain(s);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].location).toBe("field:0");
    expect(getCard(s.units[0].cardId).tags).toContain("Sand Soldier");
  });
  it("The List chooses a tag as played and can target only units with that tag", () => {
    let s = fixture();
    s.units = [{ ...unit("poro"), cardId: ogn(52) }, unit("spirit")];
    s = cast(
      s,
      unl(138),
      (a) => a.category === "play" && a.namedTag === "Poro",
    );
    const gear = s.gears[0];
    expect(gear.namedTag).toBe("Poro");
    const a = options(s).filter((a) => a.sourceId === gear.id);
    expect(a.map((a) => a.targetId)).toEqual(["poro"]);
    s = chain(act(s, a[0].id));
    expect(s.units[0].temporaryMight).toBe(-2);
  });
  it("Ivern gains a chosen tag as played and its scoring checks tags at resolution", () => {
    let s = fixture();
    const tagged = (tag: string, id: string) => ({
      ...unit(id),
      cardId: cards.find(
        (c) => c.type === "Unit" && c.tags.includes(tag) && getScript(c.id),
      )!.id,
    });
    s.units = [
      tagged("Bird", "bird"),
      tagged("Cat", "cat"),
      tagged("Dog", "dog"),
    ];
    s = cast(
      s,
      unl(177),
      (a) => a.category === "play" && a.namedTag === "Poro",
    );
    const ivern = s.units.at(-1)!;
    expect(getUnitTags(ivern)).toContain("Poro");
    s = run(s, getScript(unl(177))!.onConquer!, ivern.id);
    expect(s.players[0].points).toBe(1);
  });
  it("Profiteer disempowers its cost source before the chosen object is empowered", () => {
    let s = fixture();
    s.units = [
      { ...unit("payer"), empowered: true },
      unit("recipient", 1, "field:0"),
    ];
    s = cast(s, ven(82));
    s = act(s, (a) => a.costSourceId === "payer" && a.targetId === "recipient");
    expect(s.units[0].empowered).toBe(false);
    expect(s.units[1].empowered).not.toBe(true);
    s = chain(s);
    expect(s.units[1].empowered).toBe(true);
  });
  it("Tornado Warrior only triggers from facedown and disempowers the chosen unit at turn end", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "tornado",
        cardId: ven(99),
        owner: 0,
        location: "field:0",
        hiddenTurn: 0,
      },
    ];
    s = act(s, (a) => a.category === "play" && a.cardId === ven(99));
    s = act(s, (a) => a.targetId === "ally");
    s = chain(s);
    expect(s.units[0].empowered).toBe(true);
    s = chain(act(s, "end-turn"));
    expect(s.units.find((u) => u.id === "ally")?.empowered).toBe(false);
  });
  it("Dragon Roost offers a 2-Power destination option and retains Warden's restriction", () => {
    let s = fixture();
    s.fields[0].cardId = ven(157);
    const dragon = cards.find(
      (c) => c.type === "Unit" && c.tags.includes("Dragon") && getScript(c.id),
    )!.id;
    s.players[0].hand = [dragon];
    const normal = options(s).find(
      (a) => a.category === "play" && !a.dragonRoost,
    )!;
    const roost = options(s).find((a) => a.dragonRoost === "field:0")!;
    expect(roost).toBeDefined();
    s = act(s, roost.id);
    expect(s.units[0].location).toBe("field:0");
    expect(s.players[0].power).toBe(30 - (getCard(dragon).power ?? 0) - 2);
    s = fixture();
    s.fields[0].cardId = ven(157);
    s.players[0].hand = [dragon];
    s.units = [{ ...unit("warden", 1, "field:1"), cardId: ogn(70) }];
    expect(options(s).some((a) => a.dragonRoost)).toBe(false);
    expect(normal.locationId).toBe("base:0");
  });
  it("Call to Battle leaves the opponent in charge of choosing and moving their own unit", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally"), unit("enemy", 1, "base:1")];
    s = resolve(
      cast(
        s,
        unl(101),
        (a) => a.category === "play" && a.targetId === "ally~field:0",
      ),
    );
    expect(s.units[0].location).toBe("field:0");
    expect(s.priorityPlayer).toBe(1);
    s = act(s, options(s)[0].id);
    expect(s.units[1].location).toBe("field:0");
  });
  it("Solari Shrine can exhaust for a draw after its controller kills a stunned enemy", () => {
    let s = fixture();
    s.units = [{ ...unit("enemy", 1, "field:0"), stunned: true }];
    s.gears = [{ id: "shrine", cardId: ogn(72), owner: 0, ready: true }];
    s = run(s, [{ type: "kill", chosenTargetId: "enemy" }]);
    s = act(s, (a) => !a.id.includes("skip"));
    expect(s.gears[0].ready).toBe(false);
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("validates new queues, costs and as-play choices in saved games", () => {
    const s = fixture();
    s.extraTurns = [0, 1];
    s.endDisempowers = [{ id: "unit", player: 0, turn: s.turn }];
    expect(validState(deserializeGame(serializeGame(s)))).toBe(true);
    const bad = structuredClone(s) as any;
    bad.extraTurns = [2];
    expect(validState(bad)).toBe(false);
  });
});

describe("declaration timing and shared card-play regressions", () => {
  it("Arcane Shift damages the other target and banishes itself before the returned unit is finalized", () => {
    let s = fixture();
    s.units = [unit("blink"), unit("enemy", 1, "field:0", 8)];
    s = resolve(
      cast(
        s,
        sfd(200),
        (a) => a.category === "play" && a.targetId === "blink~enemy",
      ),
    );
    expect(s.units.map((u) => u.id)).toEqual(["enemy"]);
    expect(s.units[0].damage).toBe(3);
    expect(s.players[0].banished).toContain(sfd(200));
    expect(s.pendingChoice?.kind).toBe("effectPlay");
    s = act(s, (a) => a.category === "play");
    expect(s.units.find((u) => u.owner === 0)?.id).not.toBe("blink");
    expect(s.players[0].energy).toBe(27);
  });
  it("Arcane Shift still deals damage when the friendly target is lost", () => {
    let s = fixture();
    s.units = [unit("blink"), unit("enemy", 1, "field:0", 8)];
    s = cast(
      s,
      sfd(200),
      (a) => a.category === "play" && a.targetId === "blink~enemy",
    );
    s.units.shift();
    s = chain(s);
    expect(s.units[0].damage).toBe(3);
    expect(s.pendingPlays ?? []).toHaveLength(0);
    expect(s.players[0].banished).toContain(sfd(200));
  });
  it("Relentless Pursuit declares destination and Equipment before reactions, then grants a conquer move", () => {
    let s = fixture();
    s.units = [unit("ally")];
    addGear(s, 33, "weapon");
    s = resolve(
      cast(
        s,
        sfd(184),
        (a) => a.category === "play" && a.targetId === "ally~field:0~weapon",
      ),
    );
    expect(s.units[0].location).toBe("field:0");
    expect(s.gears[0].attachedTo).toBe("ally");
    expect(s.units[0].recallOnConquerTurn).toBe(s.turn);
    s = resolve(s);
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = act(s, (a) => !a.id.includes("skip"));
    s = chain(s);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Pack of Wonders requires a target and does not allow confirming an empty selection", () => {
    let s = fixture();
    s.gears = [{ id: "pack", cardId: ogn(181), owner: 0, ready: true }];
    expect(options(s).some((a) => a.sourceId === "pack")).toBe(false);
    s.units = [unit("ally")];
    s = act(s, (a) => a.sourceId === "pack");
    expect(options(s).some((a) => a.id === "choose-board:done")).toBe(false);
  });
  it("a pending card preserves its choices and payment when it has staged board targets", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 2)];
    s.players[0].deck = [ogn(256)];
    s = resolve(cast(s, ogn(115)));
    s = act(s, (a) => a.cardId === ogn(256));
    s = act(s, (a) => a.cardId === ogn(49));
    s = act(s, (a) => a.category === "play");
    s = act(s, (a) => a.category === "play");
    expect(s.pendingChoice?.kind).toBe("boardTargets");
    s = act(s, "choose-board:enemy");
    s = act(s, "choose-board:done");
    s = chain(s);
    expect(s.units.some((u) => u.id === "enemy")).toBe(false);
    expect(s.pendingPlays ?? []).toHaveLength(0);
  });
});
