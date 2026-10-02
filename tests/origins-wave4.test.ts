import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  getGameView,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { originsWave4Scripts } from "../src/game/origins-wave4";
import type { GameAction, GameState, PlayerId, Unit } from "../src/game/types";
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const unit = (cardId: string, owner: PlayerId = 0, suffix = ""): Unit => ({
  id: `u:${cardId}:${owner}:${suffix}`,
  cardId,
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
});
function fixture() {
  const s = createGame({ seed: 3103 });
  s.phase = "main";
  s.turn = 6;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  s.combat = null;
  s.units = [];
  s.gears = [];
  for (const p of s.players) {
    p.legendId = ogn(251);
    p.hand = [];
    p.discard = [];
    p.deck = Array(30).fill(ogn(49));
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.cardsPlayedThisTurn = 0;
    p.legendUsedTurn = -1;
    p.hasBegun = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(275);
    f.controller = null;
  }
  return s;
}
type Chooser = (a: GameAction[], s: GameState) => GameAction | undefined;
function settle(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 150 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(a, s) ?? a[0])
      : a.find((a) => a.category === "pass");
    if (!action) throw new Error(`No settle action ${s.phase}`);
    s = applyAction(s, action);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function startPlay(s: GameState, cardId: string, targetId?: string) {
  s.players[s.priorityPlayer].hand.push(cardId);
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.targetId === targetId &&
      !a.additionalCostPaid &&
      !a.repeated &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `play ${cardId}`).toBeDefined();
  return applyAction(s, a!);
}
const play = (s: GameState, id: string, target?: string, choose?: Chooser) =>
  settle(startPlay(s, id, target), choose);
function move(s: GameState, uid: string, field = "field:0") {
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.id.startsWith("move-start:") &&
      a.sourceId === uid &&
      a.locationId === field,
  );
  expect(a).toBeDefined();
  return applyAction(applyAction(s, a!), "move-confirm");
}
function finishCombat(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 200 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    let action: GameAction | undefined;
    if (s.pendingChoice) action = choose?.(a, s) ?? a[0];
    else if (s.phase === "damage")
      action =
        a
          .filter((a) => a.id.startsWith("damage:"))
          .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ??
        a.find((a) => a.id === "damage-done");
    else action = a.find((a) => a.category === "pass");
    if (!action)
      throw new Error(`No combat action ${s.phase}: ${a.map((a) => a.id)}`);
    s = applyAction(s, action);
  }
  expect(s.combat).toBeNull();
  return s;
}
const decline: Chooser = (a) =>
  a.find((a) => a.id.endsWith("skip") || /decline/i.test(a.label));

function resolve(
  s: GameState,
  effects: import("../src/game/types").Effect[],
  targetId?: string,
  sourceId?: string,
  choose?: Chooser,
) {
  s.stack.push({
    id: `test-${s.nextId++}`,
    kind: "ability",
    player: 0,
    cardId: ogn(49),
    sourceId,
    targetId,
    effects,
  });
  return settle(s, choose);
}
function ability(s: GameState, sourceId: string) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) => a.category === "ability" && a.sourceId === sourceId,
  )!;
  expect(a).toBeDefined();
  return applyAction(s, a);
}

describe("Origins wave4 complete coverage", () => {
  it("registers 24 complete faces while keeping unresolved families unsupported", () => {
    expect(Object.keys(originsWave4Scripts)).toHaveLength(24);
    for (const [id, script] of Object.entries(originsWave4Scripts))
      expect(getScript(id)).toEqual(script);
    for (const id of [ogn(26), ogn(220), sfd(216), ogn(196)])
      expect(originsWave4Scripts[id]).toBeUndefined();
  });
  it.each([
    [40, "Fury"],
    [81, "Calm"],
    [120, "Mind"],
    [163, "Body"],
    [204, "Chaos"],
    [245, "Order"],
  ] as const)("Seal %i adds only %s Power immediately", (n, domain) => {
    let s = fixture();
    s.players[0].energy = 0;
    s.players[0].power = 0;
    s.gears = [{ id: "seal", owner: 0, cardId: ogn(n), ready: true }];
    s = ability(s, "seal");
    expect(s.stack).toHaveLength(0);
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].power).toBe(0);
    expect(s.players[0].typedPower?.[domain]).toBe(1);
  });
  it("typed Seal power can pay its domain but cannot pay a different domain", () => {
    let s = fixture();
    s.players[0].power = 0;
    s.gears = [{ id: "seal", owner: 0, cardId: ogn(40), ready: true }];
    s = ability(s, "seal");
    s.players[0].hand = [ogn(14), ogn(47)];
    s.units = [unit(ogn(49), 1)];
    s.units[0].location = "field:0";
    const actions = getLegalActions(s, 0);
    expect(actions.some((a) => a.cardId === ogn(14))).toBe(true);
    // Explicitly typed costs must not consume Fury as Calm.
    s.units.push(unit(sfd(82)));
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === s.units[1].id && a.category === "ability",
      ),
    ).toBe(false);
  });
});

describe("Ordered targets and movement", () => {
  it("Convergent Mutation calculates its increase from negative raw Might", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    a.temporaryMight = -7;
    b.temporaryMight = 4;
    s.units = [a, b];
    const desired = getMight(s, b);
    expect(getMight(s, a)).toBe(0);
    s = play(s, ogn(108), `${a.id}~${b.id}`);
    expect(getMight(s, s.units[0])).toBe(desired);
  });
  it("Convergent Mutation uses actual values when both Might attributes are negative", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    a.temporaryMight = -5 - (getCard(a.cardId).might ?? 0);
    b.temporaryMight = -2 - (getCard(b.cardId).might ?? 0);
    s.units = [a, b];
    const original = a.temporaryMight;
    s = play(s, ogn(108), `${a.id}~${b.id}`);
    expect(s.units[0].temporaryMight).toBe(original + 3);
    expect(getMight(s, s.units[0])).toBe(0);
  });
  it("Convergent Mutation offers both target orders and increases only the first", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    b.temporaryMight = 7;
    s.units = [a, b];
    s.players[0].hand = [ogn(108)];
    const targets = getLegalActions(s, 0)
      .filter((a) => a.cardId === ogn(108))
      .map((a) => a.targetId);
    expect(targets).toContain(`${a.id}~${b.id}`);
    expect(targets).toContain(`${b.id}~${a.id}`);
    const value = getMight(s, b);
    s = play(s, ogn(108), `${a.id}~${b.id}`);
    expect(getMight(s, s.units[0])).toBe(value);
    expect(getMight(s, s.units[1])).toBe(value);
  });
  it("Convergent Mutation never reduces Might and fails without the second live friendly unit", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    a.temporaryMight = 9;
    s.units = [a, b];
    const value = getMight(s, a);
    s = play(s, ogn(108), `${a.id}~${b.id}`);
    expect(getMight(s, s.units[0])).toBe(value);
    s.priorityPlayer = 0;
    s = startPlay(s, ogn(108), `${a.id}~${b.id}`);
    s.units = s.units.filter((u) => u.id !== b.id);
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(value);
  });
  it("Defiant Dance chooses both ordered targets before response and applies bonuses simultaneously", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    b.temporaryMight = 5;
    s.units = [a, b];
    s = startPlay(s, sfd(196), `${a.id}~${b.id}`);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack.at(-1)?.targetId).toBe(`${a.id}~${b.id}`);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(2);
    expect(s.units[1].temporaryMight).toBe(3);
  });
  it("Defiant Dance still changes the surviving target if the other leaves", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    s.units = [a, b];
    s = startPlay(s, sfd(196), `${a.id}~${b.id}`);
    s.units = s.units.filter((u) => u.id !== b.id);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(2);
  });
  it("Ride the Wind moves and then readies the original chosen unit", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.ready = false;
    s.units = [a];
    s.fields[0].controller = 0;
    s = play(s, ogn(173), a.id, (a) =>
      a.find((x) => x.locationId === "field:0"),
    );
    expect(s.units[0].location).toBe("field:0");
    expect(s.units[0].ready).toBe(true);
  });
  it("Tideturner chooses its partner before response and exchanges their current locations", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].controller = 0;
    s = startPlay(s, ogn(199));
    expect(s.pendingChoice?.kind).toBe("trigger");
    const choice = getLegalActions(s, 0).find((x) => x.targetId === a.id)!;
    s = applyAction(s, choice);
    const t = s.units.find((u) => u.cardId === ogn(199))!;
    expect(t.location).toBe("base:0");
    s = settle(s);
    expect(s.units.find((u) => u.id === t.id)?.location).toBe("field:0");
    expect(s.units.find((u) => u.id === a.id)?.location).toBe("base:0");
  });
  it("Tideturner can decline its optional trigger", () => {
    const s = play(fixture(), ogn(199), undefined, decline);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Tideturner cannot choose itself or another unit at the same location", () => {
    let s = fixture();
    const here = unit(ogn(49)),
      away = unit(ogn(50));
    away.location = "field:0";
    s.units = [here, away];
    s.fields[0].controller = 0;
    s = startPlay(s, ogn(199));
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.targetId)
        .map((a) => a.targetId),
    ).toEqual([away.id]);
  });
  it("Tideturner rechecks that its chosen partner remains at another location", () => {
    let s = fixture();
    const partner = unit(ogn(49));
    partner.location = "field:0";
    s.units = [partner];
    s.fields[0].controller = 0;
    s = startPlay(s, ogn(199));
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === partner.id)!,
    );
    s.units.find((u) => u.id === partner.id)!.location = "base:0";
    s = settle(s);
    expect(s.units.map((u) => u.location)).toEqual(["base:0", "base:0"]);
    expect(
      s.log.some((e) => e.text.includes("chosen target is no longer legal")),
    ).toBe(true);
  });
  it("Tideturner from Hidden can select the friendly unit at another location", () => {
    let s = fixture();
    const here = unit(ogn(49)),
      away = unit(ogn(50));
    here.location = "field:0";
    s.units = [here, away];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "tide",
        cardId: ogn(199),
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn - 1,
      },
    ];
    const action = getLegalActions(s, 0).find(
      (a) => a.sourceId === "hidden:tide",
    )!;
    expect(action).toBeDefined();
    s = applyAction(s, action);
    const choices = getLegalActions(s, 0);
    expect(choices.filter((a) => a.targetId).map((a) => a.targetId)).toEqual([
      away.id,
    ]);
    s = settle(
      applyAction(
        s,
        choices.find((a) => a.targetId === away.id)!,
      ),
    );
    expect(s.units.find((u) => u.cardId === ogn(199))?.location).toBe("base:0");
    expect(s.units.find((u) => u.id === away.id)?.location).toBe("field:0");
  });
  it("Vilemaw's Lair prevents ordinary and effect movement to base", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(295);
    s.fields[0].controller = 0;
    const a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    expect(
      getLegalActions(s, 0).some(
        (x) => x.sourceId === a.id && x.locationId === "base:0",
      ),
    ).toBe(false);
    s = resolve(s, [{ type: "moveTarget", target: "friendlyUnit" }], a.id);
    expect(s.units[0].location).toBe("field:0");
  });
  it("Ride the Wind may choose base from Vilemaw, ignores that move and still readies its unit", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(295);
    const a = unit(ogn(49));
    a.location = "field:0";
    a.ready = false;
    s.units = [a];
    let saw = false;
    s = play(s, ogn(173), a.id, (o) => {
      const base = o.find((x) => x.locationId === "base:0");
      if (base) saw = true;
      return base;
    });
    expect(saw).toBe(true);
    expect(s.units[0].location).toBe("field:0");
    expect(s.units[0].ready).toBe(true);
  });
});

describe("Spending buffs", () => {
  it("Worthy's paid ready effect respects Maduli's Cannot ready ability", () => {
    let s = fixture();
    const maduli = unit("unl-144-219");
    maduli.ready = false;
    s.units = [maduli];
    s = resolve(s, [
      { type: "special", custom: `sfd:pay-worthy|${maduli.id}` },
    ]);
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].power).toBe(29);
  });
  it("Overt can spend Maduli's buff but cannot ready him", () => {
    let s = fixture();
    const maduli = unit("unl-144-219");
    maduli.buff = 1;
    maduli.ready = false;
    s.units = [maduli];
    s = play(s, ogn(153), undefined, (o) =>
      o.find((a) => a.label.startsWith("Spend")),
    );
    expect(s.units[0].buff).toBe(1);
    expect(s.units[0].ready).toBe(false);
  });
  it("Overt Operation selectively spends buffs, readies those units and buffs all friendly units", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50)),
      c = unit(ogn(51));
    a.buff = b.buff = 1;
    a.ready = b.ready = c.ready = false;
    s.units = [a, b, c];
    s = play(s, ogn(153), undefined, (options) =>
      options.find((x) => x.label.startsWith("Spend")),
    );
    expect(s.units.map((u) => u.buff)).toEqual([1, 1, 1]);
    expect(s.units.map((u) => u.ready)).toEqual([true, true, false]);
  });
  it("Overt Operation can keep a buff and does not falsely trigger a ready event", () => {
    let s = fixture();
    s.players[0].legendId = ogn(251);
    s.fields[0].cardId = ogn(143);
    const a = unit(ogn(49));
    a.location = "field:0";
    a.buff = 1;
    a.ready = false;
    s.units = [a];
    s = play(s, ogn(153), undefined, (o) =>
      o.find((x) => x.label.startsWith("Keep")),
    );
    expect(s.units[0].buff).toBe(1);
    expect(s.units[0].ready).toBe(false);
    expect(s.units[0].temporaryMight).toBe(0);
  });
  it("Overt restores the spent buff before checking lethal damage", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.buff = 1;
    a.damage = getCard(a.cardId).might ?? 0;
    a.ready = false;
    s.units = [a];
    s = play(s, ogn(153), undefined, (o) =>
      o.find((x) => x.label.startsWith("Spend")),
    );
    expect(s.units).toHaveLength(1);
    expect(s.units[0].buff).toBe(1);
  });
  it("Albus can spend several buffs and channels exactly that many exhausted runes", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    a.buff = b.buff = 1;
    s.units = [a, b];
    s = play(s, ogn(230), undefined, (o) =>
      o.find((x) => x.label.startsWith("Spend")),
    );
    expect(s.units.filter((u) => u.buff)).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(2);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
  });
  it("Albus can choose zero without inventing runes", () => {
    const s = play(fixture(), ogn(230), undefined, (o) =>
      o.find((x) => x.label.startsWith("Finish")),
    );
    expect(s.players[0].runes).toHaveLength(0);
  });
});

describe("Combat and targeting watchers", () => {
  it("Ahri automatically weakens each attacker at her controlled battlefield without targeting", () => {
    let s = fixture();
    s.players[1].legendId = ogn(255);
    s.fields[0].controller = 1;
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    b.location = "field:0";
    b.temporaryMight = 9;
    s.units = [a, b];
    s = move(s, a.id);
    expect(s.pendingChoice).toBeNull();
    s = settle(s);
    expect(s.units.find((u) => u.id === a.id)?.temporaryMight).toBe(-1);
  });
  it("Ahri's reduction has a one-Might floor and does not affect attacks on neutral fields", () => {
    let s = fixture();
    s.players[1].legendId = ogn(255);
    s.fields[0].controller = 1;
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    a.temporaryMight = 1 - getMight(s, a);
    b.location = "field:0";
    s.units = [a, b];
    s = settle(move(s, a.id));
    expect(
      getMight(
        s,
        s.units.find((u) => u.id === a.id)!,
      ),
    ).toBe(1);
    let t = fixture();
    t.players[1].legendId = ogn(255);
    const c = unit(ogn(49));
    t.units = [c];
    t = settle(move(t, c.id));
    expect(t.units[0].temporaryMight).toBe(0);
  });
  it("Dreaming Tree draws once per player per turn on friendly spell targets, before the spell resolves", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(292);
    s.fields[0].controller = 0;
    const a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s = startPlay(s, sfd(3), a.id);
    expect(s.stack.at(-1)?.kind).toBe("trigger");
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(1);
    s.priorityPlayer = 0;
    s = play(s, sfd(3), a.id);
    expect(s.players[0].hand).toHaveLength(1);
    const save = serializeGame(s);
    s = deserializeGame(save);
    s.turn++;
    s.priorityPlayer = 0;
    s = play(s, sfd(3), a.id);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("Dreaming Tree ignores enemy targets and ability targets, and keeps separate player allowances", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(292);
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    a.location = b.location = "field:0";
    s.units = [a, b];
    s = play(s, sfd(3), b.id);
    expect(s.players[0].hand).toHaveLength(0);
    s.priorityPlayer = 0;
    s = resolve(
      s,
      [{ type: "might", target: "friendlyUnit", amount: 1 }],
      a.id,
    );
    expect(s.players[0].hand).toHaveLength(0);
    s.currentPlayer = s.priorityPlayer = 1;
    s = play(s, sfd(3), b.id);
    expect(s.players[1].hand).toHaveLength(1);
    s.currentPlayer = s.priorityPlayer = 0;
    s = play(s, sfd(3), a.id);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Ahri applies to later attacking reinforcements, once per designation", () => {
    let s = fixture();
    s.players[1].legendId = ogn(255);
    s.fields[0].controller = 1;
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1),
      c = unit(ogn(51));
    b.location = "field:0";
    b.temporaryMight = 20;
    s.units = [a, b, c];
    s = settle(move(s, a.id));
    s = resolve(
      s,
      [
        {
          type: "moveTarget",
          target: "friendlyUnit",
          condition: "chooseDestination",
        },
      ],
      c.id,
      undefined,
      (o) => o.find((x) => x.locationId === "field:0"),
    );
    expect(s.units.find((u) => u.id === c.id)?.temporaryMight).toBe(-1);
    expect(s.units.find((u) => u.id === a.id)?.temporaryMight).toBe(-1);
  });
  it("Lucian uses current Assault including auras and temporary Assault", () => {
    let s = fixture();
    const a = unit(sfd(28)),
      b = unit(ogn(50), 1),
      corporal = unit(ogn(15));
    b.location = corporal.location = "field:0";
    b.temporaryMight = 20;
    a.temporaryAssault = 2;
    s.units = [a, b, corporal];
    s.fields[0].controller = 1;
    s = move(s, a.id);
    s = settle(s, (o) => o.find((x) => x.targetId === b.id));
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(4);
  });
  it("Ezreal deals current Might to his announced target and contributes no combat damage", () => {
    let s = fixture();
    const a = unit(sfd(82)),
      b = unit(ogn(50), 1);
    a.temporaryMight = 3;
    b.temporaryMight = 20;
    b.location = "field:0";
    s.units = [a, b];
    s.fields[0].controller = 1;
    const amount = getMight(s, a);
    s = settle(move(s, a.id), (o) => o.find((x) => x.targetId === b.id));
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(amount);
    expect(getKeywords(s, s.units[0])).toContain("No combat damage");
  });
  it("Ezreal's Mind action moves him to base during a showdown and pays immediately", () => {
    let s = fixture();
    const a = unit(sfd(82));
    a.location = "field:0";
    s.units = [a];
    s.phase = "showdown";
    s.focusPlayer = 0;
    s = ability(s, a.id);
    expect(s.players[0].power).toBe(29);
    s = settle(s);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Loyal Pup can join its controller's defense and decline the optional move", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1),
      pup = unit(sfd(126), 1);
    b.location = "field:0";
    s.units = [a, b, pup];
    s.fields[0].controller = 1;
    s = settle(move(s, a.id));
    expect(s.units.find((u) => u.id === pup.id)?.location).toBe("field:0");
    let t = fixture();
    t.units = [unit(ogn(49)), unit(ogn(50), 1), unit(sfd(126), 1)];
    t.units[1].location = "field:0";
    t.fields[0].controller = 1;
    t = settle(move(t, t.units[0].id), decline);
    expect(t.units[2].location).toBe("base:1");
  });
});

describe("Paid and resolving choices", () => {
  it("Fae Porter pays Chaos and fixes its friendly target before response", () => {
    let s = fixture();
    const a = unit(sfd(125)),
      b = unit(ogn(49));
    s.units = [a, b];
    s.fields[0].controller = 0;
    s = move(s, a.id);
    const action = getLegalActions(s, 0).find((x) => x.targetId === b.id)!;
    expect(action).toBeDefined();
    s = applyAction(s, action);
    expect(s.players[0].power).toBe(29);
    expect(s.units[1].location).toBe("base:0");
    s = settle(s);
    expect(s.units[1].location).toBe("field:0");
  });
  it("Fae Porter has no paid option when its controller cannot pay Chaos", () => {
    let s = fixture();
    const a = unit(sfd(125)),
      b = unit(ogn(49));
    s.units = [a, b];
    s.players[0].power = 0;
    s.fields[0].controller = 0;
    s = move(s, a.id);
    expect(s.stack).toHaveLength(0);
    expect(s.pendingChoice).toBeNull();
    expect(s.units[1].location).toBe("base:0");
  });
  it("Fae Porter retains the triggering battlefield if the source moves again before resolution", () => {
    let s = fixture();
    const a = unit(sfd(125)),
      b = unit(ogn(49));
    s.units = [a, b];
    s.fields[0].controller = 0;
    s = move(s, a.id);
    s = applyAction(
      s,
      getLegalActions(s, 0).find((x) => x.targetId === b.id)!,
    );
    s.units[0].location = "field:1";
    s = settle(s);
    expect(s.units[1].location).toBe("field:0");
  });
  it.each([true, false])(
    "Hard Bargain lets the chosen spell's controller pay or decline (%s)",
    (pay) => {
      let s = fixture();
      s = startPlay(s, ogn(48));
      s.priorityPlayer = 1;
      s.players[1].hand = [sfd(136)];
      const id = s.stack[0].id;
      const action = getLegalActions(s, 1).find(
        (x) => x.cardId === sfd(136) && x.targetId === id && !x.repeated,
      )!;
      s = applyAction(s, action);
      s = settle(s, (o) =>
        o.find((x) =>
          pay ? x.label.startsWith("Pay") : x.label.startsWith("Decline"),
        ),
      );
      expect(s.players[0].hand.length).toBe(pay ? 1 : 0);
      expect(s.players[0].energy).toBe(pay ? 26 : 28);
    },
  );
  it("Guards pays Order when its separate ready trigger is finalized and opens a response window", () => {
    let s = fixture();
    s.players[0].power = 0;
    s.players[0].typedPower = { Order: 1 };
    s = startPlay(s, sfd(154));
    s = applyAction(applyAction(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("custom");
    s = applyAction(s, getLegalActions(s, s.priorityPlayer)[0]);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].ready).toBe(false);
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(s.players[0].typedPower?.Order).toBe(1);
    const ready = getLegalActions(s, 0).find(
      (a) => a.id !== "choose-trigger:skip",
    )!;
    expect(ready).toBeDefined();
    s = applyAction(s, ready);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack.at(-1)?.kind).toBe("trigger");
    expect(s.stack.at(-1)?.effects[0].chosenTargetId).toBe(s.units[0].id);
    expect(s.players[0].typedPower?.Order ?? 0).toBe(0);
    expect(s.units[0].ready).toBe(false);
    s.units = [];
    s = settle(s);
    expect(s.units).toHaveLength(0);
  });
  it("Guards cannot pay its ready trigger with a different domain", () => {
    let s = fixture();
    s.players[0].power = 0;
    s.players[0].typedPower = { Fury: 1 };
    s = play(s, sfd(154));
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].typedPower?.Fury).toBe(1);
  });
  it("Guards played from Hidden creates its Soldier at that battlefield", () => {
    let s = fixture();
    const guard = unit(ogn(49));
    guard.location = "field:0";
    s.units = [guard];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "guards",
        cardId: sfd(154),
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn - 1,
      },
    ];
    const action = getLegalActions(s, 0).find(
      (a) => a.sourceId === "hidden:guards",
    )!;
    expect(action).toBeDefined();
    s = settle(applyAction(s, action), (options, state) => {
      if (state.pendingChoice?.kind === "custom") {
        expect(options).toHaveLength(1);
        expect(options[0].label).toContain("field:0");
      }
      return options[0];
    });
    const soldier = s.units.find((u) => u.id !== guard.id)!;
    expect(getCard(soldier.cardId).name).toBe("Sand Soldier");
    expect(soldier.location).toBe("field:0");
  });
  it("Hard Bargain cannot offer payment with insufficient energy", () => {
    let s = fixture();
    s = startPlay(s, ogn(48));
    s.players[0].energy = 1;
    s.priorityPlayer = 1;
    s.players[1].hand = [sfd(136)];
    s = applyAction(
      s,
      getLegalActions(s, 1).find((a) => a.cardId === sfd(136) && !a.repeated)!,
    );
    let seen = false;
    s = settle(s, (a, state) => {
      if (state.pendingChoice?.kind === "custom") {
        seen = true;
        expect(a.some((x) => x.label.startsWith("Pay"))).toBe(false);
      }
      return a[0];
    });
    expect(seen).toBe(true);
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("repeated Hard Bargain requires two separate payments for the same spell", () => {
    let s = fixture();
    s = startPlay(s, ogn(48));
    s.priorityPlayer = 1;
    s.players[1].hand = [sfd(136)];
    const target = s.stack[0].id;
    const action = getLegalActions(s, 1).find(
      (a) =>
        a.cardId === sfd(136) &&
        a.repeated &&
        a.targetId === target &&
        a.repeatedTargetId === target,
    )!;
    expect(action).toBeDefined();
    s = applyAction(s, action);
    let payments = 0;
    s = settle(s, (o) => {
      const pay = o.find((a) => a.label.startsWith("Pay"));
      if (pay) payments++;
      return pay;
    });
    expect(payments).toBe(2);
    expect(s.players[0].energy).toBe(24);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Riposte cannot counter an uncounterable spell but still grants its Energy as Might", () => {
    let s = fixture();
    const own = unit(ogn(49)),
      enemy = unit(ogn(50), 1);
    enemy.temporaryMight = 10;
    s.units = [own, enemy];
    const spellId = cards.find((c) => c.riftboundId === "ven-015-166")!.id;
    s.stack = [
      {
        id: "uncounterable",
        kind: "spell",
        player: 1,
        cardId: spellId,
        effects: [],
        targetId: own.id,
      },
    ];
    s.players[0].hand = [sfd(206)];
    const action = getLegalActions(s, 0).find(
      (a) => a.cardId === sfd(206) && a.targetId === `${own.id}~uncounterable`,
    )!;
    expect(action).toBeDefined();
    s = applyAction(s, action);
    s = applyAction(applyAction(s, "pass"), "pass");
    expect(s.stack.some((x) => x.id === "uncounterable")).toBe(true);
    expect(s.units[0].temporaryMight).toBe(getCard(spellId).energy);
  });
  it.each([true, false])(
    "Guards plays a two-Might Soldier and optionally pays Order to ready it (%s)",
    (pay) => {
      let s = fixture();
      s = play(s, sfd(154), undefined, (o, state) =>
        state.pendingChoice?.kind === "trigger"
          ? o.find((x) =>
              pay ? !x.id.endsWith("skip") : x.id.endsWith("skip"),
            )
          : o[0],
      );
      expect(s.units).toHaveLength(1);
      expect(getCard(s.units[0].cardId).name).toBe("Sand Soldier");
      expect(getMight(s, s.units[0])).toBe(2);
      expect(s.units[0].ready).toBe(pay);
    },
  );
  it("Deathgrip fixes the victim and recipient before response and reads Might on resolution", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    b.temporaryMight = 4;
    s.units = [a, b];
    s = startPlay(s, sfd(163), `${b.id}~${a.id}`);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack.at(-1)?.targetId).toBe(`${b.id}~${a.id}`);
    s.units[1].temporaryMight += 2;
    const amount = getMight(s, s.units[1]);
    s = settle(s, () => {
      throw new Error("Deathgrip cannot choose new targets on resolution");
    });
    expect(s.units).toHaveLength(1);
    expect(s.units[0].temporaryMight).toBe(amount);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Deathgrip still kills its fixed victim and draws if its recipient disappeared", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    s.units = [a, b];
    s = startPlay(s, sfd(163), `${b.id}~${a.id}`);
    s.units = s.units.filter((u) => u.id !== a.id);
    s = settle(s);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Deathgrip requires two distinct friendly units when it is played", () => {
    let s = fixture();
    const a = unit(ogn(49));
    s.units = [a];
    s.players[0].hand = [sfd(163)];
    expect(
      getLegalActions(s, 0).filter((a) => a.cardId === sfd(163)),
    ).toHaveLength(0);
  });
  it("Deathgrip still draws without boosting the recipient if its victim disappeared", () => {
    let s = fixture();
    const victim = unit(ogn(49)),
      recipient = unit(ogn(50));
    s.units = [victim, recipient];
    s = startPlay(s, sfd(163), `${victim.id}~${recipient.id}`);
    s.units = s.units.filter((u) => u.id !== victim.id);
    s = settle(s);
    expect(s.units.map((u) => u.id)).toEqual([recipient.id]);
    expect(s.units[0].temporaryMight).toBe(0);
    expect(s.players[0].hand).toHaveLength(1);
  });
});

describe("Field and duel restrictions", () => {
  it("Deathgrip grants no Might when the chosen victim's death is replaced, but still draws", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50));
    b.deathReplacementTurn = s.turn;
    s.units = [a, b];
    s = play(s, sfd(163), `${b.id}~${a.id}`);
    expect(s.units).toHaveLength(2);
    expect(s.units.find((u) => u.id === a.id)?.temporaryMight).toBe(0);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Marching Orders allows a friendly base unit and only battlefield enemies, with Repeat", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1),
      c = unit(ogn(51), 1);
    a.temporaryMight = 9;
    b.location = "field:0";
    s.units = [a, b, c];
    s.players[0].hand = [sfd(114)];
    const actions = getLegalActions(s, 0).filter((x) => x.cardId === sfd(114));
    expect(actions.length).toBeGreaterThan(1);
    expect(actions.every((x) => x.targetId === `${a.id}~${b.id}`)).toBe(true);
    expect(actions.some((x) => x.repeated)).toBe(true);
    s = play(s, sfd(114), `${a.id}~${b.id}`);
    expect(s.units.some((u) => u.id === b.id)).toBe(false);
    expect(s.units.some((u) => u.id === c.id)).toBe(true);
  });
  it("Marching Orders does no duel damage if the enemy moves to base in response", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(50), 1);
    b.location = "field:0";
    s.units = [a, b];
    s = startPlay(s, sfd(114), `${a.id}~${b.id}`);
    s.units[1].location = "base:1";
    s = settle(s);
    expect(s.units.map((u) => u.damage)).toEqual([0, 0]);
  });
  it("Tianna at a battlefield prevents enemy effect points; at base she does not", () => {
    let s = fixture();
    const t = unit(sfd(60), 1);
    t.location = "field:0";
    s.units = [t];
    s = resolve(s, [{ type: "score", amount: 1 }]);
    expect(s.players[0].points).toBe(0);
    s.units[0].location = "base:1";
    s = resolve(s, [{ type: "score", amount: 1 }]);
    expect(s.players[0].points).toBe(1);
  });
  it("Tianna prevents conquest points and her controller may still score", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      t = unit(sfd(60), 1);
    t.location = "field:1";
    s.units = [a, t];
    s.fields[1].controller = 1;
    s = finishCombat(move(s, a.id));
    expect(s.players[0].points).toBe(0);
    s = resolve(s, [{ type: "score", amount: 1, who: "opponent" }]);
    expect(s.players[1].points).toBe(1);
  });
  it("Tianna prevents enemy burnout points while her controller still recycles and draws", () => {
    let s = fixture();
    const tianna = unit(sfd(60), 1);
    tianna.location = "field:1";
    s.units = [tianna];
    s.players[1].deck = [];
    s.players[1].discard = [ogn(49)];
    const prior = s.players[1].fatigue;
    s = resolve(s, [{ type: "draw", amount: 1, who: "opponent" }]);
    expect(s.players[0].points).toBe(0);
    expect(s.players[1].fatigue).toBe(prior + 1);
    expect(s.players[1].hand).toEqual([ogn(49)]);
  });
  it("Tianna still allows the replacement draw for a first conquest at seven points", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      tianna = unit(sfd(60), 1);
    tianna.location = "field:1";
    s.units = [a, tianna];
    s.fields[1].controller = 1;
    s.players[0].points = 7;
    s = finishCombat(move(s, a.id));
    expect(s.players[0].points).toBe(7);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].conqueredThisTurn).toContain(0);
  });
  it("custom choice state round-trips and opponent views hide choice options", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.buff = 1;
    s.units = [a];
    s = startPlay(s, ogn(153));
    s = applyAction(applyAction(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("custom");
    expect(getGameView(s, 1).pendingChoice?.options).toBeUndefined();
    s = deserializeGame(serializeGame(s));
    expect(settle(s).units[0].buff).toBe(1);
  });
});
