import { describe, expect, it } from "vitest";
import { validState } from "../src/persistence";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  getGameView,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import {
  vendettaWave3Scripts,
  vendettaWave3Module,
  vendettaWave3Sources,
} from "../src/game/vendetta-wave3";
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
  cards.find(
    (c) =>
      c.riftboundId ===
      (n >= 1000
        ? `ven-sp${n - 1000}-006`
        : `ven-${String(n).padStart(3, "0")}-166`),
  )!.id;
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
  vendettaWave3Module.event!(
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

function tickResolve(s: GameState) {
  s = applyAction(s, "pass");
  return applyAction(s, "pass");
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
    designatedUnits: s.units
      .filter((u) => u.location === "field:0")
      .map((u) => u.id),
  };
  s.phase = "showdown";
  s.focusPlayer = s.priorityPlayer = 0;
}
function conquer(
  s: GameState,
  u: Unit,
  choose?: (a: GameAction[]) => GameAction | undefined,
) {
  s.priorityPlayer = 0;
  s = applyAction(s, `move-start:${u.id}:field:0`);
  s = applyAction(s, "move-confirm");
  for (
    let i = 0;
    i < 60 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    const next = s.pendingChoice
      ? (choose?.(a) ?? a[0])
      : a.find((a) => a.id === "pass");
    if (!next) throw Error(`Unexpected conquer ${s.phase}`);
    s = applyAction(s, next);
  }
  expect(s.combat).toBeNull();
  return s;
}

describe("Vendetta wave3 provenance and exact printings", () => {
  it("registers reviewed faces and reviewed alternate text only", () => {
    for (const [cardId, sc] of Object.entries(vendettaWave3Scripts)) {
      expect(getCard(cardId).set).toBe("VEN");
      expect(getScript(cardId)).toBe(sc);
    }
    expect(getScript("ven-084a-166")).toBe(vendettaWave3Scripts[id(84)]);
    expect(getScript("ven-173-166")).toBe(vendettaWave3Scripts[id(65)]);
    expect(
      vendettaWave3Scripts["ven-r01--6a517605ad64d2d80a4f038d"],
    ).toBeUndefined();
  });
  it("records primary image provenance for missing equipment panels without altering provider text", () => {
    expect(vendettaWave3Sources["ven-011-166"].image).toContain(
      "cmsassets.rgpub.io",
    );
    expect(vendettaWave3Sources["ven-073-166"].attachedRules).toContain(
      "enemy spells",
    );
    expect(getCard(id(11)).text).not.toContain("battlefield");
    expect(getScript(id(11))!.gearMight).toBe(1);
    expect(getScript(id(73))!.gearMight).toBe(2);
  });
});

describe("Vendetta modal triggers finalized before response", () => {
  it.each(["Assault 2", "Deflect 2", "Ganking"])(
    "Jayce chooses %s before putting the ready trigger on the chain",
    (mode) => {
      let s = fixture();
      const u = unit(88);
      u.ready = false;
      s.units = [u];
      s.stack = [
        {
          id: "test",
          kind: "ability",
          player: 0,
          cardId: id(88),
          targetId: u.id,
          effects: [{ type: "ready", target: "anyUnit" }],
        },
      ];
      s = tickResolve(s);
      expect(s.pendingChoice?.kind).toBe("trigger");
      expect(s.units[0].temporaryAssault).toBe(0);
      const a = getLegalActions(s, 0).find((a) => a.label === mode)!;
      expect(a).toBeDefined();
      s = applyAction(s, a);
      expect(s.pendingChoice).toBeNull();
      expect(s.stack).toHaveLength(1);
      expect(s.stack[0].effects[0].modes).toBeUndefined();
      expect(s.units[0].temporaryKeywords ?? []).toEqual([]);
      s = settle(s);
      if (mode === "Assault 2") expect(s.units[0].temporaryAssault).toBe(2);
      else expect(getKeywords(s, s.units[0])).toContain(mode);
    },
  );
  it("queues two simultaneous Jayce ready triggers without overwriting mode choices", () => {
    let s = fixture();
    s.units = [unit(88), unit(88, 0, "second")];
    s.units.forEach((u) => (u.ready = false));
    s = resolve(
      s,
      88,
      s.units.map((u) => ({
        type: "ready" as const,
        target: "anyUnit" as const,
        chosenTargetId: u.id,
      })),
      undefined,
      s.units.map((u) => u.id).join("~"),
      (a) => a.find((a) => a.label === "Ganking"),
    );
    expect(s.units.every((u) => getKeywords(s, u).includes("Ganking"))).toBe(
      true,
    );
  });
  it.each(["Each player draws 1", "Each player discards 1"])(
    "Minah chooses %s before the response window",
    (mode) => {
      let s = fixture();
      const u = unit(111);
      s.units = [u];
      s.players[0].hand = [id(11)];
      s.players[1].hand = [id(73)];
      s = applyAction(s, `move-start:${u.id}:field:0`);
      s = applyAction(s, "move-confirm");
      expect(s.pendingChoice?.kind).toBe("trigger");
      const a = getLegalActions(s, 0).find((a) => a.label === mode)!;
      expect(a).toBeDefined();
      s = applyAction(s, a);
      expect(s.stack.some((i) => i.cardId === id(111))).toBe(true);
      expect(s.players[0].hand).toHaveLength(1);
      s = settle(s);
      expect(s.players[0].hand).toHaveLength(mode.includes("draws") ? 2 : 0);
      expect(s.players[1].hand).toHaveLength(mode.includes("draws") ? 2 : 0);
    },
  );
  it("Minah moving to base creates no modal trigger", () => {
    let s = fixture();
    const u = unit(111);
    u.location = "field:0";
    s.units = [u];
    s = resolve(
      s,
      111,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[1].hand).toHaveLength(0);
  });
  it("Mesmerize fixes its mode and target in the play action", () => {
    let s = fixture();
    s.units = [unit(47), unit(84, 1)];
    s.players[0].hand = [id(52)];
    const actions = getLegalActions(s, 0).filter(
      (a) => a.cardId === id(52) && a.category === "play",
    );
    expect(actions).toHaveLength(2);
    const a = actions.find((a) => a.targetId === s.units[1].id)!;
    s = applyAction(s, a);
    expect(s.stack[0].effects[0]).toMatchObject({
      type: "might",
      amount: -2,
      target: "enemyUnit",
    });
    expect(s.pendingChoice).toBeNull();
    s = settle(s);
    expect(s.units[1].temporaryMight).toBe(-2);
  });
  it("Mesmerize's friendly mode bounces instead of applying the other mode", () => {
    let s = fixture();
    const u = unit(47);
    s.units = [u];
    s = play(s, 52, u.id);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toEqual([id(47)]);
  });
});

describe("Vendetta Predict and revealed hands", () => {
  it("Clairvoyance can reorder any kept cards, recycle the rest, then draw two", () => {
    let s = fixture();
    s.players[0].deck = [id(5), id(6), id(16), id(19), id(71), ogn(49)];
    const seen = new Set<string>();
    s = play(s, 56, undefined, false, (a) => {
      for (const name of ["Eclipse Dragon", "Forsaken Baccai"]) {
        if (!seen.has(name)) {
          const chosen = a.find((a) => a.label === `Keep next: ${name}`);
          if (chosen) {
            seen.add(name);
            return chosen;
          }
        }
      }
      return a.find((a) => a.label.startsWith("Recycle:"));
    });
    expect(s.players[0].hand).toEqual([id(16), id(5)]);
    expect(s.players[0].deck[0]).toBe(ogn(49));
    expect(s.players[0].deck.slice(1).sort()).toEqual(
      [id(6), id(19), id(71)].sort(),
    );
  });
  it("Predict leaves inspected cards in deck until private choices complete and saves round-trip", () => {
    let s = fixture();
    s.players[0].deck = [id(5), id(16), id(6), id(19), id(71)];
    s.players[0].hand = [id(56)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === id(56) && a.category === "play",
    )!;
    s = applyAction(s, a);
    s = tickResolve(s);
    expect(s.pendingChoice?.kind).toBe("custom");
    expect(s.players[0].deck).toHaveLength(5);
    expect(getGameView(s, 1).pendingChoice?.options).toBeUndefined();
    expect(getGameView(s, 1).pendingChoice?.afterEffects).toBeUndefined();
    expect(validState(s)).toBe(true);
    s = settle(JSON.parse(JSON.stringify(s)), (a) =>
      a.find((a) => a.label.startsWith("Keep next:")),
    );
    expect(s.players[0].hand).toEqual([id(5), id(16)]);
  });
  it("Apprentice Mage empowers for two energy, predicts two once and gains one Might", () => {
    let s = fixture();
    s.units = [unit(47)];
    s.players[0].deck = [id(5), id(16), ogn(49)];
    s = activate(
      s,
      "ven-wave3:empower:",
      s.units[0].id,
      (a) =>
        a.find((a) => a.label === "Keep next: Eclipse Dragon") ??
        a.find((a) => a.label.startsWith("Recycle:")),
    );
    expect(s.players[0].energy).toBe(48);
    expect(s.units[0].empowered).toBe(true);
    expect(getMight(s, s.units[0])).toBe(4);
    expect(s.players[0].deck).toEqual([id(16), ogn(49), id(5)]);
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:empower:")),
    ).toBe(false);
  });
  it("Predict on a one-card deck can keep its single card without inventing more", () => {
    let s = fixture();
    s.units = [unit(47)];
    s.players[0].deck = [id(16)];
    s = activate(s, "ven-wave3:empower:", s.units[0].id);
    expect(s.players[0].deck).toEqual([id(16)]);
  });
  it("Decree reveals the opponent's hand and only allows a Mind card to be recycled", () => {
    let s = fixture();
    s.players[1].hand = [id(5), id(56), id(11)];
    s = play(s, 85);
    expect(s.players[1].hand).toEqual([id(5), id(11)]);
    expect(s.players[1].deck.at(-1)).toBe(id(56));
    expect(
      s.log.some(
        (l) =>
          l.text.includes("reveals:") &&
          l.text.includes("Clairvoyance") &&
          l.text.includes("Forsaken Baccai"),
      ),
    ).toBe(true);
  });
  it("Decree still reveals a hand with no eligible Mind card", () => {
    let s = fixture();
    s.players[1].hand = [id(5)];
    s = play(s, 85);
    expect(s.players[1].hand).toEqual([id(5)]);
    expect(s.pendingChoice).toBeNull();
  });
});

describe("Vendetta verified equipment and empowerment combat effects", () => {
  it("Pendulum Blade pays one Fury to equip, grants +1 and triggers +2 on a battlefield move", () => {
    let s = fixture();
    const u = unit(47),
      g = gear(11);
    s.units = [u];
    s.gears = [g];
    s = settle(applyAction(s, `equip:${g.id}:${u.id}`));
    expect(s.players[0].power).toBe(49);
    expect(getMight(s, s.units[0])).toBe(4);
    s = applyAction(s, `move-start:${u.id}:field:0`);
    s = applyAction(s, "move-confirm");
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(2);
    expect(getMight(s, s.units[0])).toBe(6);
  });
  it("Pendulum Blade does not trigger on moving to base, and detaching removes its static Might", () => {
    let s = fixture();
    const u = unit(47),
      g = gear(11);
    u.location = "field:0";
    u.gear = [g.id];
    g.attachedTo = u.id;
    s.units = [u];
    s.gears = [g];
    s = resolve(
      s,
      11,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.units[0].temporaryMight).toBe(0);
    s = resolve(s, 11, [{ type: "kill", target: "anyGear" }], undefined, g.id);
    expect(getMight(s, s.units[0])).toBe(3);
  });
  it("Jagged Cutlass prevents enemy-forced movement but permits controller movement", () => {
    let s = fixture();
    const u = unit(47),
      g = gear(73);
    u.location = "field:0";
    u.gear = [g.id];
    g.attachedTo = u.id;
    s.units = [u];
    s.gears = [g];
    expect(getMight(s, u)).toBe(5);
    s.stack = [
      {
        id: "test",
        kind: "ability",
        player: 1,
        cardId: id(73),
        targetId: u.id,
        effects: [{ type: "moveTarget", target: "anyUnit" }],
      },
    ];
    s = settle(s);
    expect(s.units[0].location).toBe("field:0");
    s = resolve(
      s,
      73,
      [{ type: "moveTarget", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.units[0].location).toBe("base:0");
  });
  it("Dame matches a higher unit and then gains one, without lowering an already higher Might", () => {
    let s = fixture();
    const a = unit(79),
      b = unit(16, 1);
    a.empowered = true;
    a.location = b.location = "field:0";
    s.units = [a, b];
    s = resolve(s, 79, getScript(id(79))!.onAttack!, a.id, b.id);
    expect(getMight(s, s.units[0])).toBe(9);
    s = resolve(s, 79, getScript(id(79))!.onDefend!, a.id, b.id);
    expect(getMight(s, s.units[0])).toBe(10);
  });
  it.each([
    [-3, 2, 3],
    [-3, -1, 0],
    [2, -3, 3],
  ])(
    "Dame computes a Might increase from raw values %i and %i",
    (sourceMight, targetMight, expected) => {
      let s = fixture();
      const dame = unit(79),
        target = unit(16, 1);
      dame.empowered = true;
      dame.location = target.location = "field:0";
      dame.temporaryMight = sourceMight - getCard(dame.cardId).might!;
      target.temporaryMight = targetMight - getCard(target.cardId).might!;
      s.units = [dame, target];
      s = resolve(s, 79, getScript(id(79))!.onAttack!, dame.id, target.id);
      expect(getMight(s, s.units[0], false)).toBe(expected);
    },
  );
  it("Dame pays the typed Body empower cost before becoming empowered", () => {
    let s = fixture();
    s.units = [unit(79)];
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "r", domain: "Fury", ready: false }];
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:empower:")),
    ).toBe(false);
    s.players[0].runes[0].domain = "Body";
    s = activate(s, "ven-wave3:empower:", s.units[0].id);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].energy).toBe(45);
    expect(s.units[0].empowered).toBe(true);
  });
  it("Dame's here referent follows both units to their new battlefield", () => {
    let s = fixture();
    const a = unit(79),
      b = unit(16, 1);
    a.empowered = true;
    a.location = b.location = "field:1";
    s.units = [a, b];
    s.stack = [
      {
        id: "test",
        kind: "ability",
        player: 0,
        cardId: id(79),
        sourceId: a.id,
        targetId: b.id,
        locationId: "field:0",
        effects: getScript(id(79))!.onAttack!,
      },
    ];
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(9);
  });
  it("Demolitionist declares only gear costing no more than its current Might", () => {
    let s = fixture();
    const u = unit(80);
    u.temporaryMight = 2;
    s.units = [u];
    s.gears = [gear(11), gear(67)];
    s = conquer(s, u, (a) => a.find((a) => a.targetId === s.gears[0].id));
    expect(s.gears.map((g) => g.cardId)).toEqual([id(67)]);
  });
  it("Demolitionist rechecks Might before killing the chosen gear", () => {
    let s = fixture();
    const u = unit(80);
    u.temporaryMight = -3;
    s.units = [u];
    s.gears = [gear(11)];
    s = resolve(
      s,
      80,
      [
        {
          type: "special",
          custom: "ven-wave3:demolish",
          target: "anyGear",
          maxEnergy: 10,
        },
      ],
      u.id,
      s.gears[0].id,
    );
    expect(s.gears).toHaveLength(1);
  });
  it("Ambessa gains three Might and prevents damage while outside combat", () => {
    let s = fixture();
    s.units = [unit(84)];
    s = activate(s, "ven-wave3:empower:", s.units[0].id);
    expect(getMight(s, s.units[0])).toBe((getCard(id(84)).might ?? 0) + 3);
    s = resolve(
      s,
      84,
      [{ type: "damage", amount: 3, target: "anyUnit" }],
      undefined,
      s.units[0].id,
    );
    expect(s.units[0].damage).toBe(0);
  });
  it("Ambessa can take spell damage when she is in combat", () => {
    let s = fixture();
    const a = unit(84),
      b = unit(16, 1);
    a.empowered = true;
    a.location = b.location = "field:0";
    s.units = [a, b];
    combat(s);
    s = resolve(
      s,
      84,
      [{ type: "damage", amount: 3, target: "anyUnit" }],
      undefined,
      a.id,
    );
    expect(s.units[0].damage).toBe(3);
  });
});

describe("Vendetta scoring and token families", () => {
  it("Up from the Deep creates two exhausted one-Might Bilgewater Tentacles and supports Flow", () => {
    let s = play(fixture(), 100);
    expect(s.units).toHaveLength(2);
    for (const u of s.units) {
      expect(getCard(u.cardId).name).toBe("Tentacle");
      expect(getCard(u.cardId).tags).toContain("Bilgewater");
      expect(getMight(s, u)).toBe(1);
      expect(u.ready).toBe(false);
    }
    s.priorityPlayer = 0;
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === id(100) && a.sourceId?.startsWith("trash:"),
    )!;
    const energy = s.players[0].energy;
    s = settle(applyAction(s, a));
    expect(s.players[0].energy).toBe(energy - 3);
    expect(s.players[0].banished).toContain(id(100));
    expect(s.units).toHaveLength(4);
  });
  it("Illaoi creates a Tentacle on play and scoring, and counts all own token units", () => {
    let s = play(fixture(), 109);
    const illaoi = s.units.find((u) => u.cardId === id(109))!;
    expect(getMight(s, illaoi)).toBe((getCard(id(109)).might ?? 0) + 1);
    s = play(s, 100);
    expect(
      getMight(
        s,
        s.units.find((u) => u.id === illaoi.id)!,
      ),
    ).toBe((getCard(id(109)).might ?? 0) + 3);
    s.units.find((u) => u.id === illaoi.id)!.ready = true;
    s = conquer(
      s,
      s.units.find((u) => u.id === illaoi.id)!,
    );
    expect(s.units.filter((u) => u.token)).toHaveLength(4);
  });
  it("Swain scores an extra point only after a non-token unit, gear, and spell were played", () => {
    let s = play(fixture(), 65);
    s = play(s, 11);
    s = play(s, 49);
    const swain = s.units.find((u) => u.cardId === id(65))!;
    swain.ready = true;
    s = conquer(s, swain);
    expect(s.players[0].points).toBe(2);
  });
  it("Swain does not count token units as a non-token gear or prior-turn cards", () => {
    let s = play(fixture(), 65);
    s = play(s, 100);
    const swain = s.units.find((u) => u.cardId === id(65))!;
    swain.ready = true;
    s = conquer(s, swain);
    expect(s.players[0].points).toBe(1);
  });
});

describe("Vendetta legends and chosen-enemy tracking", () => {
  it("Hungry Wolf records a normal spell target and pays Order once per turn", () => {
    let s = fixture();
    const wolf = unit(125),
      enemy = unit(16, 1);
    wolf.ready = false;
    s.units = [wolf, enemy];
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:wolf:")),
    ).toBe(false);
    s = play(s, 52, enemy.id);
    s = activate(s, "ven-wave3:wolf:", wolf.id);
    expect(s.units[0].ready).toBe(true);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:wolf:")),
    ).toBe(false);
    s.turn++;
    s.priorityPlayer = 0;
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:wolf:")),
    ).toBe(false);
  });
  it.each([151, 153])(
    "legend %i empowers when its player empowers an opponent's object",
    (n) => {
      let s = fixture();
      s.players[0].legendId = id(n);
      s.gears = [gear(62), gear(75, 1)];
      const a = getLegalActions(s, 0).find(
        (a) => a.sourceId === s.gears[0].id && a.targetId === s.gears[1].id,
      )!;
      expect(a).toBeDefined();
      s = settle(applyAction(s, a));
      expect(s.gears[1].empowered).toBe(true);
      expect(s.players[0].legendEmpowered).toBe(true);
      expect(s.players[1].legendEmpowered).not.toBe(true);
    },
  );
  it("Soul's Reflection disempowers and exhausts as costs, pays Deflect, and reduces Might", () => {
    let s = fixture();
    s.players[0].legendId = id(151);
    s.players[0].legendEmpowered = true;
    const u = unit(46, 1);
    u.location = "field:0";
    s.units = [u];
    const a = getLegalActions(s, 0).find((a) =>
      a.id.startsWith("ven-wave3:legend:"),
    )!;
    s = applyAction(s, a);
    expect(s.players[0].legendEmpowered).toBe(false);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.players[0].power).toBe(48);
    expect(s.units[0].temporaryMight).toBe(0);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(-2);
  });
  it("Matriarch pays one generic power, disempowers, exhausts and readies a unit", () => {
    let s = fixture();
    s.players[0].legendId = id(153);
    s.players[0].legendEmpowered = true;
    const u = unit(47);
    u.ready = false;
    s.units = [u];
    s = activate(s, "ven-wave3:legend:", "legend");
    expect(s.players[0].power).toBe(49);
    expect(s.players[0].legendEmpowered).toBe(false);
    expect(s.units[0].ready).toBe(true);
  });
  it("Rogue Assassin can empower for three energy and one any-domain power", () => {
    let s = fixture();
    s.players[0].legendId = id(139);
    s = activate(s, "ven-wave3:empower:", "legend");
    expect(s.players[0].legendEmpowered).toBe(true);
    expect(s.players[0].energy).toBe(47);
    expect(s.players[0].power).toBe(49);
  });
  it.each([false, true])(
    "Rogue Assassin recalls a friendly showdown unit and readies it only when empowered %s",
    (empowered) => {
      let s = fixture();
      s.players[0].legendId = id(139);
      s.players[0].legendEmpowered = empowered;
      const u = unit(47),
        enemy = unit(16, 1);
      u.ready = false;
      u.location = enemy.location = "field:0";
      s.units = [u, enemy];
      combat(s);
      s = activate(s, "ven-wave3:legend:", "legend");
      expect(s.units.find((x) => x.id === u.id)!.location).toBe("base:0");
      expect(s.units.find((x) => x.id === u.id)!.ready).toBe(empowered);
      expect(s.players[0].legendUsedTurn).toBe(s.turn);
    },
  );
  it("Rogue Assassin cannot activate on an opponent's turn", () => {
    const s = fixture();
    s.players[0].legendId = id(139);
    s.units = [unit(47)];
    s.units[0].location = "field:0";
    combat(s);
    s.currentPlayer = 1;
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave3:legend:")),
    ).toBe(false);
  });
});

describe("Vendetta wave3 cross-set targeting", () => {
  it.each([151, 153])(
    "legend %i cannot choose a dynamically untargetable enemy",
    (n) => {
      const s = fixture();
      s.players[0].legendId = id(n);
      s.players[0].legendEmpowered = true;
      const yi = unit(47, 1);
      yi.cardId = "unl-059-219";
      yi.location = "field:0";
      s.units = [yi];
      s.players[1].xp = 16;
      expect(
        getLegalActions(s, 0).some(
          (a) => a.id.startsWith("ven-wave3:legend:") && a.targetId === yi.id,
        ),
      ).toBe(false);
      s.players[1].xp = 15;
      expect(
        getLegalActions(s, 0).some(
          (a) => a.id.startsWith("ven-wave3:legend:") && a.targetId === yi.id,
        ),
      ).toBe(true);
    },
  );
  it("Alpha Wildclaw protects a weaker ally from Mel's legend ability", () => {
    const s = fixture();
    s.players[0].legendId = id(151);
    s.players[0].legendEmpowered = true;
    const alpha = unit(16, 1);
    alpha.cardId = "unl-057-219";
    const ally = unit(47, 1);
    alpha.location = ally.location = "field:0";
    s.units = [alpha, ally];
    const actions = getLegalActions(s, 0).filter((a) =>
      a.id.startsWith("ven-wave3:legend:"),
    );
    expect(actions.some((a) => a.targetId === ally.id)).toBe(false);
    expect(actions.some((a) => a.targetId === alpha.id)).toBe(true);
  });
  it("legal action and keyword queries preserve state including absent expansion history", () => {
    const s = fixture();
    s.players[0].legendId = id(151);
    s.players[0].legendEmpowered = true;
    s.units = [unit(125), unit(47, 1)];
    s.units[1].location = "field:0";
    const before = JSON.stringify(s);
    getLegalActions(s, 0);
    for (const u of s.units) {
      getMight(s, u);
      getKeywords(s, u);
    }
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("Vendetta additional units and duels", () => {
  it("Akali is untargetable outside actual combat, including units not designated for that combat", () => {
    const s = fixture(),
      akali = unit(38, 1),
      ally = unit(47);
    akali.location = ally.location = "field:0";
    s.units = [akali, ally];
    s.players[0].hand = [id(52)];
    const canChoose = () =>
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(52) && a.targetId === akali.id,
      );
    expect(canChoose()).toBe(false);
    combat(s);
    expect(canChoose()).toBe(true);
    s.combat!.designatedUnits = [ally.id];
    expect(canChoose()).toBe(false);
    s.combat!.designatedUnits = [akali.id, ally.id];
    s.combat!.engaged = false;
    expect(canChoose()).toBe(false);
    s.phase = "main";
    s.currentPlayer = s.priorityPlayer = 1;
    s.players[1].hand = [id(52)];
    expect(getLegalActions(s, 1).some((a) => a.targetId === akali.id)).toBe(
      true,
    );
  });
  it("Akali gains two Might when moving to a battlefield, not when moving to base", () => {
    let s = fixture();
    const akali = unit(38);
    s.units = [akali];
    s = conquer(s, akali);
    expect(s.units[0].temporaryMight).toBe(2);
    s = resolve(
      s,
      38,
      [{ type: "moveTarget", target: "friendlyUnit" }],
      undefined,
      akali.id,
    );
    expect(s.units[0].location).toBe("base:0");
    expect(s.units[0].temporaryMight).toBe(2);
    expect(
      getScript(cards.find((c) => c.riftboundId === "ven-038a-166")!.id),
    ).toBe(getScript(id(38)));
  });
  it.each([false, true])(
    "Rampage deals simultaneous Might damage with additional Body paid=%s",
    (paid) => {
      let s = fixture();
      const own = unit(47),
        enemy = unit(84, 1);
      s.units = [own, enemy];
      own.temporaryMight = 6 - getMight(s, own);
      enemy.temporaryMight = 4 - getMight(s, enemy);
      s = play(s, 83, `${own.id}~${enemy.id}`, paid);
      expect(s.units).toHaveLength(1);
      expect(s.units[0].id).toBe(own.id);
      expect(s.units[0].damage).toBe(4);
      expect(getMight(s, s.units[0])).toBe(paid ? 8 : 6);
      expect(s.players[0].power).toBe(paid ? 49 : 50);
      expect(s.players[1].discard).toContain(id(84));
    },
  );
  it("Rampage fixes both targets and its cost before response, and still buffs the surviving friendly target", () => {
    let s = fixture();
    const own = unit(47),
      enemy = unit(84, 1);
    s.units = [own, enemy];
    s.players[0].hand = [id(83)];
    const action = getLegalActions(s, 0).find(
      (a) => a.cardId === id(83) && a.additionalCostPaid,
    )!;
    expect(action.targetId).toBe(`${own.id}~${enemy.id}`);
    s = applyAction(s, action);
    expect(s.pendingChoice).toBeNull();
    expect(s.players[0].power).toBe(49);
    s.units = s.units.filter((u) => u.id !== enemy.id);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(2);
    expect(s.units[0].damage).toBe(0);
  });
  it("Rampage does not buff or fight its former friendly target after control changes", () => {
    let s = fixture();
    const own = unit(47),
      enemy = unit(84, 1);
    s.units = [own, enemy];
    s.players[0].hand = [id(83)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.cardId === id(83) && a.additionalCostPaid,
      )!,
    );
    s.units[0].owner = 1;
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(0);
    expect(s.units.every((u) => u.damage === 0)).toBe(true);
  });
  it("Cataclysmic Duel collects both non-target choices before killing every other unit", () => {
    let s = fixture();
    const own = unit(174),
      ownOther = unit(47),
      enemy = unit(38, 1),
      enemyOther = unit(84, 1);
    s.units = [own, ownOther, enemy, enemyOther];
    s.players[0].hand = [id(90)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.cardId === id(90))!,
    );
    expect(s.pendingChoice).toBeNull();
    s = tickResolve(s);
    expect(s.pendingChoice?.player).toBe(0);
    const ownOptions = getLegalActions(s, 0);
    expect(ownOptions).toHaveLength(2);
    expect(ownOptions.every((a) => a.targetId === undefined)).toBe(true);
    s = applyAction(
      s,
      ownOptions.find((a) => a.label.includes("Irelia"))!,
    );
    expect(s.units).toHaveLength(4);
    expect(s.pendingChoice?.player).toBe(1);
    const enemyOptions = getLegalActions(s, 1);
    expect(enemyOptions).toHaveLength(2);
    s = applyAction(
      s,
      enemyOptions.find((a) => a.label.includes("Akali"))!,
    );
    s = settle(s);
    expect(s.units.map((u) => u.id).sort()).toEqual([own.id, enemy.id].sort());
    expect(s.units.find((u) => u.id === own.id)!.temporaryMight).toBe(0);
    expect(s.players[0].discard).toContain(id(47));
    expect(s.players[1].discard).toContain(id(84));
  });
  it("Cataclysmic Duel safely skips an empty player's selection", () => {
    let s = fixture();
    s.units = [unit(38, 1), unit(84, 1)];
    s = play(s, 90, undefined, false, (a) =>
      a.find((a) => a.label.includes("Akali")),
    );
    expect(s.units).toHaveLength(1);
    expect(s.units[0].cardId).toBe(id(38));
  });
  it("Cataclysmic Duel resolves on an empty board without a fake target", () => {
    const s = play(fixture(), 90);
    expect(s.units).toHaveLength(0);
  });
});

describe("Vendetta exact compact and special printings", () => {
  it("Draven's bonus continuously follows his controller's points", () => {
    const s = fixture(),
      u = unit(172);
    s.units = [u];
    expect(getMight(s, u)).toBe(3);
    s.players[0].points = 5;
    expect(getMight(s, u)).toBe(8);
    u.owner = 1;
    s.players[1].points = 2;
    expect(getMight(s, u)).toBe(5);
  });
  it("Irelia triggers for her owner's target and ready separately, and charges enemy Deflect", () => {
    let s = fixture();
    const u = unit(174);
    u.ready = false;
    s.units = [u];
    s.players[0].hand = [ogn(40)];
    // A real targeted ability creates its target trigger when finalized.
    const supporter = unit(47);
    supporter.cardId = ogn(132);
    s.units.push(supporter);
    s.players[0].hand = [ogn(132)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.cardId === ogn(132) && a.category === "play",
      )!,
    );
    s = settle(s, (a) => a.find((a) => a.targetId === u.id));
    const result = s.units.find((x) => x.id === u.id)!;
    expect(result.ready).toBe(true);
    expect(result.temporaryMight).toBe(2);
    s.currentPlayer = s.priorityPlayer = 1;
    s.players[1].hand = [id(52)];
    s = applyAction(
      s,
      getLegalActions(s, 1).find(
        (a) => a.cardId === id(52) && a.targetId === u.id,
      )!,
    );
    expect(s.players[1].power).toBe(
      49 + (getCard(id(52)).power ? -getCard(id(52)).power! : 0),
    );
    s = settle(s);
    expect(s.units.find((x) => x.id === u.id)!.temporaryMight).toBe(0);
  });
  it("Irelia is not triggered by an enemy's ready effect or by readying an already ready unit", () => {
    let s = fixture();
    const u = unit(174, 1);
    u.ready = false;
    s.units = [u];
    s = resolve(
      s,
      174,
      [{ type: "ready", target: "anyUnit" }],
      undefined,
      u.id,
    );
    expect(s.units[0].temporaryMight).toBe(0);
    s.units[0].owner = 0;
    s = resolve(s, 174, [{ type: "ready", condition: "self" }], u.id);
    expect(s.units[0].temporaryMight).toBe(0);
  });
  it("Viktor creates exactly one Recruit at base when his owner plays a card on the opposing turn", () => {
    let s = fixture();
    const viktor = unit(176),
      target = unit(84, 1);
    s.units = [viktor, target];
    s.currentPlayer = 1;
    s.stack = [
      { id: "opponent", player: 1, cardId: id(52), kind: "spell", effects: [] },
    ];
    s.players[0].hand = [id(52)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.cardId === id(52) && a.targetId === target.id,
      )!,
    );
    s = settle(s);
    const recruits = s.units.filter((u) => u.token);
    expect(recruits).toHaveLength(1);
    expect(recruits[0]).toMatchObject({
      owner: 0,
      location: "base:0",
      cardId: ogn(271),
    });
  });
  it("Viktor does not recruit for a card on his owner's turn or a played token", () => {
    let s = fixture();
    s.units = [unit(176), unit(84, 1)];
    s = play(s, 52, s.units[1].id);
    expect(s.units.filter((u) => u.token)).toHaveLength(0);
    s.currentPlayer = 1;
    s = resolve(s, 176, [
      { type: "token", cardName: "Recruit", location: "base" },
    ]);
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
  });
  it("Diana has Ambush and gains Might only for her controller's spells", () => {
    let s = fixture();
    const diana = unit(183),
      enemy = unit(84, 1);
    s.units = [diana, enemy];
    expect(getScript(id(183))!.ambush).toBe(true);
    s = play(s, 52, enemy.id);
    expect(s.units.find((u) => u.id === diana.id)!.temporaryMight).toBe(2);
    s = play(s, 11);
    expect(s.units.find((u) => u.id === diana.id)!.temporaryMight).toBe(2);
    s.currentPlayer = s.priorityPlayer = 1;
    s.players[1].hand = [id(56)];
    s = applyAction(
      s,
      getLegalActions(s, 1).find((a) => a.cardId === id(56))!,
    );
    s = settle(s);
    expect(s.units.find((u) => u.id === diana.id)!.temporaryMight).toBe(2);
  });
  it("Morgana declares her damage target before response and uses damage marked at resolution", () => {
    let s = fixture();
    const enemy = unit(84, 1);
    enemy.temporaryMight = 10;
    enemy.damage = 1;
    s.units = [enemy];
    s.players[0].hand = [id(186)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.cardId === id(186))!,
    );
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === enemy.id)!,
    );
    expect(s.stack[0].targetId).toBe(enemy.id);
    s.units.find((u) => u.id === enemy.id)!.damage = 3;
    s = settle(s);
    expect(s.units.find((u) => u.id === enemy.id)!.damage).toBe(6);
    expect(getScript(id(186))!.ambush).toBe(true);
  });
  it("Sett gains a buff on play and spends it as an upfront cost for four temporary Might", () => {
    let s = play(fixture(), 1004);
    const sett = s.units.find((u) => u.cardId === id(1004))!;
    expect(sett.buff).toBe(1);
    s.priorityPlayer = 0;
    const action = getLegalActions(s, 0).find(
      (a) => a.sourceId === sett.id && a.category === "ability",
    )!;
    s = applyAction(s, action);
    expect(s.units[0].buff).toBe(0);
    expect(s.units[0].temporaryMight).toBe(0);
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(8);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === sett.id && a.category === "ability",
      ),
    ).toBe(false);
  });
  it("Sett's conquest grants a new buff after his earlier buff was spent", () => {
    let s = fixture();
    const sett = unit(1004);
    s.units = [sett];
    s = conquer(s, sett);
    expect(s.units[0].buff).toBe(1);
  });
  it("Lux's Reaction resource ability resolves immediately and cannot fund units", () => {
    let s = fixture();
    const lux = unit(1006);
    s.units = [lux];
    s.players[0].energy = 0;
    s.players[0].hand = [id(47), id(52)];
    const action = getLegalActions(s, 0).find(
      (a) => a.sourceId === lux.id && a.category === "ability",
    )!;
    s = applyAction(s, action);
    expect(s.stack).toHaveLength(0);
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].spellEnergy).toBe(2);
    expect(s.players[0].energy).toBe(0);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(47) && a.category === "play",
      ),
    ).toBe(false);
    const spellAction = getLegalActions(s, 0).find(
      (a) => a.cardId === id(52) && a.targetId === lux.id,
    )!;
    expect(spellAction).toBeDefined();
    s = settle(applyAction(s, spellAction));
    expect(s.players[0].spellEnergy).toBe(2 - getCard(id(52)).energy!);
  });
});
