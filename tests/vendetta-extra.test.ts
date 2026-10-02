import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import {
  vendettaExtraScripts,
  vendettaExtraModule,
} from "../src/game/vendetta-extra";
import type {
  PreconContext,
  PreconEvent,
} from "../src/game/later-precon-engine";
import type {
  Effect,
  GameAction,
  GameState,
  Gear,
  PlayerId,
  Unit,
} from "../src/game/types";
const id = (n: number) =>
  cards.find((c) => c.riftboundId === `ven-${String(n).padStart(3, "0")}-166`)!
    .id;
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
function fixture(): GameState {
  const s = createGame({ seed: 541 });
  Object.assign(s, {
    phase: "main",
    turn: 8,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    stack: [],
    pendingChoice: null,
    pendingTriggers: [],
    combat: null,
    units: [],
    gears: [],
  });
  for (const f of s.fields) {
    f.cardId = ogn(275);
    f.controller = null;
  }
  for (const p of s.players)
    Object.assign(p, {
      hand: [],
      discard: [],
      deck: Array(30).fill(ogn(49)),
      energy: 50,
      power: 50,
      runes: [],
      runeDeck: Array(12).fill("Body"),
      cardsPlayedThisTurn: 0,
      legendId: ogn(251),
      championAvailable: false,
      hasBegun: true,
      points: 0,
    });
  return s;
}
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
function gear(n: number, owner: PlayerId = 0): Gear {
  return { id: `g${n}${owner}`, cardId: id(n), owner, ready: true };
}
function settle(
  initial: GameState,
  choose?: (a: GameAction[]) => GameAction | undefined,
): GameState {
  let s = initial;
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? (choose?.(actions) ?? actions[0])
      : actions.find((a) => a.id === "pass");
    if (!a) throw Error(`No continuation ${actions.map((a) => a.id)}`);
    s = applyAction(s, a);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function resolve(
  s: GameState,
  n: number,
  effects: Effect[],
  sourceId?: string,
  targetId?: string,
  choose?: (a: GameAction[]) => GameAction | undefined,
) {
  s.stack.push({
    id: "test-stack",
    kind: "ability",
    player: 0,
    cardId: id(n),
    sourceId,
    targetId,
    locationId: s.units.find((u) => u.id === sourceId)?.location,
    effects,
  });
  s.priorityPlayer = 1;
  return settle(s, choose);
}
function play(
  s: GameState,
  n: number,
  targetId?: string,
  paid = false,
  choose?: (a: GameAction[]) => GameAction | undefined,
) {
  s.players[0].hand.push(id(n));
  s.priorityPlayer = 0;
  const a = getLegalActions(s, 0).find(
    (a) =>
      a.category === "play" &&
      a.cardId === id(n) &&
      a.targetId === targetId &&
      Boolean(a.additionalCostPaid) === paid &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `legal play ${getCard(id(n)).name}`).toBeDefined();
  return settle(applyAction(s, a!), choose);
}
function activate(
  s: GameState,
  prefix: string,
  sourceId: string,
  choose?: (a: GameAction[]) => GameAction | undefined,
) {
  s.priorityPlayer = 0;
  const a = getLegalActions(s, 0).find(
    (a) => a.sourceId === sourceId && a.id.startsWith(prefix),
  );
  expect(a, `${prefix} ${sourceId}`).toBeDefined();
  return settle(applyAction(s, a!), choose);
}
function event(
  s: GameState,
  e: PreconEvent,
  p: PlayerId = 0,
  sourceId?: string,
) {
  const u = s.units.find((u) => u.id === sourceId);
  const ctx = {
    trigger(
      state: GameState,
      player: PlayerId,
      cardId: string,
      sourceId: string,
      effects: Effect[],
      locationId?: Unit["location"],
    ) {
      state.stack.push({
        id: `event-${state.nextId++}`,
        kind: "trigger",
        player,
        cardId,
        sourceId,
        effects,
        locationId,
      });
    },
  } as PreconContext;
  vendettaExtraModule.event!(
    s,
    e,
    p,
    u?.cardId ?? ogn(251),
    sourceId,
    u?.location,
    ctx,
  );
  return settle(s);
}
function runes(s: GameState, n: number, p: PlayerId = 0) {
  s.players[p].runes = Array.from({ length: n }, (_, i) => ({
    id: `r${p}${i}`,
    domain: "Fury",
    ready: false,
  }));
}

describe("Vendetta extra registry and empowerment", () => {
  it("registers only exact full VEN faces and every advertised script is connected", () => {
    expect(Object.keys(vendettaExtraScripts).length).toBeGreaterThan(40);
    for (const [cardId, sc] of Object.entries(vendettaExtraScripts)) {
      expect(getCard(cardId).riftboundId).toMatch(/^ven-\d{3}-166$/);
      expect(getScript(cardId)).toBe(sc);
    }
    expect(vendettaExtraScripts["ven-001-rune"]).toBeUndefined();
  });
  it.each([
    [1, 2],
    [32, 12],
    [46, 8],
    [50, 12],
    [57, 3],
    [70, 3],
    [74, 1],
    [78, 1],
    [122, 2],
    [130, 3],
  ])("pays and resolves the complete Empower cost for face %i", (n, cost) => {
    let s = fixture();
    const u = unit(n);
    s.units = [u];
    const energy = s.players[0].energy;
    s = activate(s, "ven-extra-empower:", u.id);
    expect(s.units[0].empowered).toBe(true);
    expect(s.players[0].energy).toBe(energy - cost);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.id.startsWith("ven-extra-empower:") && a.sourceId === u.id,
      ),
    ).toBe(false);
  });
  it("prices Sandspinner at five energy above four runes", () => {
    let s = fixture();
    runes(s, 5);
    s.units = [unit(1)];
    s = activate(s, "ven-extra-empower:", s.units[0].id);
    expect(s.players[0].energy).toBe(45);
  });
  it.each([32, 50])(
    "discounts face %i by every rune and floors its cost at zero",
    (n) => {
      let s = fixture();
      runes(s, 14);
      s.players[0].energy = 0;
      s.units = [unit(n)];
      s = activate(s, "ven-extra-empower:", s.units[0].id);
      expect(s.units[0].empowered).toBe(true);
      expect(s.players[0].energy).toBe(0);
    },
  );
  it("offers Marauder's Body alternative even with zero energy", () => {
    let s = fixture();
    s.units = [unit(74)];
    s.players[0].energy = 0;
    s = activate(s, "ven-extra-empower:", s.units[0].id);
    expect(s.players[0].power).toBe(49);
    expect(getMight(s, s.units[0])).toBe(3);
  });
  it("empowers Grayback only after killing a friendly unit as a cost", () => {
    let s = fixture();
    const source = unit(124),
      victim = unit(5);
    s.units = [source, victim];
    const a = getLegalActions(s, 0).find(
      (a) => a.id.startsWith("ven-extra-empower:") && a.targetId === victim.id,
    )!;
    s = applyAction(s, a);
    expect(s.units.some((u) => u.id === victim.id)).toBe(false);
    expect(s.units[0].empowered).toBeUndefined();
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(5);
  });
  it("allows Grayback to sacrifice itself without empowering a stale object", () => {
    let s = fixture();
    s.units = [unit(124)];
    s = activate(s, "ven-extra-empower:", s.units[0].id);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].discard).toContain(id(124));
  });
  it("computes empowered Might, auras and combat modifiers", () => {
    const s = fixture();
    s.units = [unit(130), unit(70), unit(1), unit(50), unit(76)];
    for (const u of s.units) u.empowered = true;
    s.gears = [gear(18), gear(77)];
    s.gears[0].empowered = true;
    expect(getMight(s, s.units[0])).toBe(9);
    expect(getMight(s, s.units[1])).toBe(10);
    s.units.forEach((u) => (u.location = "field:0"));
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
    expect(getMight(s, s.units[2])).toBe(12);
    expect(getMight(s, s.units[4])).toBe((getCard(id(76)).might ?? 0) + 6);
    s.combat.attacker = 1;
    s.combat.defender = 0;
    expect(getMight(s, s.units[3])).toBe(11);
    expect(getKeywords(s, s.units[1])).toContain("Ganking");
  });
  it("gives Sunhawk exactly Deflect 2", () => {
    const s = fixture();
    const u = unit(122);
    u.empowered = true;
    s.units = [u];
    expect(getKeywords(s, u)).toEqual(["Deflect 2"]);
    expect(getMight(s, u)).toBe(4);
  });
});

describe("Vendetta spells and triggers", () => {
  it("Brittle Steel destroys either player's gear and flows for its alternate cost", () => {
    let s = fixture();
    s.gears = [gear(77)];
    s = play(s, 3, s.gears[0].id);
    expect(s.gears).toHaveLength(0);
    s.priorityPlayer = 0;
    s.gears = [gear(18, 1)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === id(3) && a.sourceId?.startsWith("trash:"),
    )!;
    expect(a).toBeDefined();
    const energy = s.players[0].energy;
    s = settle(applyAction(s, a));
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].energy).toBe(energy - 4);
    expect(s.players[0].banished).toContain(id(3));
  });
  it("Consuming Curse counts all copies in trash before its own resolution", () => {
    let s = fixture();
    const u = unit(16, 1);
    u.location = "field:0";
    s.units = [u];
    s.players[0].discard = [id(10), id(10)];
    s = play(s, 10, u.id);
    expect(s.units[0].damage).toBe(4);
  });
  it.each([
    [false, 2],
    [true, 4],
  ])("Guttural Roar uses target's empowered status %s", (empowered, amount) => {
    let s = fixture();
    const u = unit(5);
    u.empowered = empowered;
    s.units = [u];
    s = play(s, 72, u.id);
    expect(s.units[0].temporaryMight).toBe(amount);
  });
  it("Shock Blast discounts for an empowered legend and deals four", () => {
    let s = fixture();
    const u = unit(16, 1);
    u.location = "field:0";
    s.units = [u];
    s.players[0].legendEmpowered = true;
    s = play(s, 59, u.id);
    expect(s.players[0].energy).toBe(49);
    expect(s.units[0].damage).toBe(4);
  });
  it("Plaza Guardian counts friendly gear only", () => {
    let s = fixture();
    s.gears = [gear(18), gear(77), gear(87, 1)];
    s = play(s, 64);
    expect(s.players[0].energy).toBe(42);
  });
  it("Baccai beginning conditions compare both players' rune totals", () => {
    let s = fixture();
    s.units = [unit(5), unit(6)];
    runes(s, 3, 1);
    s = event(s, "beginning");
    expect(s.units.map((u) => u.temporaryMight)).toEqual([1, 2]);
    expect(getKeywords(s, s.units[1])).toContain("Ganking");
    runes(s, 3);
    s = event(s, "beginning");
    expect(s.units.map((u) => u.temporaryMight)).toEqual([1, 2]);
  });
  it("Eclipse Dragon draws on moving with at most four runes", () => {
    let s = fixture();
    const u = unit(16);
    u.location = "field:0";
    s.units = [u];
    runes(s, 4);
    s = resolve(
      s,
      16,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.players[0].hand).toHaveLength(1);
    u.location = "field:0";
    s.units[0].location = "field:0";
    runes(s, 5);
    s = resolve(
      s,
      16,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Renekton damages every enemy here but not elsewhere or allies", () => {
    let s = fixture();
    const source = unit(19),
      one = unit(16, 1),
      two = unit(70, 1),
      elsewhere = unit(16, 1, "else"),
      ally = unit(70);
    source.location = one.location = two.location = ally.location = "field:0";
    s.units = [source, one, two, elsewhere, ally];
    s = resolve(s, 19, getScript(id(19))!.onAttack!, source.id);
    expect(s.units.map((u) => u.damage)).toEqual([0, 2, 2, 0, 0]);
  });
  it("Baccai Reaper can decline or pay its Fury to gain Assault", () => {
    let s = fixture();
    s.units = [unit(9)];
    s = resolve(s, 9, getScript(id(9))!.onAttack!, s.units[0].id);
    expect(s.players[0].power).toBe(49);
    expect(s.units[0].temporaryAssault).toBe(2);
  });
  it.each([false, true])(
    "Nasus Ascended bonus score uses empowerment %s",
    (empowered) => {
      let s = fixture();
      const u = unit(46);
      u.empowered = empowered;
      s.units = [u];
      s = applyAction(s, `move-start:${u.id}:field:0`);
      s = applyAction(s, "move-confirm");
      for (
        let i = 0;
        i < 15 && (s.combat || s.stack.length || s.pendingChoice);
        i++
      ) {
        const actions = getLegalActions(s, s.priorityPlayer);
        const a = s.pendingChoice
          ? actions[0]
          : actions.find((a) => a.id === "pass");
        expect(a).toBeDefined();
        s = applyAction(s, a!);
      }
      expect(s.combat).toBeNull();
      expect(s.players[0].points).toBe(empowered ? 2 : 1);
    },
  );
  it("Porobot draws only with three other friendly gear", () => {
    let s = fixture();
    s.gears = [gear(18), gear(77), gear(87)];
    s = play(s, 58);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.units[0].ready).toBe(false);
  });
  it("Covert Informant needs empowerment at the time of moving", () => {
    let s = fixture();
    const u = unit(57);
    u.location = "field:0";
    s.units = [u];
    s = resolve(
      s,
      57,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.players[0].hand).toHaveLength(0);
    s.units[0].location = "field:0";
    s.units[0].empowered = true;
    s = resolve(
      s,
      57,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Guardian of Knowledge channels once per turn for enemy-unit deaths here", () => {
    let s = fixture();
    const nasus = unit(63),
      a = unit(5, 1),
      b = unit(6, 1);
    nasus.location = a.location = b.location = "field:0";
    s.units = [nasus, a, b];
    s = resolve(s, 63, [{ type: "kill", target: "anyUnit" }], undefined, a.id);
    expect(s.players[0].runes).toHaveLength(1);
    s = resolve(s, 63, [{ type: "kill", target: "anyUnit" }], undefined, b.id);
    expect(s.players[0].runes).toHaveLength(1);
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("does not trigger Nasus from a gear death or his own simultaneous death", () => {
    let s = fixture();
    const nasus = unit(63),
      enemy = unit(5, 1);
    nasus.location = enemy.location = "field:0";
    nasus.damage = 5;
    s.units = [nasus, enemy];
    s.gears = [gear(77, 1)];
    s = resolve(
      s,
      63,
      [{ type: "kill", target: "anyGear" }],
      undefined,
      s.gears[0].id,
    );
    expect(s.players[0].runes).toHaveLength(0);
    s = resolve(s, 63, [
      {
        type: "damageAll",
        amount: 2,
        who: "all",
        condition: "allBattlefields",
      },
    ]);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(0);
  });
  it("Fretful Feline triggers only for an exhausted-to-ready transition", () => {
    let s = fixture();
    const u = unit(71);
    u.ready = false;
    s.units = [u];
    s = resolve(s, 71, [{ type: "ready", target: "anyUnit" }], undefined, u.id);
    expect(s.units[0].temporaryMight).toBe(2);
    s = resolve(s, 71, [{ type: "ready", target: "anyUnit" }], undefined, u.id);
    expect(s.units[0].temporaryMight).toBe(2);
  });
  it("Witherclaw channels two exhausted runes only if empowered when killed", () => {
    let s = fixture();
    const u = unit(78);
    u.empowered = true;
    s.units = [u];
    s = resolve(s, 78, [{ type: "kill", target: "anyUnit" }], undefined, u.id);
    expect(s.players[0].runes).toHaveLength(2);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
  });
  it("Renekton Brute triggers once when crossing ten Might", () => {
    let s = fixture();
    const u = unit(92);
    s.units = [u];
    s = resolve(
      s,
      92,
      [{ type: "might", amount: 6, target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.units[0].empowered).toBe(true);
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
  });
  it("Mask Mother pays its cost and grants a friendly unit two Might", () => {
    let s = fixture();
    s.units = [unit(5)];
    s.players[0].hand = [id(94)];
    s = resolve(s, 94, [{ type: "discard", amount: 1 }]);
    expect(s.units[0].temporaryMight).toBe(2);
    expect(s.players[0].energy).toBe(49);
  });
  it("Spiderling counts only other friendly same-name units here", () => {
    const s = fixture();
    s.units = [unit(97), unit(97, 0, "b"), unit(97, 1), unit(97, 0, "c")];
    s.units[3].location = "field:0";
    expect(getMight(s, s.units[0])).toBe((getCard(id(97)).might ?? 0) + 1);
  });
  it("Forgotten Relic burns publicly and then creates the unit-Might trigger", () => {
    let s = fixture();
    s.units = [unit(5)];
    s.players[0].deck = [id(16), ogn(49)];
    s = play(s, 108);
    expect(s.players[0].discard).toContain(id(16));
    expect(s.units[0].temporaryMight).toBe(8);
    expect(s.log.some((l) => l.text.includes("burns Eclipse Dragon"))).toBe(
      true,
    );
  });
  it("Masa's optional Order cost alone enables its stun trigger", () => {
    let s = fixture();
    const enemy = unit(16, 1);
    enemy.location = "field:0";
    s.units = [enemy];
    s = play(s, 120, undefined, true);
    expect(s.units.find((u) => u.id === enemy.id)!.stunned).toBe(true);
  });
  it("Reluctant Leader grows when another friendly unit is played", () => {
    let s = fixture();
    s.units = [unit(121)];
    s = play(s, 5);
    expect(s.units[0].temporaryMight).toBe(2);
  });
  it("Siphoning Strike installs its delayed channel before lethal damage", () => {
    let s = fixture();
    const u = unit(5, 1);
    u.location = "field:0";
    s.units = [u];
    s = play(s, 146, u.id);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(1);
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("Lightning Rush privately draws a chosen top-three card and burns the rest", () => {
    let s = fixture();
    s.players[0].deck = [id(5), id(16), id(6), ogn(49)];
    s = play(s, 156, undefined, false, (a) =>
      a.find((a) => a.label === "Draw Eclipse Dragon"),
    );
    expect(s.players[0].hand).toEqual([id(16)]);
    expect(s.players[0].discard).toEqual([id(5), id(6), id(156)]);
    expect(s.players[0].deck).toEqual([ogn(49)]);
  });
  it("Protective Sands charges one energy to draw when eligible", () => {
    let s = fixture();
    s = resolve(s, 162, getScript(id(162))!.onConquer!);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].energy).toBe(49);
  });
});

describe("Vendetta gear", () => {
  it.each([54, 87])(
    "face %i exhausts to empower, then disempowers and exhausts as a paid cost",
    (n) => {
      let s = fixture();
      const g = gear(n);
      s.gears = [g];
      s = activate(s, "ven-extra-empower:", g.id);
      expect(s.gears[0].ready).toBe(false);
      expect(s.gears[0].empowered).toBe(true);
      s.gears[0].ready = true;
      s = activate(s, "ven-extra-discharge:", g.id);
      expect(s.gears[0].ready).toBe(false);
      expect(s.gears[0].empowered).toBe(false);
      expect(s.players[0].energy).toBe(49);
      if (n === 54) expect(s.players[0].hand).toHaveLength(1);
      else expect(s.units[0].cardId).toBe("token-mech");
    },
  );
  it("Rage Amplifier's paid empowerment changes the continuous team bonus", () => {
    let s = fixture();
    s.units = [unit(5)];
    s.gears = [gear(18)];
    expect(getMight(s, s.units[0])).toBe(3);
    s = activate(s, "ven-extra-empower:", s.gears[0].id);
    expect(getMight(s, s.units[0])).toBe(4);
    expect(s.players[0].energy).toBe(44);
    expect(s.players[0].power).toBe(49);
  });
  it("Platewyrm Egg enters exhausted, has an immediate energy ability and pays to empower", () => {
    let s = play(fixture(), 75);
    const g = s.gears[0];
    expect(g.ready).toBe(false);
    g.ready = true;
    s = activate(s, "ven-extra-empower:", g.id);
    expect(s.gears[0].empowered).toBe(true);
    s.gears[0].ready = true;
    const before = s.players[0].energy;
    s = activate(s, "ven-extra-egg:", g.id);
    expect(s.players[0].energy).toBe(before + 2);
    expect(s.stack).toHaveLength(0);
  });
  it("Hextech Formula enters exhausted, cannot target itself, and may empower an enemy gear", () => {
    let s = play(fixture(), 62);
    const g = s.gears[0];
    expect(g.ready).toBe(false);
    g.ready = true;
    s.gears.push(gear(77, 1));
    const actions = getLegalActions(s, 0).filter(
      (a) => a.sourceId === g.id && a.category === "ability",
    );
    expect(actions.some((a) => a.targetId === g.id)).toBe(false);
    const a = actions.find((a) => a.targetId === s.gears[1].id)!;
    expect(a).toBeDefined();
    s = settle(applyAction(s, a));
    expect(s.gears[1].empowered).toBe(true);
  });
  it("Tools of Empire grants four Might when empowered", () => {
    let s = fixture();
    s.gears = [gear(77)];
    s.gears[0].empowered = true;
    s.units = [unit(5)];
    const a = getLegalActions(s, 0).find(
      (a) => a.sourceId === s.gears[0].id && a.targetId === s.units[0].id,
    )!;
    s = settle(applyAction(s, a));
    expect(s.units[0].temporaryMight).toBe(4);
  });
  it("Barbara disempowers an empowered enemy gear instead of killing it", () => {
    let s = fixture();
    runes(s, 7);
    s.gears = [gear(18, 1)];
    s.gears[0].empowered = true;
    s = play(s, 37);
    expect(s.gears).toHaveLength(1);
    expect(s.gears[0].empowered).toBe(false);
  });
});
