import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  serializeGame,
  deserializeGame,
  getLegalActions,
  getMight,
  getKeywords,
} from "../src/game/engine";
import { originsExtraScripts } from "../src/game/origins-extra";
import { getScript } from "../src/game/scripts";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";

const id = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
function unit(n: number, owner: PlayerId = 0, suffix = ""): Unit {
  return {
    id: `u${n}${owner}${suffix}`,
    cardId: id(n),
    owner,
    location: "base:0",
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
}
function fixture(): GameState {
  const s = createGame({ seed: 762 });
  s.phase = "main";
  s.turn = 4;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  s.combat = null;
  s.fields.forEach((f) => {
    f.cardId = id(275);
    f.controller = null;
  });
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.deck = Array(20).fill(id(49));
    p.energy = 50;
    p.power = 50;
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.cardsPlayedThisTurn = 0;
    p.legendId = id(251);
    p.championAvailable = false;
    p.points = 0;
    p.hasBegun = true;
  }
  return s;
}
function settle(
  initial: GameState,
  choose?: (actions: GameAction[]) => GameAction | undefined,
) {
  let s = initial;
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(actions) ?? actions[0])
      : actions.find((a) => a.category === "pass");
    if (!action)
      throw new Error(
        `Unresolved ${s.phase}: ${actions.map((a) => a.id).join(", ")}`,
      );
    s = applyAction(s, action);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(s: GameState, n: number, targetId?: string, paid = false) {
  s.players[0].hand.push(id(n));
  const a = getLegalActions(s, 0).find(
    (a) =>
      a.category === "play" &&
      a.cardId === id(n) &&
      a.targetId === targetId &&
      Boolean(a.additionalCostPaid) === paid &&
      a.locationId !== "field:0" &&
      a.locationId !== "field:1",
  );
  expect(a, `legal play of ${getCard(id(n)).name}`).toBeDefined();
  return settle(applyAction(s, a!));
}
function effects(
  s: GameState,
  n: number,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
) {
  const u = s.units.find((u) => u.id === sourceId);
  s.stack.push({
    id: "test-effect",
    player: 0,
    cardId: id(n),
    sourceId,
    targetId,
    locationId: u?.location,
    kind: "trigger",
    effects,
  });
  return settle(s);
}

describe("additional Origins rules through the engine", () => {
  it("registers only explicit complete scripts", () => {
    expect(Object.keys(originsExtraScripts).length).toBeGreaterThan(50);
    for (const [cardId, script] of Object.entries(originsExtraScripts))
      expect(getScript(cardId), getCard(cardId).name).toEqual(script);
    for (const n of [18, 26, 34, 70, 80, 122, 145, 244])
      expect(originsExtraScripts[id(n)]).toBeUndefined();
  });
  it("Sky Splitter discounts by the highest friendly current Might and deals 5", () => {
    const s = fixture(),
      ally = unit(49),
      enemy = unit(88, 1);
    ally.temporaryMight = 6;
    enemy.location = "field:0";
    s.units = [ally, enemy];
    const cost = Math.max(0, getCard(id(14)).energy! - getMight(s, ally));
    const end = play(s, 14, enemy.id);
    expect(end.players[0].energy).toBe(50 - cost);
    expect(end.units.find((u) => u.id === enemy.id)?.damage).toBe(5);
  });
  it("Captain Farron and Taric grant combat bonuses only to other friendly units here", () => {
    const s = fixture(),
      ally = unit(49),
      farron = unit(15),
      taric = unit(74),
      enemy = unit(49, 1);
    s.units = [ally, farron, taric, enemy];
    s.units.forEach((u) => {
      u.location = "field:0";
    });
    const initial = getMight(s, ally);
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getMight(s, ally)).toBe(initial + 1);
    expect(getMight(s, farron)).toBe(getCard(id(15)).might);
    expect(getMight(s, enemy)).toBe(getCard(id(49)).might);
    s.combat.attacker = 1;
    s.combat.defender = 0;
    expect(getMight(s, ally)).toBe(initial + 1);
    expect(getMight(s, taric)).toBe(getCard(id(74)).might! + 1);
    expect(getKeywords(s, ally)).toEqual(
      expect.arrayContaining(["Assault", "Shield"]),
    );
  });
  it("Iron Ballista enters exhausted and Thermo Beam kills gear for both players", () => {
    let s = play(fixture(), 17);
    expect(s.gears[0].ready).toBe(false);
    s.gears[0].ready = true;
    const foe = unit(88, 1);
    foe.location = "field:0";
    s.units.push(foe);
    const ability = getLegalActions(s, 0).find(
      (a) =>
        a.category === "ability" &&
        a.cardId === id(17) &&
        a.targetId === foe.id,
    )!;
    s = settle(applyAction(s, ability));
    expect(s.units[0].damage).toBe(2);
    expect(s.gears[0].ready).toBe(false);
    s.gears.push({ id: "other-gear", cardId: id(98), owner: 1, ready: true });
    s = play(s, 22);
    expect(s.gears).toHaveLength(0);
    expect(s.players[1].discard).toContain(id(98));
  });
  it("Scrapyard Champion discards then draws only with Legion", () => {
    const s = fixture();
    s.players[0].hand = [id(49), id(88)];
    expect(play(structuredClone(s), 20).players[0].discard).toHaveLength(0);
    s.players[0].cardsPlayedThisTurn = 1;
    const end = play(s, 20);
    expect(end.players[0].discard).toEqual([id(49), id(88)]);
    expect(end.players[0].hand).toHaveLength(2);
  });
  it("Darius readies and gains Might on the second card only; Draven follows points", () => {
    const s = fixture(),
      darius = unit(27),
      draven = unit(28);
    darius.ready = false;
    s.units = [darius, draven];
    let end = play(s, 49);
    expect(end.units[0].ready).toBe(false);
    end = play(end, 49);
    expect(end.units[0].ready).toBe(true);
    expect(end.units[0].temporaryMight).toBe(2);
    end = play(end, 49);
    expect(end.units[0].temporaryMight).toBe(2);
    end.players[0].points = 4;
    expect(getMight(end, end.units[1])).toBe(getCard(id(28)).might! + 4);
  });
  it("Kadregrin draws for each Mighty ally including itself; Clockwork Keeper requires its paid extra cost", () => {
    const s = fixture();
    s.units = [unit(88), unit(49)];
    const end = play(s, 38);
    expect(end.players[0].hand).toHaveLength(
      end.units.filter((u) => getMight(end, u) >= 5).length,
    );
    expect(play(fixture(), 44).players[0].hand).toHaveLength(0);
    expect(play(fixture(), 44, undefined, true).players[0].hand).toHaveLength(
      1,
    );
  });
  it("Find Your Center discounts only near the opposing victory score and channels exhausted", () => {
    for (const points of [4, 5]) {
      const s = fixture();
      s.players[1].points = points;
      const end = play(s, 47);
      expect(end.players[0].hand).toHaveLength(1);
      expect(end.players[0].runes).toHaveLength(1);
      expect(end.players[0].runes[0].ready).toBe(false);
      expect(end.players[0].energy).toBe(
        50 - getCard(id(47)).energy! + (points === 5 ? 2 : 0),
      );
    }
  });
  it("Block grants Tank and Shield 3 only while defending", () => {
    const s = fixture(),
      u = unit(49);
    s.units = [u];
    const end = play(s, 57, u.id),
      v = end.units[0];
    expect(getKeywords(end, v)).toContain("Tank");
    expect(getMight(end, v)).toBe(getCard(id(49)).might);
    v.location = "field:0";
    end.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    expect(getMight(end, v)).toBe(getCard(id(49)).might! + 3);
  });
  it("Eclipse Herald reacts to enemy stuns and Pirate's Haven reacts to readying", () => {
    const s = fixture(),
      herald = unit(59),
      enemy = unit(88, 1);
    herald.ready = false;
    s.units = [herald, enemy];
    s.gears = [{ id: "haven", cardId: id(143), owner: 0, ready: true }];
    const end = play(s, 50, enemy.id);
    expect(end.units[0].ready).toBe(true);
    expect(end.units[0].temporaryMight).toBe(2);
  });
  it("Poro Herder needs a Poro and Last Stand doubles current Might with Temporary", () => {
    expect(play(fixture(), 61).players[0].hand).toHaveLength(0);
    const s = fixture();
    s.units = [unit(13)];
    let end = play(s, 61),
      herder = end.units.find((u) => u.cardId === id(61))!;
    expect(herder.buff).toBe(1);
    expect(end.players[0].hand).toHaveLength(1);
    const before = getMight(end, herder);
    end = play(end, 69, herder.id);
    herder = end.units.find((u) => u.id === herder.id)!;
    expect(getMight(end, herder)).toBe(before * 2);
    expect(herder.temporary).toBe(true);
  });
  it("Ahri scores on hold and Kai'Sa draws on conquer", () => {
    const s = fixture();
    const ahri = unit(66),
      kaisa = unit(39);
    s.units = [ahri, kaisa];
    const scored = effects(
      s,
      66,
      originsExtraScripts[id(66)].onHold!,
      undefined,
      ahri.id,
    );
    expect(scored.players[0].points).toBe(1);
    expect(
      effects(
        scored,
        39,
        originsExtraScripts[id(39)].onConquer!,
        undefined,
        kaisa.id,
      ).players[0].hand,
    ).toHaveLength(1);
  });
  it("Tasty Faefolk channels two and draws on death", () => {
    const s = fixture(),
      fae = unit(75);
    s.units = [fae];
    const end = play(s, 229, fae.id);
    expect(end.players[0].runes).toHaveLength(2);
    expect(end.players[0].runes.every((r) => !r.ready)).toBe(true);
    expect(end.players[0].hand).toHaveLength(1);
  });
  it("Whiteflame, Riptide Rex, Blastcone Fae and Teemo apply their printed play effects", () => {
    for (const [card, expected] of [
      [82, 8],
      [97, -2],
    ] as const) {
      const s = fixture(),
        ally = unit(88);
      s.units = [ally];
      const end = play(s, card);
      expect(end.units[0].temporaryMight).toBe(expected);
    }
    const s = fixture(),
      foe = unit(88, 1);
    foe.location = "field:0";
    s.units = [foe];
    expect(play(s, 92).units.find((u) => u.id === foe.id)?.damage).toBe(6);
    expect(play(fixture(), 197).units[0].temporaryMight).toBe(3);
  });
  it("Pit Crew readies from a gear play and Energy Conduit adds Energy immediately", () => {
    const s = fixture(),
      crew = unit(91);
    crew.ready = false;
    s.units = [crew];
    let end = play(s, 98);
    expect(end.units[0].ready).toBe(true);
    const energy = end.players[0].energy;
    const ability = getLegalActions(end, 0).find(
      (a) => a.cardId === id(98) && a.category === "ability",
    )!;
    end = applyAction(end, ability);
    expect(end.players[0].energy).toBe(energy + 1);
    expect(end.stack).toHaveLength(0);
    expect(end.gears[0].ready).toBe(false);
  });
  it("Retreat and Rebuke return legal units; Retreat channels a rune", () => {
    for (const n of [104, 172]) {
      const s = fixture(),
        u = unit(49);
      u.location = "field:0";
      s.units = [u];
      const end = play(s, n, u.id);
      expect(end.units).toHaveLength(0);
      expect(end.players[0].hand).toContain(u.cardId);
      expect(end.players[0].runes).toHaveLength(n === 104 ? 1 : 0);
    }
  });
  it("Sprite Mother produces a ready Temporary Sprite at her own location", () => {
    const end = play(fixture(), 106),
      token = end.units.find((u) => u.token)!;
    expect(token.location).toBe("base:0");
    expect(token.ready).toBe(true);
    expect(token.temporary).toBe(true);
    expect(getMight(end, token)).toBe(3);
  });
  it("does not advertise Dr. Mundo before trash targets can be finalized", () => {
    expect(originsExtraScripts[id(109)]).toBeUndefined();
    expect(getScript(id(109))?.implemented ?? false).toBe(false);
  });
  it("Thousand-Tailed Watcher and Ahri reductions respect the minimum Might", () => {
    const s = fixture(),
      foe = unit(13, 1),
      large = unit(88, 1);
    s.units = [foe, large];
    const end = play(s, 116);
    expect(getMight(end, end.units[0])).toBe(1);
    expect(getMight(end, end.units[1])).toBe(getCard(id(88)).might! - 3);
    const ahri = unit(119);
    ahri.location = "field:0";
    large.location = "field:0";
    const t = fixture();
    t.units = [ahri, large];
    const hit = effects(
      t,
      119,
      originsExtraScripts[id(119)].onDefend!,
      large.id,
      ahri.id,
    );
    expect(hit.units[1].temporaryMight).toBe(-2);
  });
  it("Unchecked Power exhausts friendly units and damages all battlefield units only", () => {
    const s = fixture(),
      atBase = unit(49),
      enemy = unit(88, 1),
      friend = unit(88);
    enemy.location = friend.location = "field:0";
    s.units = [atBase, enemy, friend];
    const end = play(s, 123);
    expect(end.units.map((u) => u.id)).toEqual([atBase.id]);
    expect(end.units[0].ready).toBe(false);
  });
  it("Arena Bar targets exhausted allies and Flurry damages every battlefield", () => {
    const s = fixture(),
      u = unit(88),
      enemy = unit(88, 1);
    u.ready = false;
    u.location = "field:0";
    enemy.location = "field:1";
    s.units = [u, enemy];
    let end = play(s, 124);
    const a = getLegalActions(end, 0).find(
      (a) => a.cardId === id(124) && a.category === "ability",
    )!;
    expect(a.targetId).toBe(u.id);
    end = settle(applyAction(end, a));
    expect(end.units[0].buff).toBe(1);
    end = play(end, 133);
    expect(end.units.map((u) => u.damage)).toEqual([1, 1]);
  });
  it.each([0, 1, 2])(
    "Catalyst channels available runes and draws exactly when fewer than two exist (%i)",
    (count) => {
      const s = fixture();
      s.players[0].runeDeck = Array(count).fill("Body");
      const end = play(s, 138);
      expect(end.players[0].runes).toHaveLength(count);
      expect(end.players[0].hand).toHaveLength(count < 2 ? 1 : 0);
    },
  );
  it("Herald of Scales discounts Dragons to a minimum of one energy", () => {
    const s = fixture();
    s.units = [unit(140), unit(140, 0, "second"), unit(140, 0, "third")];
    const end = play(s, 142);
    expect(end.players[0].energy).toBe(
      50 - Math.max(1, getCard(id(142)).energy! - 6),
    );
  });
  it("Spoils of War discounts only after an enemy unit dies this turn", () => {
    for (const owner of [0, 1] as const) {
      const s = fixture(),
        u = unit(49, owner);
      s.units = [u];
      const dead = play(s, 229, u.id),
        before = dead.players[0].energy;
      const end = play(dead, 144);
      expect(end.players[0].energy).toBe(
        before - getCard(id(144)).energy! + (owner === 1 ? 2 : 0),
      );
      expect(end.players[0].hand).toHaveLength(2);
    }
  });
  it("Anivia's attack hits only local enemies, and Yasuo deals his current Might", () => {
    const s = fixture(),
      anivia = unit(148),
      enemy = unit(88, 1),
      remote = unit(88, 1, "remote");
    anivia.location = enemy.location = "field:0";
    remote.location = "field:1";
    s.units = [anivia, enemy, remote];
    const end = effects(
      s,
      148,
      originsExtraScripts[id(148)].onAttack!,
      undefined,
      anivia.id,
    );
    expect(end.units[1].damage).toBe(3);
    expect(end.units[2].damage).toBe(0);
    const yasuo = unit(76);
    yasuo.location = "field:0";
    yasuo.buff = 1;
    const t = fixture();
    t.units = [yasuo, enemy];
    const damage = getMight(t, yasuo);
    const hit = effects(
      t,
      76,
      originsExtraScripts[id(76)].onAttack!,
      enemy.id,
      yasuo.id,
    );
    expect(
      hit.units.find((u) => u.id === enemy.id)?.damage ??
        getCard(enemy.cardId).might,
    ).toBeGreaterThanOrEqual(damage);
  });
  it("Snapvine duels the chosen enemy and Warwick kills damaged local enemies only", () => {
    const s = fixture(),
      foe = unit(88, 1);
    foe.location = "field:0";
    s.units = [foe];
    const end = play(s, 149);
    expect(end.players[0].discard).toContain(id(149));
    const w = unit(159),
      hurt = unit(49, 1),
      healthy = unit(49, 1, "healthy");
    w.location = hurt.location = healthy.location = "field:0";
    hurt.damage = 1;
    const t = fixture();
    t.units = [w, hurt, healthy];
    const after = effects(
      t,
      159,
      originsExtraScripts[id(159)].onAttack!,
      undefined,
      w.id,
    );
    expect(after.units.map((u) => u.id)).toEqual([w.id, healthy.id]);
    expect(play(fixture(), 159).units[0].ready).toBe(true);
  });
  it("Sett buffs on play and conquer and spends his own buff for temporary Might", () => {
    let s = play(fixture(), 164);
    expect(s.units[0].buff).toBe(1);
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === id(164) && a.category === "ability",
    )!;
    s = settle(applyAction(s, a));
    expect(s.units[0].buff).toBe(0);
    expect(s.units[0].temporaryMight).toBe(4);
    s = effects(
      s,
      164,
      originsExtraScripts[id(164)].onConquer!,
      undefined,
      s.units[0].id,
    );
    expect(s.units[0].buff).toBe(1);
  });
  it("Kog'Maw's death damages its battlefield, including friendly units", () => {
    const s = fixture(),
      kog = unit(190),
      ally = unit(88),
      enemy = unit(88, 1),
      remote = unit(88, 1, "remote");
    kog.location = ally.location = enemy.location = "field:0";
    remote.location = "field:1";
    s.units = [kog, ally, enemy, remote];
    const end = play(s, 229, kog.id);
    expect(end.units.map((u) => u.damage)).toEqual([4, 4, 0]);
  });
  it("Invert Timelines discards both hands then draws four for each player", () => {
    const s = fixture();
    s.players[0].hand = [id(49), id(88)];
    s.players[1].hand = [id(52)];
    const end = play(s, 201);
    expect(end.players[0].hand).toHaveLength(4);
    expect(end.players[1].hand).toHaveLength(4);
    expect(end.players[0].discard).toEqual(
      expect.arrayContaining([id(49), id(88)]),
    );
    expect(end.players[1].discard).toContain(id(52));
  });
  it.each([217, 218, 243])(
    "Legion play effects require an earlier card (%i)",
    (n) => {
      const plain = play(fixture(), n);
      const s = fixture();
      s.players[0].cardsPlayedThisTurn = 1;
      const legion = play(s, n);
      if (n === 217) {
        expect(plain.units[0].buff).toBe(0);
        expect(legion.units[0].buff).toBe(1);
      }
      if (n === 218) {
        expect(plain.units).toHaveLength(1);
        expect(legion.units.filter((u) => u.token)).toHaveLength(2);
      }
      if (n === 243) {
        expect(plain.units[0].ready).toBe(false);
        expect(legion.units[0].ready).toBe(true);
      }
    },
  );
  it("Peak Guardian buffs itself at base and local allies when at a battlefield", () => {
    const base = play(fixture(), 223);
    expect(base.units[0].buff).toBe(1);
    const s = fixture(),
      peak = unit(223),
      ally = unit(49),
      remote = unit(49, 0, "remote");
    peak.location = ally.location = "field:0";
    s.units = [peak, ally, remote];
    const end = effects(
      s,
      223,
      originsExtraScripts[id(223)].onPlay!,
      undefined,
      peak.id,
    );
    expect(end.units.map((u) => u.buff)).toEqual([1, 1, 0]);
  });
  it("Solari Chief stuns unstunned enemies and kills already-stunned ones", () => {
    for (const stunned of [false, true]) {
      const s = fixture(),
        enemy = unit(88, 1);
      enemy.stunned = stunned;
      s.units = [enemy];
      const end = play(s, 225);
      expect(end.units.some((u) => u.id === enemy.id)).toBe(!stunned);
      if (!stunned)
        expect(end.units.find((u) => u.id === enemy.id)?.stunned).toBe(true);
    }
  });
  it("Harnessed Dragon kills its chosen enemy and Leona's attack stuns a local enemy", () => {
    const s = fixture(),
      enemy = unit(88, 1);
    s.units = [enemy];
    expect(play(s, 234).units.some((u) => u.id === enemy.id)).toBe(false);
    const t = fixture(),
      leona = unit(238);
    leona.location = enemy.location = "field:0";
    t.units = [leona, enemy];
    expect(
      effects(
        t,
        238,
        originsExtraScripts[id(238)].onAttack!,
        enemy.id,
        leona.id,
      ).units[1].stunned,
    ).toBe(true);
  });
  it("Machine Evangel creates three base Recruits and Viktor excludes Recruit deaths", () => {
    const s = fixture(),
      evangel = unit(239),
      viktor = unit(246);
    s.units = [evangel, viktor];
    let end = play(s, 229, evangel.id);
    expect(end.units.filter((u) => u.token)).toHaveLength(4);
    expect(end.units.every((u) => u.location === "base:0")).toBe(true);
    const recruit = end.units.find((u) => u.token)!;
    end = play(end, 229, recruit.id);
    expect(end.units.filter((u) => u.token)).toHaveLength(3);
  });
  it("Sett Kingpin counts buffed local allies and Executioner buffs only other friendly units here", () => {
    const s = fixture(),
      sett = unit(240),
      ally = unit(49),
      darius = unit(243);
    sett.location = ally.location = darius.location = "field:0";
    sett.buff = ally.buff = 1;
    s.units = [sett, ally, darius];
    expect(getMight(s, sett)).toBe(getCard(id(240)).might! + 1 + 2 + 1);
    expect(getMight(s, darius)).toBe(getCard(id(243)).might);
    expect(getMight(s, ally)).toBe(getCard(id(49)).might! + 2);
  });
  it("Sona readies four runes at end of turn only from a battlefield", () => {
    for (const location of ["base:0", "field:0"] as const) {
      const s = fixture(),
        sona = unit(73);
      sona.location = location;
      s.units = [sona];
      s.players[0].runes = Array.from({ length: 6 }, (_, i) => ({
        id: `r${i}`,
        domain: "Body",
        ready: false,
      }));
      const end = settle(applyAction(s, "end-turn"));
      expect(end.players[0].runes.filter((r) => r.ready)).toHaveLength(
        location === "field:0" ? 4 : 0,
      );
      expect(end.currentPlayer).toBe(1);
    }
  });
  it("Block expires at end of turn and Windswept Hillock grants battlefield Ganking", () => {
    const s = fixture(),
      u = unit(49);
    s.units = [u];
    let end = play(s, 57, u.id);
    end = settle(applyAction(end, "end-turn"));
    expect(getKeywords(end, end.units[0])).not.toContain("Tank");
    end.fields[0].cardId = id(297);
    end.units[0].location = "field:0";
    expect(getKeywords(end, end.units[0])).toContain("Ganking");
    end.units[0].location = "base:0";
    expect(getKeywords(end, end.units[0])).not.toContain("Ganking");
  });
  it("Might-based attack damage honors global bonus damage", () => {
    const s = fixture(),
      yasuo = unit(76),
      enemy = unit(88, 1);
    yasuo.location = enemy.location = "field:0";
    enemy.baseMightOverride = 30;
    const annie = unit(49);
    annie.cardId = "ogs-001-024";
    s.units = [yasuo, enemy, annie];
    const damage = getMight(s, yasuo);
    const end = effects(
      s,
      76,
      originsExtraScripts[id(76)].onAttack!,
      enemy.id,
      yasuo.id,
    );
    expect(end.units.find((u) => u.id === enemy.id)?.damage).toBe(damage + 1);
  });
  it("Garbage Grabber pays exactly three selected trash cards before its draw resolves", () => {
    const s = fixture();
    s.gears = [{ id: "grabber", cardId: id(99), owner: 0, ready: true }];
    s.players[0].discard = [id(49), id(88), id(52), id(13)];
    const options = getLegalActions(s, 0).filter(
      (a) => a.cardId === id(99) && a.category === "ability",
    );
    expect(options).toHaveLength(4);
    const chosen = options.find(
      (a) => JSON.stringify(a.cardIndices) === "[0,2,3]",
    )!;
    const paid = applyAction(s, chosen);
    expect(paid.players[0].discard).toEqual([id(88)]);
    expect(paid.players[0].hand).toHaveLength(0);
    expect(paid.gears[0].ready).toBe(false);
    expect(paid.players[0].energy).toBe(49);
    expect(paid.stack).toHaveLength(1);
    expect(settle(paid).players[0].hand).toHaveLength(1);
    const short = fixture();
    short.gears = [{ id: "grabber", cardId: id(99), owner: 0, ready: true }];
    short.players[0].discard = [id(49), id(88)];
    expect(
      getLegalActions(short, 0).some(
        (a) => a.cardId === id(99) && a.category === "ability",
      ),
    ).toBe(false);
  });
  it.each([false, true])(
    "Pirate's Haven reacts only to an exhausted-to-ready transition (already ready: %s)",
    (ready) => {
      const s = fixture(),
        u = unit(49);
      u.ready = ready;
      s.units = [u];
      s.gears = [{ id: "haven", cardId: id(143), owner: 0, ready: true }];
      s.players[0].hand = ["sfd-204-221"];
      const action = getLegalActions(s, 0).find(
        (a) => a.category === "play" && a.cardId === "sfd-204-221",
      )!;
      const end = settle(applyAction(s, action));
      expect(end.units[0].ready).toBe(true);
      expect(end.units[0].temporaryMight).toBe(ready ? 0 : 1);
    },
  );
  it("awakening triggers Haven exactly once per newly readied unit before holding and survives save/load", () => {
    const s = fixture(),
      holder = unit(49),
      exhausted = unit(49, 0, "other"),
      alreadyReady = unit(49, 0, "ready");
    holder.location = "field:0";
    holder.ready = exhausted.ready = false;
    s.units = [holder, exhausted, alreadyReady];
    s.fields[0].controller = 0;
    s.gears = [{ id: "haven", cardId: id(143), owner: 0, ready: false }];
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    const awakening = applyAction(s, "end-turn");
    expect(awakening.pendingAwaken).toBe(0);
    expect(awakening.units.every((u) => u.ready)).toBe(true);
    expect(awakening.stack.filter((i) => i.cardId === id(143))).toHaveLength(2);
    expect(awakening.players[0].points).toBe(0);
    expect(awakening.units.every((u) => u.temporaryMight === 0)).toBe(true);
    const restored = deserializeGame(serializeGame(awakening));
    expect(restored).toEqual(awakening);
    expect(getLegalActions(restored, restored.priorityPlayer)).toEqual(
      getLegalActions(awakening, awakening.priorityPlayer),
    );
    const end = settle(restored);
    expect(end.pendingAwaken).toBeUndefined();
    expect(end.players[0].points).toBe(1);
    expect(end.units.find((u) => u.id === holder.id)?.temporaryMight).toBe(1);
    expect(end.units.find((u) => u.id === exhausted.id)?.temporaryMight).toBe(
      1,
    );
    expect(
      end.units.find((u) => u.id === alreadyReady.id)?.temporaryMight,
    ).toBe(0);
  });
  it("Thousand-Tailed Watcher applies simultaneous reductions before an aura source dies", () => {
    const outcomes = [];
    for (const reverse of [false, true]) {
      const s = fixture(),
        darius = unit(243, 1),
        poro = unit(13, 1);
      darius.location = poro.location = "base:1";
      darius.damage = 3;
      s.units = reverse ? [poro, darius] : [darius, poro];
      expect(getMight(s, poro)).toBe(3);
      const end = play(s, 116),
        survivor = end.units.find((u) => u.id === poro.id)!;
      expect(end.players[1].discard).toContain(darius.cardId);
      expect(survivor.temporaryMight).toBe(-2);
      outcomes.push(getMight(end, survivor));
    }
    expect(outcomes).toEqual([0, 0]);
  });
  it("Darius triggers on the second card resolving and preserves its ordinal across reactions", () => {
    const s = fixture(),
      darius = unit(27);
    darius.ready = false;
    s.units = [darius];
    s.players[0].cardsPlayedThisTurn = 1;
    s.players[0].hand = ["sfd-087-221", id(144)];
    const premonition = getLegalActions(s, 0).find(
      (a) => a.category === "play" && a.cardId === "sfd-087-221",
    )!;
    let end = applyAction(s, premonition);
    expect(end.players[0].cardsPlayedThisTurn).toBe(2);
    expect(end.stack.map((i) => i.cardId)).toEqual(["sfd-087-221"]);
    expect(end.units[0].ready).toBe(false);
    expect(end.units[0].temporaryMight).toBe(0);
    const reaction = getLegalActions(end, 0).find(
      (a) => a.category === "play" && a.cardId === id(144),
    )!;
    end = applyAction(end, reaction);
    expect(end.players[0].cardsPlayedThisTurn).toBe(3);
    expect(end.stack.map((i) => i.cardId)).toEqual([
      "sfd-087-221",
      id(144),
    ]);
    expect(end.players[0].hand).toHaveLength(0);
    end = settle(end);
    expect(end.units[0].ready).toBe(true);
    expect(end.units[0].temporaryMight).toBe(2);
    expect(end.players[0].hand).toHaveLength(5);
  });
  it.each([false, true])(
    "Viktor observes another unit's death only when surviving the simultaneous batch (survives: %s)",
    (survives) => {
      const s = fixture(),
        viktor = unit(246),
        ally = unit(49);
      ally.location = "field:0";
      viktor.location = survives ? "base:0" : "field:0";
      s.units = [viktor, ally];
      const end = play(s, 123);
      expect(end.units.some((u) => u.id === ally.id)).toBe(false);
      expect(end.units.some((u) => u.id === viktor.id)).toBe(survives);
      expect(end.units.filter((u) => u.token)).toHaveLength(survives ? 1 : 0);
      if (survives)
        expect(end.units.find((u) => u.token)?.location).toBe("base:0");
    },
  );
});
