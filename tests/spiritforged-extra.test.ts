import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { spiritforgedExtraScripts as scripts } from "../src/game/spiritforged-extra";
import { getScript } from "../src/game/scripts";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";
const id = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
function unit(n: number, owner: PlayerId = 0, suffix = ""): Unit {
  return {
    id: `u${n}${owner}${suffix}`,
    cardId: id(n),
    owner,
    location: `base:${owner}`,
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
  const s = createGame({ seed: 849 });
  s.phase = "main";
  s.turn = 4;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  s.combat = null;
  for (const f of s.fields) {
    f.cardId = ogn(275);
    f.controller = null;
  }
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.deck = Array(20).fill(ogn(49));
    p.energy = 50;
    p.power = 50;
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.cardsPlayedThisTurn = 0;
    p.legendId = ogn(251);
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
    const a = getLegalActions(s, s.priorityPlayer);
    const next = s.pendingChoice
      ? (choose?.(a) ?? a[0])
      : a.find((a) => a.category === "pass");
    if (!next)
      throw new Error(`Unresolved ${s.phase}: ${a.map((a) => a.id).join(",")}`);
    s = applyAction(s, next);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(
  s: GameState,
  n: number,
  targetId?: string,
  paid = false,
  choose?: (actions: GameAction[]) => GameAction | undefined,
) {
  s.players[0].hand.push(id(n));
  const a = getLegalActions(s, 0).find(
    (a) =>
      a.cardId === id(n) &&
      a.category === "play" &&
      a.targetId === targetId &&
      Boolean(a.additionalCostPaid) === paid &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `legal play ${getCard(id(n)).name}`).toBeDefined();
  return settle(applyAction(s, a!), choose);
}
function resolve(
  s: GameState,
  n: number,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  choose?: (actions: GameAction[]) => GameAction | undefined,
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
  return settle(s, choose);
}
function kill(s: GameState, targetId: string) {
  s.stack.push({
    id: "kill",
    player: 0,
    cardId: ogn(229),
    kind: "spell",
    targetId,
    effects: [{ type: "kill", target: "anyUnit" }],
  });
  return settle(s);
}
function combat(s: GameState) {
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
}

describe("additional Spiritforged rules through the engine", () => {
  it("registers all explicit implementations without placeholders for unsupported complex rules", () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(40);
    for (const [cardId, script] of Object.entries(scripts))
      expect(getScript(cardId), getCard(cardId).name).toEqual(script);
    for (const n of [14, 18, 59, 78, 90, 149, 173])
      expect(scripts[id(n)]).toBeUndefined();
  });
  it("Against the Odds counts only local enemies and Bushwhack readies later units", () => {
    const s = fixture(),
      u = unit(159),
      a = unit(159, 1),
      b = unit(159, 1, "b"),
      remote = unit(159, 1, "r");
    u.location = a.location = b.location = "field:0";
    remote.location = "field:1";
    s.units = [u, a, b, remote];
    const end = play(s, 1, u.id);
    expect(end.units[0].temporaryMight).toBe(4);
    let ready = play(fixture(), 4);
    expect(ready.gears.filter((g) => g.token)).toHaveLength(1);
    expect(ready.gears[0].ready).toBe(false);
    ready = play(ready, 159);
    expect(ready.units[0].ready).toBe(true);
  });
  it("Detonate destroys chosen gear and lets its controller draw two", () => {
    const s = fixture();
    s.gears = [{ id: "g", cardId: id(52), owner: 1, ready: true }];
    const end = play(s, 5, "g");
    expect(end.gears).toHaveLength(0);
    expect(end.players[1].hand).toHaveLength(2);
    expect(end.players[0].hand).toHaveLength(0);
  });
  it("Battering Ram discount counts earlier cards and keeps one Energy minimum", () => {
    for (const played of [0, 2, 20]) {
      const s = fixture();
      s.players[0].cardsPlayedThisTurn = played;
      const end = play(s, 12);
      expect(end.players[0].energy).toBe(
        50 - Math.max(1, getCard(id(12)).energy! - played),
      );
    }
  });
  it.each([13, 67])(
    "optional additional payment controls play damage/Might (%i)",
    (n) => {
      const s = fixture(),
        foe = unit(85, 1);
      foe.location = "field:0";
      foe.baseMightOverride = 30;
      s.units = [foe];
      const unpaid = play(structuredClone(s), n);
      expect(unpaid.units[0].damage).toBe(0);
      expect(unpaid.units[0].temporaryMight).toBe(0);
      const paid = play(s, n, undefined, true, (a) =>
        a.find((x) => x.targetId === foe.id),
      );
      expect(
        n === 13 ? paid.units[0].damage : paid.units[0].temporaryMight,
      ).toBe(n === 13 ? 2 : -2);
    },
  );
  it("Sudden Storm deals four only to a designated attacker", () => {
    const s = fixture(),
      u = unit(85),
      v = unit(85, 1);
    u.location = v.location = "field:0";
    u.baseMightOverride = v.baseMightOverride = 30;
    s.units = [u, v];
    combat(s);
    expect(play(structuredClone(s), 17, u.id).units[0].damage).toBe(4);
    expect(play(s, 17, v.id).units[1].damage).toBe(2);
  });
  it("Dunebreaker enters ready with at most two remaining hand cards and draws two on hold", () => {
    const empty = play(fixture(), 27);
    expect(empty.units[0].ready).toBe(true);
    const s = fixture();
    s.players[0].hand = Array(3).fill(ogn(49));
    const full = play(s, 27);
    expect(full.units[0].ready).toBe(false);
    expect(
      resolve(empty, 27, scripts[id(27)].onHold!, undefined, empty.units[0].id)
        .players[0].hand,
    ).toHaveLength(2);
  });
  it("Disarming Rake may decline or kill gear; Pickpocket accepts only cost <=1", () => {
    const s = fixture();
    s.gears = [{ id: "g", cardId: id(52), owner: 1, ready: true }];
    expect(
      play(structuredClone(s), 32, undefined, false, (a) =>
        a.find(
          (a) => a.id.endsWith("decline") || a.id === "choose-trigger:skip",
        ),
      ).gears,
    ).toHaveLength(1);
    expect(play(s, 32).gears).toHaveLength(0);
    const t = fixture();
    t.gears = [
      { id: "small", cardId: id(108), owner: 1, ready: true },
      { id: "large", cardId: id(52), owner: 1, ready: true },
    ];
    const end = play(t, 74);
    expect(end.gears.some((g) => g.id === "small")).toBe(false);
    expect(end.gears.some((g) => g.id === "large")).toBe(true);
    expect(end.gears.some((g) => g.token)).toBe(true);
  });
  it.each([35, 61])("does not advertise late trash targeting (%i)", (n) => {
    expect(scripts[id(n)]).toBeUndefined();
    expect(getScript(id(n))?.implemented ?? false).toBe(false);
  });
  it("Lonely Poro remembers whether it died alone", () => {
    for (const other of [false, true]) {
      const s = fixture(),
        poro = unit(36);
      s.units = [poro];
      if (other) s.units.push(unit(159));
      const end = kill(s, poro.id);
      expect(end.players[0].hand).toHaveLength(other ? 0 : 1);
    }
  });
  it("Ribbon Dancer must choose another ally and Stellacorn Herder draws after moving", () => {
    const s = fixture(),
      dancer = unit(38),
      ally = unit(159);
    dancer.location = "field:0";
    s.units = [dancer, ally];
    const end = resolve(s, 38, scripts[id(38)].onMove!, ally.id, dancer.id);
    expect(end.units[0].temporaryMight).toBe(0);
    expect(end.units[1].temporaryMight).toBe(1);
    const t = fixture(),
      herder = unit(48);
    t.units = [herder];
    expect(
      resolve(t, 48, scripts[id(48)].onMove!, undefined, herder.id).players[0]
        .hand,
    ).toHaveLength(1);
  });
  it("does not advertise Royal Entourage before legend targets can be finalized", () => {
    expect(scripts[id(39)]).toBeUndefined();
    // Royal Entourage is implemented by the later wave3 finalization module.
  });
  it("Apprentice Smith draws a revealed gear and recycles a revealed non-gear", () => {
    for (const cardId of [id(52), ogn(49)]) {
      const s = fixture(),
        smith = unit(41);
      s.units = [smith];
      s.players[0].deck = [cardId, ogn(88)];
      const end = resolve(s, 41, scripts[id(41)].onMove!, undefined, smith.id);
      expect(end.players[0].hand).toEqual(cardId === id(52) ? [cardId] : []);
      expect(
        end.log.some((l) => l.text.includes(`reveals ${getCard(cardId).name}`)),
      ).toBe(true);
      expect(end.players[0].deck[0]).toBe(ogn(88));
      if (cardId === ogn(49)) expect(end.players[0].deck.at(-1)).toBe(cardId);
    }
  });
  it("Simian Ancestor readies when newly buffed", () => {
    const s = fixture(),
      ancestor = unit(47);
    ancestor.ready = false;
    s.units = [ancestor];
    const end = resolve(
      s,
      47,
      [{ type: "buff", target: "friendlyUnit" }],
      ancestor.id,
    );
    expect(end.units[0].ready).toBe(true);
    expect(end.units[0].buff).toBe(1);
  });
  it("Heart of Dark Ice exhausts to grant three temporary Might", () => {
    const s = fixture(),
      u = unit(159);
    s.units = [u];
    let end = play(s, 52);
    const a = getLegalActions(end, 0).find(
      (a) =>
        a.cardId === id(52) && a.category === "ability" && a.targetId === u.id,
    )!;
    end = settle(applyAction(end, a));
    expect(end.units[0].temporaryMight).toBe(3);
    expect(end.gears[0].ready).toBe(false);
  });
  it("Ornn draws a chosen gear from top four and randomizes the rest on the bottom", () => {
    const s = fixture();
    s.players[0].deck = [ogn(49), id(52), ogn(88), id(95), ogn(13)];
    const end = play(s, 58, undefined, false, (a) =>
      a.find((a) => a.id.endsWith("ornn:3")),
    );
    expect(end.players[0].hand).toEqual([id(95)]);
    expect(
      end.log.some((l) => l.text.includes(`reveals ${getCard(id(95)).name}`)),
    ).toBe(true);
    expect(
      end.log.some((l) => l.text.includes(`reveals ${getCard(id(52)).name}`)),
    ).toBe(false);
    expect(end.players[0].deck[0]).toBe(ogn(13));
    expect(end.players[0].deck.slice(1).sort()).toEqual(
      [ogn(49), id(52), ogn(88)].sort(),
    );
    expect(end.rng).not.toBe(s.rng);
  });
  it("Gearhead doubles attached base Might bonuses", () => {
    const s = fixture(),
      head = unit(68);
    s.units = [head];
    s.gears = [
      {
        id: "sword",
        cardId: id(161),
        owner: 0,
        ready: true,
        attachedTo: head.id,
      },
      { id: "misc", cardId: id(52), owner: 0, ready: true },
    ];
    head.gear = ["sword"];
    expect(getMight(s, head)).toBe(getCard(id(68)).might! + 6);
  });
  it("Dropboarder requires two friendly gear", () => {
    for (const count of [1, 2]) {
      const s = fixture();
      s.gears = Array.from({ length: count }, (_, i) => ({
        id: `g${i}`,
        cardId: id(52),
        owner: 0 as const,
        ready: true,
      }));
      expect(play(s, 72).units[0].ready).toBe(count === 2);
    }
  });
  it("Buhru Captain offers draw or self-buff; Sea Monkey buffs only with payment", () => {
    const draw = play(fixture(), 91);
    expect(draw.players[0].hand).toHaveLength(1);
    const buff = play(fixture(), 91, undefined, false, (a) =>
      a.find((a) => a.id.endsWith("buhru-buff")),
    );
    expect(buff.units[0].buff).toBe(1);
    expect(buff.players[0].hand).toHaveLength(0);
    expect(play(fixture(), 98).units[0].buff).toBe(0);
    expect(play(fixture(), 98, undefined, true).units[0].buff).toBe(1);
  });
  it.each([false, true])(
    "Buhru's optional trigger is accepted or declined before opponents respond (decline=%s)",
    (decline) => {
      const s = fixture();
      s.players[0].hand = [id(91)];
      const playAction = getLegalActions(s, 0).find(
        (a) => a.cardId === id(91) && a.locationId === "base:0",
      )!;
      let end = applyAction(s, playAction);
      expect(end.pendingChoice?.kind).toBe("trigger");
      expect(end.players[0].hand).toHaveLength(0);
      expect(end.units[0].buff).toBe(0);
      const decision = getLegalActions(end, 0).find((a) =>
        decline
          ? a.id === "choose-trigger:skip"
          : a.id !== "choose-trigger:skip",
      )!;
      end = applyAction(end, decision);
      if (!decline) {
        expect(end.stack.at(-1)?.kind).toBe("trigger");
        expect(end.players[0].hand).toHaveLength(0);
      }
      end = settle(end);
      expect(end.players[0].hand).toHaveLength(decline ? 0 : 1);
    },
  );
  it("Direwing enters ready only with another Dragon", () => {
    expect(play(fixture(), 94).units[0].ready).toBe(false);
    const s = fixture(),
      dragon = unit(94);
    s.units = [dragon];
    expect(play(s, 94).units.at(-1)?.ready).toBe(true);
  });
  it("Yordle Explorer draws when a card with printed Power >=2 is played", () => {
    const s = fixture(),
      explorer = unit(100);
    s.units = [explorer];
    const n = [12, 55, 85].find((n) => getCard(id(n)).power! >= 2)!;
    const end = play(s, n);
    expect(end.players[0].hand.length).toBeGreaterThanOrEqual(1);
  });
  it("Ruin Runner cannot be chosen by enemy spells and stays protected across turns", () => {
    let end = play(fixture(), 105);
    expect(end.units[0].untargetableByEnemy).toBe(true);
    end = settle(applyAction(end, "end-turn"));
    end.players[1].hand = [ogn(229)];
    end.players[1].energy = 50;
    end.players[1].power = 50;
    expect(
      getLegalActions(end, 1).some(
        (a) => a.cardId === ogn(229) && a.targetId === end.units[0].id,
      ),
    ).toBe(false);
  });
  it("Treasure Hunter, Eminent Benefactor and Honest Broker create exhausted Gold", () => {
    for (const [n, hook, count] of [
      [130, "onMove", 1],
      [152, "onHold", 2],
      [155, "onDeath", 1],
    ] as const) {
      const s = fixture(),
        u = unit(n);
      s.units = [u];
      const end =
        hook === "onDeath"
          ? kill(s, u.id)
          : resolve(s, n, scripts[id(n)][hook]!, undefined, u.id);
      expect(end.gears).toHaveLength(count);
      expect(end.gears.every((g) => g.token && !g.ready)).toBe(true);
    }
  });
  it("Ancient Warmonger gains Assault for each enemy here and Trusty Ramhound needs a local ally", () => {
    const s = fixture(),
      warm = unit(131),
      ram = unit(159),
      a = unit(159, 1),
      b = unit(159, 1, "b");
    warm.location = ram.location = a.location = b.location = "field:0";
    s.units = [warm, ram, a, b];
    combat(s);
    expect(getMight(s, warm)).toBe(getCard(id(131)).might! + 2);
    expect(getMight(s, ram)).toBe(getCard(id(159)).might! + 1);
    ram.location = "field:1";
    expect(getMight(s, ram)).toBe(getCard(id(159)).might);
  });
  it("Factory Recall returns equipment and detaches it; Downwell returns all units and gear", () => {
    const s = fixture(),
      u = unit(159);
    s.units = [u];
    u.gear = ["g"];
    s.gears = [
      { id: "g", cardId: id(161), owner: 1, ready: true, attachedTo: u.id },
    ];
    const recalled = play(structuredClone(s), 135, "g");
    expect(recalled.units[0].gear).toEqual([]);
    expect(recalled.players[1].hand).toContain(id(161));
    const all = play(s, 147);
    expect(all.units).toHaveLength(0);
    expect(all.gears).toHaveLength(0);
    expect(all.players[0].hand).toContain(id(159));
    expect(all.players[1].hand).toContain(id(161));
  });
  it("Sandshifter kills only small enemies and Blood Money creates one or two Gold", () => {
    const s = fixture(),
      small = unit(159, 1);
    small.baseMightOverride = 2;
    s.units = [small];
    expect(play(s, 158).units.some((u) => u.id === small.id)).toBe(false);
    for (const owner of [0, 1] as const) {
      const t = fixture(),
        victim = unit(159, owner);
      victim.baseMightOverride = 2;
      victim.location = "field:0";
      t.units = [victim];
      const end = play(t, 162, victim.id);
      expect(end.gears.filter((g) => g.token)).toHaveLength(
        owner === 0 ? 2 : 1,
      );
    }
  });
  it("Rally buffs subsequently played units and expires with the turn", () => {
    let s = play(fixture(), 166);
    s = play(s, 159);
    expect(s.units[0].buff).toBe(1);
    const next = settle(applyAction(s, "end-turn"));
    next.currentPlayer = next.priorityPlayer = next.focusPlayer = 0;
    next.players[0].energy = 50;
    next.players[0].power = 50;
    expect(play(next, 159).units.at(-1)?.buff).toBe(0);
  });
  it("Vanguard Armory creates three Recruits and Renata makes unit and Gold tokens enter ready", () => {
    const s = fixture(),
      renata = unit(171);
    s.units = [renata];
    let end = play(s, 168);
    const a = getLegalActions(end, 0).find(
      (a) => a.cardId === id(168) && a.category === "ability",
    )!;
    end = settle(applyAction(end, a));
    expect(end.units.filter((u) => u.token)).toHaveLength(3);
    expect(end.units.filter((u) => u.token).every((u) => u.ready)).toBe(true);
    end = play(end, 174);
    expect(end.gears.filter((g) => g.token)).toHaveLength(4);
    expect(end.gears.filter((g) => g.token).every((g) => g.ready)).toBe(true);
  });
  it("Xin Zhao enters ready with two other friendly units in base and Corina creates local Recruits on battlefield movement", () => {
    const s = fixture();
    s.units = [unit(159), unit(159, 0, "b")];
    expect(play(s, 176).units.at(-1)?.ready).toBe(true);
    expect(play(fixture(), 176).units[0].ready).toBe(false);
    const t = fixture(),
      corina = unit(179);
    corina.location = "field:0";
    t.units = [corina];
    const end = resolve(t, 179, scripts[id(179)].onMove!, undefined, corina.id);
    expect(end.units.filter((u) => u.token)).toHaveLength(3);
    expect(end.units.every((u) => u.location === "field:0")).toBe(true);
  });
  it("Lucian legend grants Assault for each attached Equipment", () => {
    const s = fixture(),
      u = unit(159);
    u.location = "field:0";
    u.gear = ["a", "b"];
    s.units = [u];
    s.gears = [
      { id: "a", cardId: id(161), owner: 0, ready: true, attachedTo: u.id },
      { id: "b", cardId: id(95), owner: 0, ready: true, attachedTo: u.id },
    ];
    s.players[0].legendId = id(183);
    const before = getMight(s, u);
    combat(s);
    expect(getMight(s, u)).toBe(before + 2);
  });
  it("On the Hunt readies all friendly units without readying enemies", () => {
    const s = fixture(),
      a = unit(159),
      b = unit(159, 0, "b"),
      enemy = unit(159, 1);
    a.ready = b.ready = enemy.ready = false;
    s.units = [a, b, enemy];
    expect(play(s, 204).units.map((u) => u.ready)).toEqual([true, true, false]);
  });
  it.each([210, 214])(
    "does not advertise leading trigger costs paid at resolution (%i)",
    (n) => {
      expect(scripts[id(n)]).toBeUndefined();
      // These leading costs are supplied by the later wave3 module.
    },
  );
  it("Seat of Power draws for other controlled battlefields and Papertree channels for both players", () => {
    const s = fixture();
    s.fields[0].controller = s.fields[1].controller = 0;
    s.stack.push({
      id: "seat",
      player: 0,
      cardId: id(217),
      kind: "trigger",
      locationId: "field:0",
      effects: scripts[id(217)].onConquer!,
    });
    const end = settle(s);
    expect(end.players[0].hand).toHaveLength(1);
    const runes = resolve(end, 219, scripts[id(219)].onHold!);
    expect(runes.players.map((p) => p.runes.length)).toEqual([1, 1]);
    expect(runes.players.every((p) => !p.runes[0].ready)).toBe(true);
  });
  it.each([2, 8, 85, 92, 127])(
    "does not advertise Weaponmaster before equipment targets can be finalized (%i)",
    (n) => {
      expect(scripts[id(n)]).toBeUndefined();
      expect(getScript(id(n))?.implemented ?? false).toBe(false);
    },
  );
  it("Downwell returns all units simultaneously before loss of aura can kill a wounded unit", () => {
    const s = fixture(),
      friend = unit(48),
      ram = unit(159);
    ram.damage = 2;
    s.units = [friend, ram];
    expect(getMight(s, ram)).toBe(3);
    const end = play(s, 147);
    expect(end.players[0].hand).toEqual(
      expect.arrayContaining([friend.cardId, ram.cardId]),
    );
    expect(end.players[0].discard).not.toContain(ram.cardId);
    expect(end.units).toHaveLength(0);
  });
  it("Draven legend draws for winning engaged combat, never for an uncontested conquest", () => {
    let s = fixture();
    s.players[0].legendId = id(185);
    const fighter = unit(159);
    s.units = [fighter];
    const move = getLegalActions(s, 0).find(
      (a) => a.id.startsWith("move-start:") && a.locationId === "field:0",
    )!;
    s = applyAction(s, move);
    s = applyAction(s, "move-confirm");
    s = applyAction(s, "pass");
    s = applyAction(s, "pass");
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.stack).toHaveLength(0);
  });
  it("each resolved Rally the Troops creates an independent delayed buff trigger", () => {
    let s = play(fixture(), 166);
    s = play(s, 166);
    s.players[0].hand.push(id(159));
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === id(159) &&
        a.category === "play" &&
        a.locationId === "base:0",
    )!;
    const played = applyAction(s, a);
    expect(
      played.stack.filter((i) => i.effects.some((e) => e.type === "buff")),
    ).toHaveLength(2);
    expect(settle(played).units[0].buff).toBe(1);
  });
  it("Needlessly Large Yordle discounts Energy and Power for points from holding this turn", () => {
    let s = fixture();
    const holder = unit(159);
    holder.location = "field:0";
    s.units = [holder];
    s.fields[0].controller = 0;
    s = settle(applyAction(s, "end-turn"));
    s = settle(applyAction(s, "end-turn"));
    expect(s.players[0].points).toBe(1);
    s.players[0].energy = 50;
    s.players[0].power = 50;
    s.players[0].runes = [];
    const end = play(s, 55);
    expect(end.players[0].energy).toBe(
      50 - Math.max(0, getCard(id(55)).energy! - 2),
    );
    expect(end.players[0].power).toBe(
      50 - Math.max(0, getCard(id(55)).power! - 1),
    );
  });
  it("Draven legend draws when its units actually win engaged combat", () => {
    let s = fixture();
    s.players[0].legendId = id(185);
    const fighter = unit(159),
      enemy = unit(159, 1);
    enemy.baseMightOverride = 1;
    enemy.location = "field:0";
    s.units = [fighter, enemy];
    s.fields[0].controller = 1;
    const move = getLegalActions(s, 0).find(
      (a) => a.id.startsWith("move-start:") && a.locationId === "field:0",
    )!;
    s = applyAction(s, move);
    s = applyAction(s, "move-confirm");
    for (
      let i = 0;
      i < 30 && (s.combat || s.stack.length || s.pendingChoice);
      i++
    ) {
      const a = getLegalActions(s, s.priorityPlayer);
      const next =
        a.find((a) => a.id.startsWith("damage:") && a.targetId === enemy.id) ??
        a.find((a) => a.id.startsWith("damage:")) ??
        a.find((a) => a.id === "damage-done") ??
        a.find((a) => a.category === "pass") ??
        a[0];
      expect(next).toBeDefined();
      s = applyAction(s, next);
    }
    expect(s.units.some((u) => u.id === enemy.id)).toBe(false);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it.each([13, 67])(
    "paid target choices enter the chain before opponents can respond (%i)",
    (n) => {
      const s = fixture(),
        foe = unit(85, 1);
      foe.location = "field:0";
      foe.baseMightOverride = 30;
      s.units = [foe];
      s.players[0].hand = [id(n)];
      const a = getLegalActions(s, 0).find(
        (a) =>
          a.cardId === id(n) &&
          a.additionalCostPaid &&
          a.locationId === "base:0",
      )!;
      let end = applyAction(s, a);
      if (end.pendingChoice) {
        const target = getLegalActions(end, 0).find(
          (a) => a.targetId === foe.id,
        )!;
        end = applyAction(end, target);
      }
      expect(end.stack.at(-1)?.targetId).toBe(foe.id);
      expect(end.units.find((u) => u.id === foe.id)?.damage).toBe(0);
      expect(end.units.find((u) => u.id === foe.id)?.temporaryMight).toBe(0);
      end.players[1].hand = [ogn(104)];
      end = applyAction(end, "pass");
      const retreat = getLegalActions(end, 1).find(
        (a) =>
          a.category === "play" &&
          a.cardId === ogn(104) &&
          a.targetId === foe.id,
      )!;
      expect(retreat).toBeDefined();
      end = settle(applyAction(end, retreat));
      expect(end.units.some((u) => u.id === foe.id)).toBe(false);
      expect(end.players[1].hand).toContain(foe.cardId);
    },
  );
  it("Pickpocket chooses an eligible gear before its trigger resolves and makes no Gold if it disappears", () => {
    const s = fixture();
    s.gears = [{ id: "g", cardId: id(108), owner: 1, ready: true }];
    s.players[0].hand = [id(74)];
    let end = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) =>
          a.cardId === id(74) &&
          a.category === "play" &&
          a.locationId === "base:0",
      )!,
    );
    expect(end.pendingChoice?.kind).toBe("trigger");
    end = applyAction(
      end,
      getLegalActions(end, 0).find((a) => a.targetId === "g")!,
    );
    expect(end.stack.at(-1)?.targetId).toBe("g");
    expect(end.gears).toHaveLength(1);
    end.gears = [];
    end = settle(end);
    expect(end.gears).toHaveLength(0);
  });
  it("Ribbon Dancer announces another ally as target before its movement trigger resolves", () => {
    let s = fixture();
    const dancer = unit(38),
      ally = unit(159);
    s.units = [dancer, ally];
    const move = getLegalActions(s, 0).find(
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === dancer.id &&
        a.locationId === "field:0",
    )!;
    s = applyAction(s, move);
    s = applyAction(s, "move-confirm");
    if (s.pendingChoice) {
      const options = getLegalActions(s, 0);
      expect(options.some((a) => a.targetId === dancer.id)).toBe(false);
      s = applyAction(
        s,
        options.find((a) => a.targetId === ally.id)!,
      );
    }
    expect(s.stack.some((i) => i.targetId === ally.id)).toBe(true);
    expect(s.units.find((u) => u.id === ally.id)?.temporaryMight).toBe(0);
    s = settle(s);
    expect(s.units.find((u) => u.id === ally.id)?.temporaryMight).toBe(1);
  });
});
