import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { getKeywords, getMight } from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { shieldValue } from "../src/game/radiance-wave5";
import type { GameState, Unit } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  deployGear,
  goldCount,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

const as = (u: Unit, n: number): Unit => ({ ...u, cardId: rad(n) });
const fresh = (s: GameState, cardId: string) =>
  s.units.find((u) => u.cardId === cardId)!;
const rd6 = (custom: string) => ({
  type: "special" as const,
  custom: `radiance6:${custom}`,
});
const kill = (s: GameState, targetId: string) =>
  resolveEffects(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
    targetId,
  });
const killGear = (s: GameState, targetId: string) =>
  resolveEffects(s, rad(59), [{ type: "kill", target: "anyGear" }], {
    targetId,
  });
const move = (s: GameState, id: string, to: string) =>
  act(act(s, `move-start:${id}:${to}`), "move-confirm");
const ability = (s: GameState, sourceId: string, label: string) =>
  act(
    s,
    (a) =>
      a.category === "ability" &&
      a.sourceId === sourceId &&
      a.label.includes(label),
  );

describe("Radiance wave 6", () => {
  it("Scorched Earth splits 5 damage among units at one battlefield", () => {
    let s = fixture();
    s.units = [
      unit("e1", 1, "field:0", 3),
      unit("e2", 1, "field:0", 3),
      unit("far", 1, "field:1", 3),
    ];
    s.players[0].hand = [rad(6)];
    s = act(s, (a) => a.category === "play" && a.cardId === rad(6));
    s = act(s, "draft:board:e1");
    expect(actions(s).some((a) => a.id === "draft:board:far")).toBe(false);
    s = act(act(act(s, "draft:board:e2"), "draft:step"), "draft:done");
    s = until(s, "3 damage");
    s = settle(s);
    expect(s.units.map((u) => u.id)).toEqual(["e2", "far"]);
    expect(byId(s, "e2").damage).toBe(2);
  });

  it("Forbidden Technique returns from trash after a 7+ card, then is banished", () => {
    let s = fixture();
    s.players[0].discard = [rad(10)];
    s.players[0].hand = [rad(59)];
    s.units = [unit("enemy", 1, "base:1", 20)];
    s = settle(play(s, rad(59), { targetId: "enemy" }));
    expect(s.players[0].banished).toContain(rad(10));
    expect(s.players[0].discard).not.toContain(rad(10));
  });

  it("Runeblade Anvil banishes the top card, which you may play this turn", () => {
    let s = fixture();
    s.players[0].deck = ["ogn-010-298", ...s.players[0].deck];
    s.players[0].hand = [rad(12)];
    s = settle(play(s, rad(12)));
    expect(s.players[0].banished).toContain("ogn-010-298");
    const banishedPlay = actions(s).find(
      (a) => a.cardId === "ogn-010-298" && a.sourceId?.startsWith("banished:"),
    );
    expect(banishedPlay).toBeDefined();
    s = settle(act(s, (a) => a.id === banishedPlay!.id));
    expect(s.units.map((u) => u.cardId)).toContain("ogn-010-298");
    expect(s.players[0].banished).not.toContain("ogn-010-298");
    // Leaving the board banishes the next card too.
    const anvil = s.gears.find((g) => g.cardId === rad(12))!;
    s = settle(ability(s, anvil.id, "Kill this"));
    expect(s.gears.some((g) => g.id === anvil.id)).toBe(false);
    expect(s.players[0].banished).toHaveLength(1);
  });

  it("Runeblade Anvil permissions end after your next Ending Phase", () => {
    let s = fixture();
    s.players[0].banished = ["ogn-010-298"];
    s.radiance = {
      anvil: [{ player: 0, cardId: "ogn-010-298", until: s.turn - 1 }],
    };
    expect(actions(s).some((a) => a.sourceId?.startsWith("banished:"))).toBe(
      false,
    );
  });

  it("Shimmering Swimmer deals 2 only if it killed a friendly unit or gear", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2), unit("e", 1, "base:1", 2)];
    s.players[0].hand = [rad(14)];
    s = act(s, (a) => a.cardId === rad(14) && a.costSourceId === "a");
    if (s.pendingChoice?.kind === "trigger")
      s = act(s, (a) => a.targetId === "e");
    s = settle(s);
    expect(s.units.some((u) => u.id === "a" || u.id === "e")).toBe(false);
  });

  it("Akali, Brash adds resources on her first move and banishes on her second", () => {
    let s = fixture();
    s.units = [as(unit("ak", 0, "base:0", 5), 15)];
    s.players[0].deck = ["ogn-010-298", ...s.players[0].deck];
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(move(s, "ak", "field:0"));
    expect(s.players[0].energy).toBe(energy + 1);
    expect(s.players[0].power).toBe(power + 1);
    byId(s, "ak").ready = true;
    s = settle(move(s, "ak", "base:0"));
    expect(s.players[0].banished).toEqual(["ogn-010-298"]);
    expect(
      actions(s).some(
        (a) =>
          a.cardId === "ogn-010-298" && a.sourceId?.startsWith("banished:"),
      ),
    ).toBe(true);
  });

  it("Detonation Amplifier may kill to draw and doubles friendly Deathknells here", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].hand = [rad(17)];
    const hand = s.players[0].hand.length;
    s = settle(
      until(
        play(s, rad(17), { locationId: "field:0" }),
        "Kill Playful Phantom: draw 1",
      ),
    );
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand.length).toBe(hand);
    deployGear(s, "token-bomb", "field:0", 0, "bomb");
    s.units = [unit("e", 1, "field:0", 4)];
    s = settle(killGear(s, "bomb"));
    expect(s.units).toHaveLength(0);
  });

  it("Ekko, Revolutionary blinks to base, entering ready", () => {
    let s = fixture();
    s.units = [{ ...as(unit("ekko", 0, "field:0", 4), 21), ready: false }];
    s.players[0].hand = ["ogn-049-298"];
    s = settle(ability(s, "ekko", "Banish me"));
    const ekko = fresh(s, rad(21));
    expect(ekko.location).toBe("base:0");
    expect(ekko.ready).toBe(true);
    expect(s.players[0].hand).toHaveLength(0);
  });

  it("Whirling Twirligig makes Gold, Recruits and Mechs", () => {
    let s = fixture();
    const twirl = deployGear(s, rad(22), "base:0", 0, "tw");
    delete twirl.deployedAt;
    s = settle(ability(s, "tw", "Gold"));
    expect(goldCount(s)).toBe(1);
    const ready = (s: GameState) =>
      (s.gears.find((g) => g.id === "tw")!.ready = true);
    ready(s);
    s.units = [unit("a", 0, "base:0", 2)];
    s = settle(ability(s, "tw", "Mech"));
    expect(s.units.map((u) => u.cardId)).toEqual(["token-mech"]);
    ready(s);
    s = settle(ability(s, "tw", "Recruit"));
    expect(goldCount(s)).toBe(0);
    expect(s.units).toHaveLength(2);
  });

  it("Ziggs plays a Bomb and gear abilities deal 1 Bonus Damage", () => {
    let s = fixture();
    s.players[0].hand = [rad(23)];
    s = settle(play(s, rad(23), { locationId: "base:0" }));
    expect(s.gears.filter((g) => g.cardId === "token-bomb")).toHaveLength(1);
    const bomb = s.gears.find((g) => g.cardId === "token-bomb")!;
    s.units.push(unit("e", 1, bomb.deployedAt!, 3));
    s = settle(killGear(s, bomb.id));
    expect(s.units.some((u) => u.id === "e")).toBe(false);
  });

  it("Blossoming Dreamroot draws when you win a combat here", () => {
    let s = fixture();
    deployGear(s, rad(24), "field:0", 0, "dr");
    s.units = [unit("a", 0, "base:0", 8), unit("e", 1, "field:0", 1)];
    s.fields[0].controller = 1;
    const hand = s.players[0].hand.length;
    s = settle(move(s, "a", "field:0"));
    expect(s.players[0].hand.length).toBe(hand + 1);
  });

  it("Command: Attack moves a Deploy gear or draws a gear from the top 5", () => {
    let s = fixture();
    deployGear(s, rad(24), "field:0", 0, "dr");
    s.players[0].hand = [rad(33), rad(33)];
    s = play(s, rad(33), { id: "|mode:0" });
    s = settle(until(s, "Move Blossoming Dreamroot"));
    expect(s.gears.find((g) => g.id === "dr")!.deployedAt).toBe("field:1");
    s.players[0].deck = ["ogn-049-298", rad(12), ...s.players[0].deck.slice(2)];
    const deck = s.players[0].deck.length;
    s = settle(until(play(s, rad(33), { id: "|mode:1" }), "Reveal and draw"));
    expect(s.players[0].hand).toContain(rad(12));
    expect(s.players[0].deck).toHaveLength(deck - 1);
  });

  it("Storm Raptor draws when a stunned enemy dies at its battlefield", () => {
    let s = fixture();
    s.units = [
      as(unit("raptor", 0, "field:0", 6), 36),
      { ...unit("e", 1, "field:0", 1), stunned: true },
    ];
    const hand = s.players[0].hand.length;
    s = settle(kill(s, "e"));
    expect(s.players[0].hand.length).toBe(hand + 1);
  });

  it("Ahri, Confident grows when you reduce an enemy's Might at her battlefield", () => {
    let s = fixture();
    s.units = [
      as(unit("ahri", 0, "field:0", 4), 38),
      unit("e", 1, "field:0", 4),
      unit("far", 1, "field:1", 4),
    ];
    const might = (s: GameState) => getMight(s, byId(s, "ahri"));
    const before = might(s);
    s = settle(
      resolveEffects(
        s,
        rad(59),
        [{ type: "might", amount: -1, target: "anyUnit" }],
        {
          targetId: "far",
        },
      ),
    );
    expect(might(s)).toBe(before);
    s = settle(
      resolveEffects(
        s,
        rad(59),
        [{ type: "might", amount: -1, target: "anyUnit" }],
        {
          targetId: "e",
        },
      ),
    );
    expect(might(s)).toBe(before + 1);
  });

  it("Heartening Soul readies your legend and gives it +3 Might ability", () => {
    let s = fixture();
    s.players[0].legendUsedTurn = s.turn;
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].hand = [rad(40)];
    s = settle(play(s, rad(40), { locationId: "base:0" }));
    expect(s.players[0].legendUsedTurn).toBe(-1);
    s = settle(
      act(
        s,
        (a) =>
          a.sourceId === "legend" &&
          a.label.includes("+3 Might") &&
          a.targetId === "a",
      ),
    );
    expect(getMight(s, byId(s, "a"))).toBe(5);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
  });

  it("Riven, Broken Blade chooses a different mode each time she exhausts", () => {
    let s = fixture();
    s.units = [as(unit("riven", 0, "base:0", 4), 43)];
    s = settle(move(s, "riven", "field:0"));
    expect(byId(s, "riven").buff).toBe(1);
    byId(s, "riven").ready = true;
    s = move(s, "riven", "base:0");
    s = settle(until(s, "ready her"));
    expect(byId(s, "riven").ready).toBe(true);
    expect(byId(s, "riven").buff).toBe(0);
  });

  it("K'Sante, Dauntless doubles a unit's Shield here", () => {
    let s = fixture();
    s.units = [as(unit("ks", 0, "field:0", 4), 45)];
    expect(shieldValue(s, byId(s, "ks"))).toBe(1);
    s = settle(
      resolveEffects(s, rad(45), [rd6("ksante")], {
        sourceId: "ks",
        locationId: "field:0",
      }),
    );
    expect(shieldValue(s, byId(s, "ks"))).toBe(2);
    expect(getScript(rad(45))?.onDefend).toBeDefined();
    expect(getScript(rad(45))?.onAttack).toBeDefined();
  });

  it("Resplendent Rostrum draws, channels and pumps a unit when exhausted", () => {
    let s = fixture();
    const rostrum = deployGear(s, rad(46), "base:0", 0, "ro");
    delete rostrum.deployedAt;
    s.units = [unit("a", 0, "base:0", 2)];
    const hand = s.players[0].hand.length;
    s = settle(ability(s, "ro", "Draw 1"));
    expect(s.players[0].hand.length).toBe(hand + 1);
    expect(s.players[0].runes.filter((r) => !r.ready)).toHaveLength(1);
    expect(getMight(s, byId(s, "a"))).toBe(5);
  });

  it("Improvised Projectile deals the chosen friendly gear's Energy cost", () => {
    let s = fixture();
    const g = deployGear(s, rad(22), "base:0", 0, "tw");
    delete g.deployedAt;
    s.units = [unit("e", 1, "field:0", 4)];
    s.players[0].hand = [rad(56)];
    s = settle(play(s, rad(56), { targetId: "e" }));
    expect(s.units).toHaveLength(0);
  });

  it("Scrutinizing Scope recycles a guessed type and otherwise draws", () => {
    let s = fixture();
    const scope = deployGear(s, rad(64), "base:0", 0, "sc");
    delete scope.deployedAt;
    const hand = s.players[0].hand.length;
    s = ability(s, "sc", "guesses");
    s = settle(until(s, "Guess Unit"));
    expect(s.players[0].hand.length).toBe(hand);
    s.gears.find((g) => g.id === "sc")!.ready = true;
    s = ability(s, "sc", "guesses");
    s = settle(until(s, "Guess Spell"));
    expect(s.players[0].hand.length).toBe(hand + 1);
  });

  it("Orianna, Mechanical Marvel discounts one gear each turn at a battlefield", () => {
    let s = fixture();
    s.units = [as(unit("ori", 0, "field:0", 5), 68)];
    s.players[0].hand = [rad(22), rad(22)];
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(play(s, rad(22)));
    expect(energy - s.players[0].energy).toBe(3);
    expect(power - (s.players[0].power ?? 0)).toBe(0);
    s = settle(play(s, rad(22)));
    expect(energy - s.players[0].energy).toBe(7);
  });

  it("Zero Point Inflection draws 2 per card, and a full hand costs a point", () => {
    let s = fixture();
    const zpi = deployGear(s, rad(69), "base:0", 0, "zpi");
    delete zpi.deployedAt;
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].hand = [rad(4)];
    s = settle(play(s, rad(4), { targetId: "a" }));
    expect(s.players[0].hand).toHaveLength(2);
    s.players[0].hand = Array(9).fill("ogn-049-298");
    const points = s.players[1].points;
    s = settle(resolveEffects(s, rad(59), [{ type: "draw", amount: 1 }]));
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.gears.some((g) => g.id === "zpi")).toBe(false);
    expect(s.players[1].points).toBe(points + 1);
  });

  it("Zero Point Inflection and Orianna ignore tokens, which are not cards", () => {
    let s = fixture();
    for (const [id, n] of [
      ["zpi", 69],
      ["tw", 22],
    ] as const) {
      const g = deployGear(s, rad(n), "base:0", 0, id);
      delete g.deployedAt;
    }
    s.units = [{ ...unit("ori", 0, "field:0", 5), cardId: rad(68) }];
    s = settle(ability(s, "tw", "Gold"));
    expect(goldCount(s)).toBe(1);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.radiance?.once?.["orianna-mm:0"]).toBeUndefined();
  });

  it("Graves damages every enemy here and deals no combat damage", () => {
    let s = fixture();
    s.units = [
      as(unit("graves", 0, "field:0", 4), 85),
      unit("e1", 1, "field:0", 3),
      unit("e2", 1, "field:0", 3),
      unit("mine", 0, "field:0", 3),
    ];
    expect(getKeywords(s, byId(s, "graves"))).toContain("No combat damage");
    s = settle(
      resolveEffects(s, rad(85), [rd6("graves")], {
        sourceId: "graves",
        locationId: "field:0",
      }),
    );
    expect(s.units.map((u) => u.id).sort()).toEqual(["graves", "mine"]);
  });

  it("Mechanical Bandit draws your top card only if it is the cheapest", () => {
    let s = fixture();
    const bandit = deployGear(s, rad(111), "base:0", 0, "bd");
    delete bandit.deployedAt;
    s.players[0].deck = ["ogn-010-298", ...s.players[0].deck];
    const hand = s.players[0].hand.length;
    s = settle(
      resolveEffects(s, rad(111), [rd6("bandit")], { sourceId: "bd" }),
    );
    expect(s.players[0].hand).toHaveLength(hand + 1);
    expect(s.players[0].hand.at(-1)).toBe("ogn-010-298");
    expect(s.players[1].deck.at(-1)).toBe("ogn-049-298");
    expect(getScript(rad(111))?.onBegin).toBeDefined();
  });

  it("Angler Wyrm makes an opponent move a unit to its battlefield", () => {
    let s = fixture();
    s.units = [
      as(unit("wyrm", 0, "field:0", 8), 113),
      unit("e", 1, "base:1", 3),
    ];
    s = until(ability(s, "wyrm", "moves a unit"), "Move Playful Phantom");
    expect(byId(s, "e").location).toBe("field:0");
  });

  it("Riven, Deserter exhausts a friendly unit to ready a unit and grows", () => {
    let s = fixture();
    s.units = [
      as(unit("rd", 0, "base:0", 5), 114),
      unit("a", 0, "base:0", 2),
      { ...unit("b", 0, "base:0", 2), ready: false },
    ];
    const before = getMight(s, byId(s, "rd"));
    s = act(
      s,
      (a) =>
        a.sourceId === "rd" && a.category === "ability" && a.targetId === "b",
    );
    s = settle(until(s, "Exhaust Playful Phantom, then ready"));
    expect(byId(s, "b").ready).toBe(true);
    expect(s.units.filter((u) => !u.ready)).toHaveLength(1);
    expect(getMight(s, byId(s, "rd"))).toBe(before + 1);
    expect(
      actions(s).some((a) => a.sourceId === "rd" && a.category === "ability"),
    ).toBe(false);
  });

  it("Transpositionist returns a unit and may play a smaller one for free", () => {
    let s = fixture();
    s.units = [
      as(unit("tp", 0, "base:0", 4), 115),
      unit("big", 0, "base:0", 8),
    ];
    s.players[0].hand = [rad(5)];
    s = act(
      s,
      (a) =>
        a.sourceId === "tp" && a.category === "ability" && a.targetId === "big",
    );
    s = settle(until(s, "Play Lingering Animus"));
    expect(s.players[0].hand).toEqual(["ogn-049-298"]);
    expect(s.units.map((u) => u.cardId)).toContain(rad(5));
  });

  it("Battlefield Armorer may pay 1 to return a friendly gear that died at a battlefield", () => {
    let s = fixture();
    s.units = [as(unit("arm", 0, "base:0", 3), 130)];
    deployGear(s, rad(24), "field:0", 0, "dr");
    const energy = s.players[0].energy;
    s = settle(killGear(s, "dr"));
    expect(s.players[0].hand).toContain(rad(24));
    expect(s.players[0].energy).toBe(energy - 1);
  });

  it("Boy Who Shattered Time empowers, then discounts a unit that dies at end of turn", () => {
    let s = fixture();
    s.players[0].legendId = rad(139);
    s = settle(ability(s, "legend", "Empower"));
    expect(s.players[0].legendEmpowered).toBe(true);
    s.players[0].legendUsedTurn = -1;
    s = settle(ability(s, "legend", "costs 2 Energy"));
    expect(s.players[0].legendEmpowered).toBeFalsy();
    s.players[0].hand = [rad(40)];
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(play(s, rad(40), { locationId: "base:0" }));
    expect(energy - s.players[0].energy).toBe(5);
    expect(power - (s.players[0].power ?? 0)).toBe(0);
    s = settle(act(s, "end-turn"));
    expect(s.units.some((u) => u.cardId === rad(40))).toBe(false);
  });

  it("Hexplosive Minefield kills Bombs now and replays them at end of turn", () => {
    let s = fixture();
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    deployGear(s, "token-bomb", "field:1", 0, "b2");
    s.players[0].hand = [rad(142)];
    s = play(s, rad(142));
    s = act(until(s, "Kill the Bomb"), "choose-custom:minefield:b2");
    s = settle(until(s, "Done: 2 Bombs"));
    expect(s.gears.filter((g) => g.cardId === "token-bomb")).toHaveLength(0);
    s = act(s, "end-turn");
    s = settle(until(s, "battlefield 1"));
    const bombs = s.gears.filter((g) => g.cardId === "token-bomb");
    expect(bombs).toHaveLength(2);
    expect(new Set(bombs.map((g) => g.deployedAt)).size).toBe(1);
  });

  it("Blade of the Exile equips by exhausting a friendly unit and grants +3 and Ganking", () => {
    let s = fixture();
    const blade = deployGear(s, rad(150), "base:0", 0, "blade");
    delete blade.deployedAt;
    s.units = [unit("a", 0, "base:0", 2), unit("b", 0, "base:0", 2)];
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(act(s, "equip:blade:a:exhaust:b"));
    expect(byId(s, "b").ready).toBe(false);
    expect(getMight(s, byId(s, "a"))).toBe(5);
    expect(getKeywords(s, byId(s, "a"))).toContain("Ganking");
    expect(s.players[0].energy).toBe(energy);
    expect(s.players[0].power ?? 0).toBe(power);
  });

  it("alternate printings share their source rules", () => {
    for (const [variant, source] of [
      ["rad-021a-167", rad(21)],
      ["rad-177-167", rad(21)],
      ["rad-sp1-005", rad(38)],
      ["rad-sp2-005", rad(15)],
      ["rad-168-167", rad(139)],
    ])
      expect(getCard(variant).name).toBe(getCard(source).name);
  });
});
