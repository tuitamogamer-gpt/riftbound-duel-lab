import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  getCombatPreview,
  getCombatPower,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import {
  unleashedWave3Module,
  unleashedWave3Scripts,
} from "../src/game/unleashed-wave3";
import type {
  GameAction,
  GameState,
  LocationId,
  Unit,
} from "../src/game/types";

const card = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function position(): GameState {
  const s = createGame({ seed: 913 });
  Object.assign(s, {
    phase: "main",
    turn: 5,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    units: [],
    gears: [],
    stack: [],
    hidden: [],
    combat: null,
    pendingChoice: null,
    pendingTriggers: [],
  });
  for (const p of s.players) {
    Object.assign(p, {
      hand: [],
      discard: [],
      banished: [],
      energy: 40,
      power: 40,
      points: 0,
      xp: 0,
      championAvailable: false,
      legendId: "unl-191-219",
      hasBegun: true,
      deck: Array(30).fill("ogn-049-298"),
      runes: [],
      runeDeck: ["Mind", "Body", "Fury"],
    });
  }
  for (const field of s.fields) {
    field.controller = null;
    field.cardId = "ogn-280-298";
  }
  return s;
}
function unit(
  s: GameState,
  c: string | number,
  uid: string,
  owner: 0 | 1 = 0,
  location: LocationId = `base:${owner}`,
): Unit {
  const u: Unit = {
    id: uid,
    cardId: typeof c === "number" ? card(c) : c,
    owner,
    location,
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
  s.units.push(u);
  return u;
}
function take(
  s: GameState,
  select: string | ((a: GameAction) => boolean),
): GameState {
  const legal = getLegalActions(s, s.priorityPlayer);
  const action = legal.find(
    typeof select === "string" ? (a) => a.id === select : select,
  );
  expect(
    action,
    `Missing action ${String(select)} in ${s.phase}: ${legal.map((a) => a.id).join(", ")}`,
  ).toBeDefined();
  return applyAction(s, action!);
}
function settle(s: GameState): GameState {
  for (
    let i = 0;
    i < 120 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  )
    s = take(s, s.pendingChoice ? () => true : "pass");
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(s: GameState, c: number | string, targetId?: string): GameState {
  const cid = typeof c === "number" ? card(c) : c;
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cid &&
      (targetId === undefined || a.targetId === targetId) &&
      !a.repeated &&
      !a.id.includes("accelerate") &&
      !a.id.includes("additional"),
  );
}
function cast(s: GameState, c: number | string, targetId?: string): GameState {
  s.players[s.priorityPlayer].hand.push(typeof c === "number" ? card(c) : c);
  return settle(play(s, c, targetId));
}
function reachChoice(s: GameState): GameState {
  for (let i = 0; i < 30 && !s.pendingChoice; i++) s = take(s, "pass");
  expect(s.pendingChoice).not.toBeNull();
  return s;
}
function begin(s: GameState): GameState {
  s.currentPlayer = 1;
  s.priorityPlayer = 1;
  s.focusPlayer = 1;
  return take(s, "end-turn");
}
function attack(
  s: GameState,
  uid: string,
  locationId = s.fields[0].id,
): GameState {
  s = take(
    s,
    (a) =>
      a.category === "move" &&
      a.sourceId === uid &&
      a.locationId === locationId,
  );
  return take(s, "move-confirm");
}
function finishCombat(s: GameState): GameState {
  for (
    let i = 0;
    i < 50 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const next =
      actions.find((a) => a.id.startsWith("damage:")) ??
      actions.find((a) => a.id === "damage-done") ??
      actions.find((a) => a.id === "pass") ??
      actions[0];
    expect(next).toBeDefined();
    s = applyAction(s, next);
  }
  expect(s.combat).toBeNull();
  return s;
}
function tribes(s: GameState) {
  unit(s, "token-bird", "bird").token = true;
  unit(s, 56, "cat");
  unit(s, 16, "dog");
  unit(s, "ogn-013-298", "poro");
}

describe("Unleashed third execution wave", () => {
  it.each(
    Object.keys(unleashedWave3Scripts).filter((cid) =>
      ["Unit", "Spell", "Gear"].includes(getCard(cid).type),
    ),
  )("can play registered complete face %s", (cid) => {
    let s = position();
    unit(s, 98, "friend", 0, s.fields[0].id);
    unit(s, 98, "enemy", 1, s.fields[1].id);
    s.players[0].hand = [cid];
    s.fields[0].controller = 0;
    s.fields[1].controller = 1;
    if (cid === card(190))
      s.stack.push({
        id: "opponent-spell",
        player: 1,
        cardId: card(91),
        effects: [{ type: "draw", amount: 2 }],
        kind: "spell",
      });
    expect(getScript(cid)?.implemented).toBe(true);
    s = settle(play(s, cid));
    expect(
      s.log.some((entry) =>
        /not scripted|unsupported effect|unknown effect/i.test(entry.text),
      ),
    ).toBe(false);
    if (getCard(cid).type === "Spell")
      expect(s.players[0].discard).toContain(cid);
    else
      expect(
        [...s.units, ...s.gears].some((source) => source.cardId === cid),
      ).toBe(true);
  });

  it("read-only might, keywords, costs and legal actions do not initialize expansion state", () => {
    const s = position();
    const u = unit(s, 59, "yi");
    s.players[0].xp = 16;
    s.players[0].hand = [card(196)];
    const before = JSON.stringify(s);
    getMight(s, u);
    getKeywords(s, u);
    getLegalActions(s, 0);
    getCombatPreview(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("Icevale chooses its target and pays the Energy before its trigger can be answered", () => {
    let s = position();
    unit(s, 65, "archer");
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s = attack(s, "archer");
    expect(s.pendingChoice).not.toBeNull();
    expect(s.players[0].energy).toBe(40);
    expect(getLegalActions(s, 0).some((a) => a.targetId === "archer")).toBe(
      true,
    );
    s = take(s, (a) => a.targetId === "enemy");
    expect(s.players[0].energy).toBe(39);
    expect(s.units.find((u) => u.id === "enemy")?.temporaryMight).toBe(0);
    expect(s.stack.at(-1)?.targetId).toBe("enemy");
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.temporaryMight).toBe(-1);
  });

  it("declining a leading payment neither spends Energy nor creates the effect", () => {
    let s = position();
    unit(s, 137, "poro");
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s = attack(s, "poro");
    s = take(s, (a) => /skip|decline/i.test(a.id + a.label));
    expect(s.players[0].energy).toBe(40);
    expect(s.stack).toHaveLength(0);
    expect(s.units.find((u) => u.id === "enemy")?.location).toBe(
      s.fields[0].id,
    );
  });

  it("Sinister Poro pays before moving the announced enemy to its base", () => {
    let s = position();
    unit(s, 137, "poro");
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s = attack(s, "poro");
    s = take(s, (a) => a.targetId === "enemy");
    expect(s.players[0].energy).toBe(39);
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.location).toBe("base:1");
  });

  it("Kha'Zix spends XP at finalization but deals no damage if killed in response", () => {
    let s = position();
    s.players[0].xp = 3;
    unit(s, 119, "hunter");
    unit(s, 171, "enemy", 1, s.fields[0].id);
    s = attack(s, "hunter");
    s = take(s, (a) => a.targetId === "enemy");
    expect(s.players[0].xp).toBe(0);
    s.stack.push({
      id: "kill-answer",
      player: 1,
      cardId: "ogs-012-024",
      kind: "spell",
      targetId: "hunter",
      effects: [{ type: "kill", target: "enemyUnit" }],
    });
    s.priorityPlayer = 1;
    s = settle(s);
    expect(s.units.some((u) => u.id === "hunter")).toBe(false);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(0);
  });

  it("Fresh Beans exhausts at finalization and draws only when the chosen trigger resolves", () => {
    let s = position();
    const field = s.fields[0];
    unit(s, 98, "holder", 0, field.id);
    unit(s, 98, "enemy", 1, field.id);
    s.phase = "showdown";
    s.combat = {
      fieldId: field.id,
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      designatedUnits: ["holder", "enemy"],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s.gears = [{ id: "beans", cardId: card(11), owner: 0, ready: true }];
    s.players[0].hand = [card(94)];
    s = play(s, 94);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.gears[0].ready).toBe(true);
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].hand).toHaveLength(0);
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Daisy discounts one per distinct tribe and announces her attack target only with all four", () => {
    let s = position();
    tribes(s);
    expect(unleashedWave3Module.cost!(s, 0, getCard(card(196)))).toEqual({
      energy: -4,
    });
    s = cast(s, 196);
    const daisy = s.units.find((u) => u.cardId === card(196))!;
    expect(daisy.ready).toBe(true);
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s = attack(s, daisy.id);
    expect(
      s.stack.some(
        (item) => item.targetId === "enemy" && item.cardId === card(196),
      ),
    ).toBe(true);
    s.units = s.units.filter((u) => u.id !== "dog");
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.stunned).toBe(true);
    const missing = position();
    unit(missing, 196, "daisy");
    unit(missing, 98, "enemy", 1, missing.fields[0].id);
    const after = attack(missing, "daisy");
    expect(after.stack.some((item) => item.cardId === card(196))).toBe(false);
  });

  it("Katarina readies after hiding and deals damage after a face-down play resolves", () => {
    let s = position();
    unit(s, 23, "kat").ready = false;
    unit(s, 98, "holder", 0, s.fields[0].id);
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s.fields[0].controller = 0;
    s.players[0].hand = [card(3)];
    s = take(s, (a) => a.cardId === card(3) && a.id.startsWith("hide:"));
    s = settle(s);
    expect(s.units.find((u) => u.id === "kat")?.ready).toBe(true);
    s.hidden![0].hiddenTurn = s.turn - 1;
    s = play(s, 3);
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(4);
  });

  it("Shadow Watcher remembers a Beginning death, but not an ordinary death or a previous turn", () => {
    let s = position();
    unit(s, 92, "temporary").temporary = true;
    s = settle(begin(s));
    s.players[0].energy = 40;
    s.players[0].power = 40;
    s = cast(s, 37);
    expect(s.units.find((u) => u.cardId === card(37))?.ready).toBe(true);
    s = position();
    s = cast(s, 37);
    expect(s.units[0].ready).toBe(false);
  });

  it("Honeyfruit enters exhausted and offers the upgraded immediate resource ability only at Level 6", () => {
    let s = position();
    s = cast(s, 49);
    const g = s.gears[0];
    expect(g.ready).toBe(false);
    g.ready = true;
    expect(
      getLegalActions(s, 0).some((a) => a.abilityKey === "honey-both"),
    ).toBe(false);
    s.players[0].xp = 6;
    const energy = s.players[0].energy;
    const power = s.players[0].power!;
    s = take(s, (a) => a.abilityKey === "honey-both");
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].energy).toBe(energy + 1);
    expect(s.players[0].power).toBe(power + 1);
    expect(s.stack).toHaveLength(0);
  });

  it("Yi's tiered reductions and final enemy protection are dynamic", () => {
    const s = position();
    const yi = unit(s, 59, "yi", 1);
    for (const [level, steps] of [
      [0, 0],
      [3, 1],
      [6, 2],
      [11, 3],
      [16, 3],
    ]) {
      s.players[1].xp = level;
      expect(unleashedWave3Module.cost!(s, 1, getCard(card(59)))).toEqual({
        energy: -2 * steps,
        power: -steps,
      });
      expect(getKeywords(s, yi).includes("Untargetable")).toBe(level >= 16);
    }
    s.players[0].hand = [card(63)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.targetId === yi.id && a.cardId === card(63),
      ),
    ).toBe(false);
    s.players[1].xp = 15;
    expect(
      getLegalActions(s, 0).some(
        (a) => a.targetId === yi.id && a.cardId === card(63),
      ),
    ).toBe(true);
  });

  it("Alpha Wildclaw protects only smaller allies at its location", () => {
    const s = position();
    const alpha = unit(s, 57, "alpha", 1, s.fields[0].id);
    const small = unit(s, 92, "small", 1, s.fields[0].id);
    const away = unit(s, 92, "away", 1);
    expect(getKeywords(s, small)).toContain("Untargetable");
    expect(getKeywords(s, alpha)).not.toContain("Untargetable");
    expect(getKeywords(s, away)).not.toContain("Untargetable");
    small.temporaryMight = getMight(s, alpha) - getMight(s, small);
    expect(getKeywords(s, small)).not.toContain("Untargetable");
  });

  it("Vilemaw suppresses only lower-Might enemy combat damage without changing Might", () => {
    const s = position();
    const f = s.fields[0];
    unit(s, 60, "vilemaw", 1, f.id);
    const enemy = unit(s, 92, "enemy", 0, f.id);
    const ally = unit(s, 92, "ally", 1, f.id);
    s.combat = {
      fieldId: f.id,
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getMight(s, enemy)).toBeGreaterThan(0);
    expect(getCombatPower(s, enemy)).toBe(0);
    expect(getCombatPower(s, ally)).toBe(getMight(s, ally));
    s.units = s.units.filter((u) => u.id !== "vilemaw");
    expect(getCombatPower(s, enemy)).toBe(getMight(s, enemy));
  });

  it("Deadly Flourish creates exhausted Gold even if its own damage kills the target", () => {
    let s = position();
    unit(s, 92, "enemy", 1);
    s = cast(s, 73, "enemy");
    expect(s.units.some((u) => u.id === "enemy")).toBe(false);
    expect(s.gears).toHaveLength(1);
    expect(s.gears[0]).toMatchObject({ owner: 0, ready: false, token: true });
  });

  it("Deadly Flourish's later death mark survives saves and expires after the turn", () => {
    for (const expire of [false, true]) {
      let s = position();
      unit(s, 171, "enemy", 1);
      s = cast(s, 73, "enemy");
      s = JSON.parse(JSON.stringify(s));
      if (expire) {
        s = take(s, "end-turn");
        s = settle(s);
        s.currentPlayer = 0;
        s.priorityPlayer = 0;
        s.focusPlayer = 0;
        s.players[0].energy = 40;
        s.players[0].power = 40;
      }
      s = cast(s, 180);
      expect(s.gears.filter((g) => g.token)).toHaveLength(expire ? 0 : 1);
    }
  });

  it("Frigid Jewel triggers exactly once when a two-card draw crosses the second draw", () => {
    let s = position();
    unit(s, 98, "friend");
    s.gears = [{ id: "jewel", cardId: card(74), owner: 0, ready: true }];
    s = cast(s, 91);
    expect(s.units[0].temporaryMight).toBe(2);
    s = cast(s, 91);
    expect(s.units[0].temporaryMight).toBe(2);
  });

  it("Diana pays during resolution, then Predicts before revealing and drawing the new top spell", () => {
    let s = position();
    unit(s, 79, "diana");
    s.players[0].deck = [card(91), card(98)];
    s = attack(s, "diana");
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(s.players[0].energy).toBe(40);
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    expect(s.players[0].energy).toBe(40);
    s = reachChoice(s);
    expect(s.players[0].energy).toBe(39);
    expect(s.pendingChoice?.kind).toBe("predict");
    s = take(s, (a) => /keep/i.test(a.label));
    s = settle(s);
    expect(s.players[0].hand).toEqual([card(91)]);
    expect(
      s.log.some((entry) => entry.text.includes("reveals Concentrate")),
    ).toBe(true);
  });

  it("Sumpworks Map triggers on opposing scores and dies at its owner's next Beginning", () => {
    let s = position();
    s = cast(s, 85);
    expect(s.gears[0].temporary).toBe(true);
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.focusPlayer = 1;
    unit(s, 98, "opponent", 1);
    s = attack(s, "opponent");
    s = finishCombat(s);
    expect(s.players[0].hand).toHaveLength(1);
    s = settle(take(s, "end-turn"));
    expect(s.gears).toHaveLength(0);
  });

  it("Gutter Palace checks its exact condition at Beginning, then wins through a responseable trigger", () => {
    let s = position();
    s.gears = [{ id: "palace", cardId: card(88), owner: 0, ready: true }];
    s.players[0].hand = Array(4).fill(card(92));
    for (let i = 0; i < 4; i++) unit(s, 98, `unit-${i}`, 0, s.fields[i % 2].id);
    s = begin(s);
    expect(s.winner).toBeNull();
    expect(s.stack.some((item) => item.cardId === card(88))).toBe(true);
    s.players[0].hand.pop();
    s = settle(s);
    expect(s.winner).toBe(0);
  });

  it("Gutter Palace pays discard and exhaust before its Bird ability resolves", () => {
    let s = position();
    s.gears = [{ id: "palace", cardId: card(88), owner: 0, ready: true }];
    s.players[0].hand = [card(92), card(98)];
    s = take(s, (a) => a.abilityKey === "palace-bird" && a.amount === 1);
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].discard).toContain(card(98));
    expect(s.units).toHaveLength(0);
    s = settle(s);
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
  });

  it("Grim Resolve pays out only for its marked unit remaining after a combat", () => {
    let s = position();
    unit(s, 98, "friend");
    unit(s, "ogn-271-298", "enemy", 1, s.fields[0].id).token = true;
    s = cast(s, 95, "friend");
    expect(s.units[0].temporaryMight).toBe(3);
    s = attack(s, "friend");
    s = finishCombat(s);
    expect(s.players[0].xp).toBe(2);
  });

  it("Blood Rose pays for XP at trigger finalization and pays XP to ready an announced unit", () => {
    let s = position();
    s.gears = [{ id: "rose", cardId: card(109), owner: 0, ready: true }];
    s.players[0].hand = [card(98)];
    s = play(s, 98);
    const before = s.players[0].energy;
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    expect(s.players[0].energy).toBe(before - 1);
    expect(s.players[0].xp).toBe(0);
    s = settle(s);
    expect(s.players[0].xp).toBe(1);
    s.players[0].xp = 3;
    const uid = s.units[0].id;
    s.units[0].ready = false;
    s = take(s, (a) => a.abilityKey === "rose-ready" && a.targetId === uid);
    expect(s.players[0].xp).toBe(0);
    expect(s.gears[0].ready).toBe(false);
    expect(s.units[0].ready).toBe(false);
    s = settle(s);
    expect(s.units[0].ready).toBe(true);
  });

  it("Rengar can Ambush an enemy-occupied battlefield without friendly units there", () => {
    let s = position();
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s.fields[0].controller = 1;
    s.players[0].hand = [card(120)];
    s.stack = [
      {
        id: "enemy-spell",
        player: 1,
        cardId: card(91),
        kind: "spell",
        effects: [{ type: "draw", amount: 2 }],
      },
    ];
    const action = getLegalActions(s, 0).find(
      (a) => a.cardId === card(120) && a.locationId === s.fields[0].id,
    );
    expect(action).toBeDefined();
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === card(120) && a.locationId === s.fields[1].id,
      ),
    ).toBe(false);
    s = settle(applyAction(s, action!));
    expect(
      s.units.some(
        (u) => u.cardId === card(120) && u.location === s.fields[0].id,
      ),
    ).toBe(true);
  });

  it("Pyke's battlefield death trigger creates at most one Gold per turn and ignores simultaneous self-death", () => {
    let s = position();
    unit(s, 145, "pyke", 0, s.fields[0].id);
    unit(s, 92, "a", 1, s.fields[1].id);
    unit(s, 92, "b", 1, s.fields[1].id);
    s = cast(s, 159, "a");
    expect(s.gears.filter((g) => g.token)).toHaveLength(1);
    s = cast(s, 159, "b");
    expect(s.gears.filter((g) => g.token)).toHaveLength(1);
    s = position();
    unit(s, 145, "pyke", 0, s.fields[0].id);
    unit(s, 92, "enemy", 1);
    s = cast(s, 180);
    expect(s.gears).toHaveLength(0);
  });

  it("Shadow's Call cannot select an already-Temporary unit and makes the target temporary before drawing", () => {
    let s = position();
    unit(s, 98, "normal");
    unit(s, 98, "temporary").temporary = true;
    s.players[0].hand = [card(165)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === card(165) && a.targetId === "temporary",
      ),
    ).toBe(false);
    s = settle(play(s, 165, "normal"));
    expect(s.units[0].temporary).toBe(true);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it("Lilting Lullaby counters its chosen spell and prevents new spells by that controller for this turn", () => {
    let s = position();
    s.players[0].hand = [card(91)];
    s = play(s, 91);
    const target = s.stack[0].id;
    s = take(s, "pass");
    s.players[1].hand = [card(190)];
    s = settle(play(s, 190, target));
    s.players[0].hand.push(card(91));
    expect(s.players[0].cannotPlaySpellsTurn).toBe(s.turn);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === card(91) && a.category === "play",
      ),
    ).toBe(false);
  });

  it("Voidreaver gains one XP per combat win and pays its alternative activated costs upfront", () => {
    let s = position();
    s.players[0].legendId = card(201);
    unit(s, 98, "friend");
    unit(s, "ogn-271-298", "enemy", 1, s.fields[0].id).token = true;
    s = attack(s, "friend");
    s = finishCombat(s);
    expect(s.players[0].xp).toBe(1);
    s = take(
      s,
      (a) => a.abilityKey === "legend-buff" && a.targetId === "friend",
    );
    expect(s.players[0].xp).toBe(0);
    expect(s.units[0].buff).toBe(0);
    s = settle(s);
    expect(s.units[0].buff).toBe(1);
    s.players[0].legendUsedTurn = -1;
    s.players[0].xp = 2;
    s.units[0].ready = false;
    s = take(
      s,
      (a) => a.abilityKey === "legend-return" && a.targetId === "friend",
    );
    expect(s.players[0].xp).toBe(0);
    s = settle(s);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Kha'Zix uses current Might and current 'here' when both chosen units move before resolution", () => {
    let s = position();
    s.players[0].xp = 3;
    unit(s, 119, "hunter");
    unit(s, 171, "enemy", 1, s.fields[0].id).temporaryMight = 10;
    s = attack(s, "hunter");
    s = take(s, (a) => a.targetId === "enemy");
    s.units.find((u) => u.id === "hunter")!.location = s.fields[1].id;
    s.units.find((u) => u.id === "hunter")!.temporaryMight = 2;
    s.units.find((u) => u.id === "enemy")!.location = s.fields[1].id;
    const damage = getMight(
      s,
      s.units.find((u) => u.id === "hunter")!,
    );
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(damage);
  });

  it("a targeted leading-cost trigger charges both Energy and Deflect before being saved", () => {
    let s = position();
    unit(s, 65, "archer");
    unit(s, 171, "galio", 1, s.fields[0].id);
    s = attack(s, "archer");
    s = take(s, (a) => a.targetId === "galio");
    expect(s.players[0].energy).toBe(39);
    expect(s.players[0].power).toBe(39);
    s = JSON.parse(JSON.stringify(s));
    s = settle(s);
    expect(s.players[0].energy).toBe(39);
    expect(s.players[0].power).toBe(39);
    expect(s.units.find((u) => u.id === "galio")?.temporaryMight).toBe(-1);
  });

  it("Diana's upfront decline removes the entire sequence without paying", () => {
    let s = position();
    unit(s, 79, "diana");
    s.players[0].deck = [card(91), card(98)];
    s = attack(s, "diana");
    s = reachChoice(s);
    s = take(s, (a) => /skip|decline/i.test(a.id + a.label));
    expect(s.players[0].energy).toBe(40);
    expect(s.stack).toHaveLength(0);
    expect(s.pendingChoice).toBeNull();
    expect(s.players[0].hand).toHaveLength(0);
  });

  it("an ordinary friendly death does not satisfy Shadow Watcher's Beginning requirement", () => {
    let s = position();
    unit(s, 92, "friend", 0, s.fields[0].id);
    s = cast(s, 159, "friend");
    s = cast(s, 37);
    expect(s.units.find((u) => u.cardId === card(37))?.ready).toBe(false);
  });
  it("Rengar keeps normal Ambush permission at a friendly-only battlefield", () => {
    const s = position();
    unit(s, 98, "friend", 0, s.fields[0].id);
    s.fields[0].controller = null;
    s.players[0].hand = [card(120)];
    s.stack = [
      {
        id: "enemy-spell",
        player: 1,
        cardId: card(91),
        kind: "spell",
        effects: [{ type: "draw", amount: 2 }],
      },
    ];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === card(120) && a.locationId === s.fields[0].id,
      ),
    ).toBe(true);
  });

  it.each(["yourself", "your opponent"])(
    "Bewitching Spirit announces %s before the selected player's discard resolves",
    (whom) => {
      let s = position();
      s.players[0].hand = [card(121), card(92)];
      s.players[1].hand = [card(98)];
      s = play(s, 121);
      expect(s.pendingChoice?.kind).toBe("trigger");
      s = take(s, (a) => a.label.startsWith(`Choose ${whom}:`));
      expect(s.players[0].hand).toEqual([card(92)]);
      expect(s.players[1].hand).toEqual([card(98)]);
      expect(s.stack.at(-1)?.effects[0].who).toBe(
        whom === "yourself" ? "self" : "opponent",
      );
      s = settle(s);
      expect(s.players[whom === "yourself" ? 0 : 1].hand).toHaveLength(0);
      expect(s.players[whom === "yourself" ? 1 : 0].hand).toHaveLength(1);
    },
  );

  it("Voidreaver cannot move a target which was readied in response", () => {
    let s = position();
    s.players[0].legendId = card(201);
    s.players[0].xp = 2;
    unit(s, 98, "friend", 0, s.fields[0].id).ready = false;
    s = take(
      s,
      (a) => a.abilityKey === "legend-return" && a.targetId === "friend",
    );
    s.units[0].ready = true;
    s = settle(s);
    expect(s.units[0].location).toBe(s.fields[0].id);
    expect(s.players[0].xp).toBe(0);
  });

  it.each([
    [0, 0],
    [1, 1],
    [0, 1],
  ] as const)(
    "Clash of Giants announces two distinct units owned by %s and %s and deals simultaneous Might damage",
    (firstOwner, secondOwner) => {
      let s = position();
      const a = unit(s, 98, "first", firstOwner),
        b = unit(s, 98, "second", secondOwner);
      a.baseMightOverride = 4;
      b.baseMightOverride = 6;
      s.players[0].hand = [card(110)];
      expect(
        getLegalActions(s, 0).some(
          (action) =>
            action.cardId === card(110) && action.targetId === "first~first",
        ),
      ).toBe(false);
      s = play(s, 110, "first~second");
      expect(s.stack.at(-1)?.targetId).toBe("first~second");
      s = settle(s);
      expect(s.units.some((u) => u.id === "first")).toBe(false);
      expect(s.units.find((u) => u.id === "second")?.damage).toBe(4);
    },
  );

  it("Clash of Giants rechecks both enemy target protections when resolving", () => {
    let s = position();
    unit(s, 98, "first", 1);
    unit(s, 98, "second", 1);
    s.players[0].hand = [card(110)];
    s = play(s, 110, "first~second");
    s.units[1].untargetableByEnemy = true;
    s = settle(s);
    expect(s.units.every((u) => u.damage === 0)).toBe(true);
  });

  it("Diana can add Energy while her trigger waits and decide to pay only when it resolves", () => {
    let s = position();
    unit(s, 79, "diana");
    s.players[0].energy = 0;
    s.players[0].xp = 6;
    s.gears = [{ id: "honey", cardId: card(49), owner: 0, ready: true }];
    s.players[0].deck = [card(91)];
    s = attack(s, "diana");
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    expect(s.stack.some((item) => item.cardId === card(79))).toBe(true);
    expect(s.pendingChoice).toBeNull();
    s = take(s, (a) => a.abilityKey === "honey-both");
    expect(s.players[0].energy).toBe(1);
    s = reachChoice(s);
    expect(s.pendingChoice?.kind).toBe("predict");
    expect(s.players[0].energy).toBe(0);
    s = take(s, (a) => /keep/i.test(a.label));
    s = settle(s);
    expect(s.players[0].hand).toEqual([card(91)]);
  });

  it("gaining XP in response after an upfront XP spend still enables Newtfish", () => {
    let s = position();
    s.players[0].xp = 3;
    unit(s, 119, "hunter");
    unit(s, 108, "newtfish");
    unit(s, 171, "enemy", 1, s.fields[0].id);
    s.gears = [{ id: "rose", cardId: card(109), owner: 0, ready: true }];
    s = attack(s, "hunter");
    s = take(s, (a) => a.targetId === "enemy");
    expect(s.players[0].xp).toBe(0);
    expect(
      getKeywords(
        s,
        s.units.find((u) => u.id === "newtfish")!,
      ),
    ).not.toContain("Ganking");
    s.players[0].hand = [card(94)];
    s = play(s, 94);
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    s = settle(s);
    expect(s.players[0].xp).toBe(1);
    expect(
      getKeywords(
        s,
        s.units.find((u) => u.id === "newtfish")!,
      ),
    ).toContain("Ganking");
  });
  it("Diana's finalized ability does nothing if its payment becomes impossible before resolution", () => {
    let s = position();
    unit(s, 79, "diana");
    s.players[0].energy = 1;
    s.players[0].deck = [card(91)];
    s = attack(s, "diana");
    s = take(s, (a) => !/skip|decline/i.test(a.id + a.label));
    expect(s.players[0].energy).toBe(1);
    s.players[0].energy = 0;
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].deck[0]).toBe(card(91));
  });
});
