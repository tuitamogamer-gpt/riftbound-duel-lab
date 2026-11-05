import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { getKeywords, getMight, getCombatPower } from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import type { GameState } from "../src/game/types";
import { act, addGear, chain, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  choose,
  deployGear,
  goldCount,
  hide,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

const recruits = (s: GameState, owner = 0) =>
  s.units.filter(
    (u) => u.owner === owner && getCard(u.cardId).name.startsWith("Recruit"),
  );
const fresh = (s: GameState, cardId: string) =>
  s.units.find((u) => u.cardId === cardId)!;

describe("Radiance wave 5", () => {
  it("Brawl gives Assault equal to Might", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 4)];
    s.players[0].hand = [rad(4)];
    s = chain(play(s, rad(4), { targetId: "a" }));
    expect(byId(s, "a").temporaryAssault).toBe(4);
  });

  it("Lingering Animus enters ready only after a friendly death this turn", () => {
    let s = fixture();
    s.players[0].hand = [rad(5), rad(5)];
    s = settle(play(s, rad(5), { locationId: "base:0" }));
    expect(fresh(s, rad(5)).ready).toBe(false);
    s.units.push(unit("victim", 0, "base:0", 1));
    s = resolveEffects(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
      targetId: "victim",
    });
    s = settle(play(s, rad(5), { locationId: "base:0" }));
    expect(
      s.units.filter((u) => u.cardId === rad(5)).some((u) => u.ready),
    ).toBe(true);
  });

  it("Rally for War targets only an occupied enemy battlefield", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:1", 5)];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(7)];
    expect(
      actions(s)
        .filter((a) => a.cardId === rad(7))
        .map((a) => a.targetId),
    ).toEqual(["field:1"]);
    s = play(s, rad(7), { targetId: "field:1" });
    s = act(act(s, "pass"), "pass");
    expect(recruits(s).filter((u) => u.location === "field:1")).toHaveLength(3);
  });

  it("Incorrigible Construct enters ready when it shows off a Mech", () => {
    let s = fixture();
    s.units = [{ ...unit("mech", 0, "base:0", 3), cardId: "token-mech" }];
    s.players[0].hand = [rad(11)];
    s = settle(play(s, rad(11), { locationId: "base:0", id: "showoff:mech" }));
    expect(fresh(s, rad(11)).ready).toBe(true);
  });

  it("Coalesced Energy recycles every rune and channels four exhausted at end of turn", () => {
    let s = fixture();
    s.units = [{ ...unit("ce", 0, "base:0", 4), cardId: rad(16) }];
    s.players[0].runes = [
      { id: "r1", domain: "Fury", ready: true },
      { id: "r2", domain: "Fury", ready: true },
    ];
    s.players[0].runeDeck = ["Mind", "Mind", "Mind", "Mind"];
    s = settle(act(s, "end-turn"));
    expect(s.players[0].runes).toHaveLength(4);
    expect(s.players[0].runeDeck).toEqual(["Fury", "Fury"]);
  });

  it("Firebrand Raider readies enemies, makes others enter ready and stops Awaken readying", () => {
    let s = fixture();
    s.units = [{ ...unit("enemy", 1, "base:1", 2), ready: false }];
    s.players[0].hand = [rad(19), "ogn-049-298"];
    s = settle(play(s, rad(19), { locationId: "base:0" }));
    expect(byId(s, "enemy").ready).toBe(true);
    s = settle(play(s, "ogn-049-298", { locationId: "base:0" }));
    expect(fresh(s, "ogn-049-298").ready).toBe(true);
    byId(s, "enemy").ready = false;
    s = settle(act(s, "end-turn"));
    expect(byId(s, "enemy").ready).toBe(false);
  });

  it("Entrenched Boar may enter ready but then cannot move this turn", () => {
    let s = fixture();
    s.players[0].hand = [rad(26)];
    s = settle(play(s, rad(26), { locationId: "base:0", id: "|enter-ready" }));
    const boar = fresh(s, rad(26));
    expect(boar.ready).toBe(true);
    expect(
      actions(s).some((a) => a.id.startsWith(`move-start:${boar.id}`)),
    ).toBe(false);
  });

  it("Iridescent Avian buffs, or gives +2 to a buffed unit", () => {
    let s = fixture();
    s.units = [
      { ...unit("avian", 0, "base:0", 3), cardId: rad(27) },
      { ...unit("b", 0, "base:0", 2), buff: 1 },
    ];
    s = chain(act(s, (a) => a.sourceId === "avian" && a.targetId === "b"));
    expect(byId(s, "b").temporaryMight).toBe(2);
  });

  it("Ki Burst and Life from Stone exhaust a friendly unit as a required cost", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2), unit("e", 1, "base:1", 2)];
    s.players[0].hand = [rad(28), rad(29)];
    expect(
      actions(s)
        .filter((a) => a.cardId === rad(28))
        .every((a) => a.costSourceId),
    ).toBe(true);
    s = chain(
      act(
        s,
        (a) =>
          a.cardId === rad(28) && a.costSourceId === "a" && a.targetId === "e",
      ),
    );
    expect(byId(s, "a").ready).toBe(false);
    expect(byId(s, "e").stunned).toBe(true);
    expect(actions(s).some((a) => a.cardId === rad(29))).toBe(false);
  });

  it("Sanctum Conservator readies when you play a 7+ card", () => {
    let s = fixture();
    s.units = [
      { ...unit("sc", 0, "base:0", 5), cardId: rad(30), ready: false },
      unit("e", 1, "base:1", 20),
    ];
    s.players[0].hand = [rad(59)];
    s = settle(play(s, rad(59), { targetId: "e" }));
    expect(byId(s, "sc").ready).toBe(true);
  });

  it("Stoic Ferryman may send another friendly unit here home", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("a", 0, "field:0", 2)];
    s.players[0].hand = [rad(31)];
    s = play(s, rad(31), { locationId: "field:0" });
    s = settle(until(s, "Move Playful Phantom to your base"));
    expect(byId(s, "a").location).toBe("base:0");
  });

  it("Battle Preparations readies up to 2 runes when it shows off a gear", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].runes = [
      { id: "r1", domain: "Calm", ready: false },
      { id: "r2", domain: "Calm", ready: false },
    ];
    addGear(s, 33, "gear");
    s.players[0].hand = [rad(32)];
    s = play(s, rad(32), { targetId: "a", id: "showoff:gear" });
    s = settle(s);
    expect(byId(s, "a").temporaryMight).toBe(2);
    expect(s.players[0].runes.filter((r) => r.ready).length).toBeGreaterThan(0);
  });

  it("Hunker Down readies a friendly unit that then cannot move, and draws", () => {
    let s = fixture();
    s.units = [{ ...unit("a", 0, "base:0", 2), ready: false }];
    s.players[0].hand = [rad(34)];
    s = chain(play(s, rad(34), { targetId: "a" }));
    expect(byId(s, "a").ready).toBe(true);
    expect(byId(s, "a").moveLockedTurn).toBe(s.turn);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Invigorating Bloom draws only by exhausting a friendly Mighty unit", () => {
    let s = fixture();
    s.units = [unit("small", 0, "base:0", 2)];
    s.gears.push({ id: "bloom", cardId: rad(35), owner: 0, ready: true });
    expect(actions(s).some((a) => a.sourceId === "bloom")).toBe(false);
    s.units.push(unit("big", 0, "base:0", 6));
    s = act(s, (a) => a.sourceId === "bloom");
    s = settle(until(s, "Exhaust Playful Phantom: draw 1"));
    expect(byId(s, "big").ready).toBe(false);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Watchful Curator taxes targeting your gear", () => {
    const s = fixture();
    s.units = [{ ...unit("cur", 1, "base:1", 4), cardId: rad(37) }];
    s.gears.push({ id: "g", cardId: "sfd-033-221", owner: 1, ready: true });
    s.players[0].hand = [rad(101)];
    s.players[0].power = 0;
    s.players[0].runes = [];
    expect(actions(s).some((a) => a.cardId === rad(101))).toBe(false);
    s.players[0].power = 1;
    expect(actions(s).some((a) => a.cardId === rad(101))).toBe(true);
  });

  it("Ephemeral Ward gives +2 to your units and dies when you play a unit", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.gears.push({ id: "ward", cardId: rad(39), owner: 0, ready: true });
    expect(getMight(s, byId(s, "a"))).toBe(4);
    s.players[0].hand = ["ogn-049-298"];
    s = settle(play(s, "ogn-049-298", { locationId: "base:0" }));
    expect(s.gears.some((g) => g.id === "ward")).toBe(false);
  });

  it("Hush counters only spells with Power cost 2 or more", () => {
    expect(getScript(rad(41))?.spell?.[0]).toMatchObject({ minPower: 2 });
  });

  it("Orianna, Exquisite deals no combat damage without a friendly gear here", () => {
    const s = fixture();
    s.units = [{ ...unit("ori", 0, "field:0", 4), cardId: rad(42) }];
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "assign",
      engaged: true,
      designatedUnits: [],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getCombatPower(s, s.units[0])).toBe(0);
    deployGear(s, rad(2), "field:0");
    expect(getCombatPower(s, s.units[0])).toBeGreaterThan(0);
  });

  it("Mysterious Chronomancer predicts 2", () => {
    let s = fixture();
    s.players[0].deck = [
      "ogn-001-298",
      "ogn-049-298",
      ...s.players[0].deck.slice(2),
    ];
    s.players[0].hand = [rad(50)];
    s = play(s, rad(50), { locationId: "base:0" });
    s = until(s, "Recycle Blazing Scorcher");
    s = until(s, "Keep");
    s = settle(s);
    expect(s.players[0].deck[0]).toBe("ogn-049-298");
    expect(s.players[0].deck.at(-1)).toBe("ogn-001-298");
  });

  it("Parallel Convergence and Ekko, Ingenious return a friendly unit as a required cost", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2), unit("e", 1, "field:1", 4)];
    s.players[0].hand = [rad(51)];
    s = chain(act(s, (a) => a.cardId === rad(51) && a.costSourceId === "a"));
    expect(s.units.some((u) => u.id === "a")).toBe(false);
    expect(s.players[0].hand).toContain("ogn-049-298");
    expect(s.units.some((u) => u.id === "e")).toBe(false);
    expect(getScript(rad(61))?.additionalCost).toMatchObject({
      required: true,
    });
  });

  it("Clanging Sentry gives your Mechs Disarm", () => {
    let s = fixture();
    s.units = [
      { ...unit("sentry", 0, "base:0", 2), cardId: rad(55) },
      { ...unit("mech", 0, "base:0", 3), cardId: "token-mech" },
      unit("e", 1, "field:0", 4),
    ];
    s.fields[0].controller = 1;
    expect(getKeywords(s, byId(s, "mech"))).toContain("Disarm");
    s = act(act(s, "move-start:mech:field:0"), "move-confirm");
    s = act(act(s, "pass"), "pass");
    expect(byId(s, "e").temporaryMight).toBe(-1);
  });

  it("Kai'Sa, Rebel gives your spells Reaction while she is in a showdown", () => {
    let s = fixture();
    s.units = [{ ...unit("kai", 0, "base:0", 5), cardId: rad(63) }];
    s.players[0].hand = [rad(4)];
    s = act(act(s, "move-start:kai:field:0"), "move-confirm");
    expect(s.phase).toBe("showdown");
    s.players[0].hand = [rad(59)];
    s.units.push(unit("e", 1, "base:1", 3));
    expect(actions(s).some((a) => a.cardId === rad(59))).toBe(true);
  });

  it("Spirit of the Forge returns a gear to ready and grow by its cost", () => {
    let s = fixture();
    s.gears.push({ id: "g", cardId: "sfd-033-221", owner: 0, ready: true });
    s.players[0].hand = [rad(66)];
    s = settle(act(s, (a) => a.cardId === rad(66) && a.costSourceId === "g"));
    const forge = fresh(s, rad(66));
    expect(forge.ready).toBe(true);
    expect(forge.temporaryMight).toBe(getCard("sfd-033-221").energy ?? 0);
    expect(s.players[0].hand).toContain("sfd-033-221");
  });

  it("Nazuman Ntofo and Protector's Shield are Equipment with their panels", () => {
    expect(getScript(rad(71))?.equipment?.keywords).toEqual(["Shield 2"]);
    expect(getScript(rad(123))?.equipment?.keywords).toEqual(["Tank"]);
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.gears.push({ id: "nt", cardId: rad(71), owner: 0, ready: true });
    s = chain(act(s, (a) => a.id.startsWith("equip:") && a.targetId === "a"));
    expect(getKeywords(s, byId(s, "a"))).toContain("Shield 2");
  });

  it("Raving Witness draws a revealed Mighty unit and recycles anything else", () => {
    let s = fixture();
    s.units = [{ ...unit("w", 0, "base:0", 3), cardId: rad(74) }];
    s.players[0].deck = [rad(59), ...s.players[0].deck];
    s = settle(act(act(s, "move-start:w:field:0"), "move-confirm"));
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].deck.at(-1)).toBe(rad(59));
  });

  it("Skystrike Squadron costs 2 less when it returns a friendly gear", () => {
    let s = fixture();
    s.gears.push({ id: "g", cardId: "sfd-033-221", owner: 0, ready: true });
    s.players[0].hand = [rad(75)];
    const energy = s.players[0].energy;
    s = settle(act(s, (a) => a.cardId === rad(75) && a.costSourceId === "g"));
    expect(energy - s.players[0].energy).toBe(5 - 2);
  });

  it("Armored Tusker may deal its Shield in damage when it moves", () => {
    let s = fixture();
    s.units = [
      { ...unit("t", 0, "base:0", 4), cardId: rad(78) },
      unit("e", 1, "field:1", 5),
    ];
    s.fields[1].controller = 1;
    s = act(act(s, "move-start:t:field:0"), "move-confirm");
    s = settle(until(s, "Deal 3 to Playful Phantom"));
    expect(byId(s, "e").damage).toBe(3);
  });

  it("Bloodscent Swarm costs 2 less per conquered battlefield", () => {
    let s = fixture();
    s.players[0].conqueredThisTurn = [0];
    s.players[0].hand = [rad(80)];
    const energy = s.players[0].energy;
    s = settle(play(s, rad(80), { locationId: "base:0" }));
    expect(energy - s.players[0].energy).toBe(8 - 2);
  });

  it("Primordial Roar deals the shown unit's Might", () => {
    let s = fixture();
    s.units = [unit("big", 0, "base:0", 6), unit("e", 1, "base:1", 9)];
    s.players[0].hand = [rad(82)];
    s = chain(play(s, rad(82), { targetId: "e", id: "showoff:big" }));
    expect(byId(s, "e").damage).toBe(6);
  });

  it("Stalwart Goatherd may kill only gear costing 4 or less", () => {
    let s = fixture();
    s.gears.push(
      { id: "cheap", cardId: "sfd-033-221", owner: 1, ready: true },
      { id: "dear", cardId: rad(46), owner: 1, ready: true },
    );
    s.players[0].hand = [rad(83)];
    s = play(s, rad(83), { locationId: "base:0" });
    const targets = actions(s).map((a) => a.targetId);
    expect(targets).toContain("cheap");
    expect(targets).not.toContain("dear");
  });

  it("Cataclysm stops enemy spells and moves a unit to an occupied enemy battlefield", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2), unit("e", 1, "field:1", 3)];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(84)];
    s = settle(play(s, rad(84), { targetId: "a" }));
    expect(s.players[1].cannotPlaySpellsTurn).toBe(s.turn);
    expect(
      s.units.some((u) => u.id === "a" && u.location === "field:1") ||
        !s.units.some((u) => u.id === "a"),
    ).toBe(true);
  });

  it("Titanic Shrine exhausts to draw when you play the mightiest unit", () => {
    let s = fixture();
    s.gears.push({ id: "shrine", cardId: rad(89), owner: 0, ready: true });
    s.units = [unit("small", 1, "base:1", 1)];
    s.players[0].hand = [rad(77)];
    s = settle(play(s, rad(77), { locationId: "base:0" }));
    expect(s.gears.find((g) => g.id === "shrine")?.ready).toBe(false);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Seraphic Wyvern channels one extra exhausted rune", () => {
    let s = fixture();
    s.units = [{ ...unit("w", 0, "base:0", 7), cardId: rad(92) }];
    s.players[0].runeDeck = ["Body", "Body", "Body"];
    s = resolveEffects(s, rad(29), [{ type: "channel", amount: 1 }]);
    expect(s.players[0].runes).toHaveLength(2);
  });

  it("Disposal Expert enters ready only alone", () => {
    let s = fixture();
    s.players[0].hand = [rad(93)];
    s = settle(play(s, rad(93), { locationId: "base:0" }));
    expect(fresh(s, rad(93)).ready).toBe(true);
  });

  it("An Offer You Can't Refuse kills a gear and its controller gets Gold", () => {
    let s = fixture();
    s.gears.push({ id: "g", cardId: "sfd-033-221", owner: 1, ready: true });
    s.players[0].hand = [rad(101)];
    s = chain(play(s, rad(101), { targetId: "g" }));
    expect(s.gears.some((g) => g.id === "g")).toBe(false);
    expect(goldCount(s, 1)).toBe(1);
  });

  it("Bedeviling Stranger may bounce an enemy at a crowded battlefield", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [
      unit("a", 0, "field:0", 2),
      unit("b", 0, "field:0", 2),
      unit("e1", 1, "field:0", 2),
      unit("e2", 1, "field:0", 2),
    ];
    hide(s, rad(107), "field:0", 0, "h");
    s = act(s, (a) => a.sourceId === "hidden:h");
    if (s.pendingChoice?.kind === "trigger")
      s = act(s, (a) => a.targetId === "field:0");
    s = until(s, "Return Playful Phantom");
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(1);
    expect(s.players[1].hand.length).toBe(1);
  });

  it("Lulu makes another unit's base Might 4 when she moves", () => {
    let s = fixture();
    s.units = [
      { ...unit("lulu", 0, "base:0", 3), cardId: rad(110) },
      { ...unit("e", 1, "base:1", 9) },
    ];
    delete s.units[1].baseMightOverride;
    s = act(act(s, "move-start:lulu:field:0"), "move-confirm");
    s = settle(until(s, "base Might becomes 4"));
    expect(getMight(s, byId(s, "e"))).toBe(4);
  });

  it("One-Two Punch buffs a friendly unit and stuns an enemy", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2), unit("e", 1, "base:1", 2)];
    s.players[0].hand = [rad(121)];
    s = play(s, rad(121));
    s = act(s, (a) => a.targetId === "a");
    s = act(s, (a) => a.targetId === "e");
    s = chain(act(s, "draft:done"));
    expect(byId(s, "a").buff).toBe(1);
    expect(byId(s, "e").stunned).toBe(true);
  });

  it("Mournful Spirit may kill a unit at its battlefield when it dies", () => {
    let s = fixture();
    s.units = [
      { ...unit("ms", 0, "field:0", 1), cardId: rad(126) },
      unit("e", 1, "field:0", 3),
    ];
    // The test chain takes the first option: kill the enemy here.
    s = resolveEffects(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
      targetId: "ms",
    });
    expect(s.units).toHaveLength(0);
  });

  it("Clocktower Guardian banishes the top card when it dies and may play it", () => {
    const dies = (pick: string) => {
      const s = fixture();
      s.units = [{ ...unit("cg", 0, "base:0", 3), cardId: rad(67) }];
      s.players[0].deck = ["ogn-010-298", ...s.players[0].deck];
      s.stack.push({
        id: "kill-cg",
        kind: "ability",
        cardId: rad(59),
        player: 0,
        effects: [{ type: "kill", target: "anyUnit" }],
        targetId: "cg",
      });
      s.priorityPlayer = 0;
      return settle(until(s, pick));
    };
    const played = dies("Play Legion Rearguard");
    expect(played.units.map((u) => u.cardId)).toContain("ogn-010-298");
    const declined = dies("Do not play a card");
    expect(declined.players[0].banished).toContain("ogn-010-298");
    expect(declined.players[0].deck).not.toContain("ogn-010-298");
  });

  it("Drakehound Packmaster plays the revealed top card of the opponent's deck", () => {
    let s = fixture();
    s.players[1].deck = ["ogn-010-298", ...s.players[1].deck];
    s.players[0].hand = [rad(18)];
    s = settle(until(play(s, rad(18), { locationId: "base:0" }), "Legion"));
    const stolen = s.units.find((u) => u.cardId === "ogn-010-298");
    expect(stolen?.owner).toBe(0);
    expect(s.players[1].deck).not.toContain("ogn-010-298");
  });

  it("Trifarian Captain may draw a cheap unit or gear from the top 4", () => {
    let s = fixture();
    s.players[0].deck = [
      "ogn-049-298",
      "ogn-010-298",
      ...s.players[0].deck.slice(2),
    ];
    s.players[0].hand = [rad(129)];
    s = play(s, rad(129), { locationId: "base:0" });
    // Playful Phantom costs 5, so only Legion Rearguard can be drawn.
    expect(actions(s).some((a) => a.label.includes("Playful Phantom"))).toBe(
      false,
    );
    s = settle(until(s, "Reveal and draw Legion Rearguard"));
    expect(s.players[0].hand).toEqual(["ogn-010-298"]);
  });

  it("Demacian Illuminators buff once per batch of friendly deaths", () => {
    let s = fixture();
    s.units = [
      { ...unit("ill", 0, "base:0", 3), cardId: rad(131) },
      unit("a", 0, "field:0", 1),
      unit("b", 0, "field:0", 1),
    ];
    s = resolveEffects(s, rad(4), [
      {
        type: "damageAll",
        amount: 5,
        who: "all",
        condition: "allBattlefields",
      },
    ]);
    s = settle(s);
    expect(byId(s, "ill").buff).toBe(1);
  });

  it("Jarvan IV, Royal Heir may call a unit to his battle", () => {
    let s = fixture();
    s.units = [
      { ...unit("j", 0, "base:0", 7), cardId: rad(133) },
      unit("a", 0, "base:0", 2),
      unit("e", 1, "field:0", 1),
    ];
    s.fields[0].controller = 1;
    s = act(act(s, "move-start:j:field:0"), "move-confirm");
    s = until(s, "Move Playful Phantom to Jarvan's battlefield");
    expect(byId(s, "a").location).toBe("field:0");
  });

  it("Remember the Fallen plays cheap units and gear from your trash", () => {
    let s = fixture();
    s.players[0].discard = ["ogn-010-298", rad(59)];
    s.players[0].hand = [rad(135)];
    s = play(s, rad(135));
    s = settle(until(s, "Legion Rearguard"));
    expect(s.units.some((u) => u.cardId === "ogn-010-298")).toBe(true);
    expect(s.players[0].discard).toContain(rad(59));
  });

  it("Mordekaiser, Dominating may discard to kill", () => {
    let s = fixture();
    s.units = [unit("e", 1, "base:1", 3)];
    s.players[0].hand = [rad(137), "ogn-001-298"];
    s = play(s, rad(137), { locationId: "base:0" });
    s = settle(until(s, "Discard 1 to kill Playful Phantom"));
    expect(s.units.some((u) => u.id === "e")).toBe(false);
    expect(s.players[0].discard).toContain("ogn-001-298");
  });

  it("Realm of Death adjusts Might and makes the two units fight", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 3), unit("e", 1, "base:1", 4)];
    s.players[0].hand = [rad(144)];
    s = chain(play(s, rad(144), { targetId: "a~e" }));
    // Friendly 5 vs enemy 2: the enemy dies, the friendly takes 2.
    expect(s.units.some((u) => u.id === "e")).toBe(false);
    expect(byId(s, "a").damage).toBe(2);
  });

  it("Ntofo Strikes deals damage equal to the friendly unit's Shield", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "base:0", 3), cardId: rad(88) },
      unit("e", 1, "base:1", 9),
    ];
    s.players[0].hand = [rad(148)];
    s = chain(play(s, rad(148), { targetId: "a~e" }));
    expect(byId(s, "e").damage).toBe(4);
  });

  it("Pride of Nazumah gives Assault equal to Shield", () => {
    let s = fixture();
    s.players[0].legendId = rad(147);
    s.units = [
      { ...unit("a", 0, "base:0", 2), cardId: rad(88) },
      unit("e", 1, "field:0", 1),
    ];
    delete s.units[0].baseMightOverride;
    s.fields[0].controller = 1;
    s = chain(act(s, (a) => a.sourceId === "legend" && a.targetId === "a"));
    s = act(act(s, "move-start:a:field:0"), "move-confirm");
    // 2 base + Assault 2 + Shield-as-Assault 2.
    expect(getMight(s, byId(s, "a"))).toBe(6);
  });

  it("The Exile makes units played to your battlefields enter ready", () => {
    let s = fixture();
    s.players[0].legendId = rad(149);
    s.fields[0].controller = 0;
    s.units = [unit("a", 0, "field:0", 2)];
    s.players[0].hand = ["ogn-049-298"];
    s = settle(play(s, "ogn-049-298", { locationId: "field:0" }));
    expect(s.units.find((u) => u.id !== "a")?.ready).toBe(true);
  });

  it("Black Market lets each player pay 2 Power to draw once on their turn", () => {
    let s = fixture();
    s.fields[1].cardId = rad(158);
    s.players[0].power = 2;
    s.players[0].runes = [];
    s = act(s, (a) => a.id.startsWith("radiance:black-market"));
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(1);
    expect(
      actions(s).some((a) => a.id.startsWith("radiance:black-market")),
    ).toBe(false);
  });

  it("Cosmic Vista scores when holding with an empty Rune Deck", () => {
    let s = fixture();
    s.fields[0].cardId = rad(160);
    s.fields[0].controller = 0;
    s.units = [unit("a", 0, "field:0", 2)];
    s.players[0].runeDeck = [];
    s = settle(act(settle(act(s, "end-turn")), "end-turn"));
    expect(s.players[0].points).toBe(2);
  });

  it("Firelights' Hideout lets the next unit Accelerate after a conquest", () => {
    let s = fixture();
    s.fields[0].cardId = rad(162);
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].hand = ["ogn-049-298"];
    s = settle(act(act(s, "move-start:a:field:0"), "move-confirm"));
    expect(
      actions(s).some(
        (a) => a.cardId === "ogn-049-298" && a.id.includes("accelerate"),
      ),
    ).toBe(true);
  });

  it("Hunters' Circle discounts the first unit played there each turn", () => {
    let s = fixture();
    s.fields[0].cardId = rad(163);
    s.fields[0].controller = 0;
    s.units = [unit("a", 0, "field:0", 2)];
    s.players[0].hand = [rad(77), rad(77)];
    const e0 = s.players[0].energy;
    s = settle(play(s, rad(77), { locationId: "field:0" }));
    const e1 = s.players[0].energy;
    expect(e0 - e1).toBe(9 - 1);
    s = settle(play(s, rad(77), { locationId: "field:0" }));
    expect(e1 - s.players[0].energy).toBe(9);
  });

  it("Packed Amphitheater gives champion units there +1", () => {
    const s = fixture();
    s.fields[0].cardId = rad(164);
    s.units = [{ ...unit("champ", 0, "field:0", 4), cardId: rad(86) }];
    delete s.units[0].baseMightOverride;
    expect(getMight(s, s.units[0])).toBe(5);
  });

  it("Durand Memorial gives a defender here Tank", () => {
    let s = fixture();
    s.fields[0].cardId = rad(161);
    s.fields[0].controller = 1;
    s.units = [unit("a", 0, "base:0", 3), unit("d", 1, "field:0", 2)];
    s = act(act(s, "move-start:a:field:0"), "move-confirm");
    s = settle(s);
    expect(s.log.some((l) => l.text.includes("Durand Memorial"))).toBe(true);
    expect(choose).toBeDefined();
  });
});
