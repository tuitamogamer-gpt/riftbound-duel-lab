import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  getKeywords,
  getMight,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { validState } from "../src/persistence";
import { vendettaWave4Scripts } from "../src/game/vendetta-wave4";
import type {
  Effect,
  GameAction,
  GameState,
  Gear,
  PlayerId,
  Unit,
} from "../src/game/types";

const code = (n: number) =>
  n >= 1000
    ? `ven-${String(n - 1000).padStart(3, "0")}a-166`
    : `ven-${String(n).padStart(3, "0")}-166`;
const id = (n: number) => cards.find((c) => c.riftboundId === code(n))!.id;
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
function fixture(): GameState {
  const s = createGame({ seed: 497 });
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
      legendUsedTurn: -1,
      championAvailable: false,
      hasBegun: true,
      points: 0,
      xp: 0,
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
function gear(n: number, owner: PlayerId = 0, suffix = ""): Gear {
  return { id: `g${n}${owner}${suffix}`, cardId: id(n), owner, ready: false };
}
function settle(
  initial: GameState,
  choose?: (a: GameAction[], s: GameState) => GameAction | undefined,
): GameState {
  let s = initial;
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(actions, s) ??
        actions.find((a) => a.id !== "choose-trigger:skip") ??
        actions[0])
      : actions.find((a) => a.id === "pass");
    if (!action) throw Error(`No continuation: ${actions.map((a) => a.id)}`);
    s = applyAction(s, action);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function start(
  s: GameState,
  n: number,
  targetId?: string,
  p: PlayerId = 0,
  location?: Unit["location"],
  mode?: string,
) {
  s.players[p].hand.push(id(n));
  s.priorityPlayer = p;
  const a = getLegalActions(s, p).find(
    (a) =>
      a.category === "play" &&
      a.cardId === id(n) &&
      a.targetId === targetId &&
      (!location
        ? !a.locationId || a.locationId === `base:${p}`
        : a.locationId === location) &&
      (!mode || a.label.includes(mode)),
  );
  expect(
    a,
    `play ${getCard(id(n)).name}: ${getLegalActions(s, p)
      .map((a) => a.label)
      .join(" | ")}`,
  ).toBeDefined();
  return applyAction(s, a!);
}
function play(
  s: GameState,
  n: number,
  targetId?: string,
  choose?: (a: GameAction[]) => GameAction | undefined,
) {
  return settle(start(s, n, targetId), choose);
}
function resolve(
  s: GameState,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  p: PlayerId = 0,
) {
  s.stack.push({
    id: "test",
    kind: "ability",
    cardId: id(35),
    player: p,
    targetId,
    sourceId,
    locationId: s.units.find((u) => u.id === sourceId)?.location,
    effects,
  });
  return settle(s);
}
function activate(
  s: GameState,
  prefix: string,
  sourceId: string,
  targetId?: string,
) {
  s.priorityPlayer = 0;
  const a = getLegalActions(s, 0).find(
    (a) =>
      a.id.startsWith(prefix) &&
      a.sourceId === sourceId &&
      (!targetId || a.targetId === targetId),
  );
  expect(a, `${prefix} ${sourceId}`).toBeDefined();
  return settle(applyAction(s, a!));
}
function attack(s: GameState, u: Unit) {
  s.priorityPlayer = 0;
  s = applyAction(s, `move-start:${u.id}:field:0`);
  return applyAction(s, "move-confirm");
}
function conquer(s: GameState, u: Unit) {
  s = attack(s, u);
  for (
    let i = 0;
    i < 100 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    s = applyAction(
      s,
      s.pendingChoice ? a[0] : a.find((a) => a.id === "pass")!,
    );
  }
  expect(s.combat).toBeNull();
  return s;
}
function combat(s: GameState, assigning: PlayerId = 0) {
  s.phase = "damage";
  s.priorityPlayer = assigning;
  s.combat = {
    fieldId: "field:0",
    attacker: 0,
    defender: 1,
    stage: "assign",
    engaged: true,
    total: [5, 5],
    remaining: [5, 5],
    assignments: [{}, {}],
    assigningPlayer: assigning,
    designatedUnits: s.units
      .filter((u) => u.location === "field:0")
      .map((u) => u.id),
  };
}

describe("Vendetta wave4 edge cases", () => {
  it.each([false, true])(
    "Heimerdinger copies Defender's dependent ready-two ability using his own Empowered status=%s",
    (empowered) => {
      let s = fixture();
      s.players[0].legendId = id(149);
      s.players[0].legendEmpowered = !empowered;
      const heimer = unit(47);
      heimer.cardId = ogn(111);
      heimer.empowered = empowered;
      s.units = [heimer];
      s.gears = [gear(11), gear(73, 1)];
      const actions = getLegalActions(s, 0).filter(
        (a) =>
          a.sourceId === heimer.id &&
          a.category === "ability" &&
          a.targetId?.includes("~"),
      );
      expect(actions).toHaveLength(empowered ? 1 : 0);
      if (empowered) {
        s = applyAction(s, actions[0]);
        expect(s.units[0].ready).toBe(false);
        expect(s.players[0].energy).toBe(49);
        s.units[0].empowered = false;
        s = settle(s);
        expect(s.gears.every((g) => g.ready)).toBe(true);
      } else
        expect(
          getLegalActions(s, 0).some(
            (a) => a.sourceId === heimer.id && a.targetId === s.gears[0].id,
          ),
        ).toBe(true);
    },
  );
  it("Crumbling Sands may counter the first of two opposing spells, per the August FAQ", () => {
    let s = fixture();
    const friend = unit(84);
    s.units = [friend];
    s.currentPlayer = 1;
    s = start(s, 52, friend.id, 1);
    const first = s.stack[0].id;
    s = start(s, 52, friend.id, 1);
    s = start(s, 39, first);
    s = applyAction(s, "pass");
    s = applyAction(s, "pass");
    expect(s.stack.some((item) => item.id === first)).toBe(false);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(-2);
  });
  it("Dominus calculates its Might modification from the raw negative value", () => {
    let s = fixture();
    const target = unit(47);
    target.temporaryMight = -3 - getCard(target.cardId).might!;
    s.units = [target];
    expect(getMight(s, target, false)).toBe(-3);
    s = play(s, 142, target.id);
    expect(getMight(s, s.units[0], false)).toBe(-6);
    expect(getMight(s, s.units[0])).toBe(0);
  });
  it("Decree of Unity revalidates gear control and domain before resolution", () => {
    for (const change of ["control", "domain"] as const) {
      let s = fixture();
      const g = gear(108, 1);
      s.gears = [g];
      s = start(s, 131, g.id);
      if (change === "control") s.gears[0].owner = 0;
      else s.gears[0].cardId = id(11);
      s = settle(s);
      expect(s.gears).toHaveLength(1);
    }
  });
  it("Akali's move trigger retains its captured battlefield after the source leaves, per the August FAQ", () => {
    let s = fixture();
    const akali = unit(21),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    s.units = [akali, enemy];
    s = attack(s, akali);
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === enemy.id)!,
    );
    s.units = s.units.filter((u) => u.id !== akali.id);
    s = settle(s);
    expect(s.units[0].damage).toBe(1);
  });
  it("Sanction's Disempower mode cancels when its target is no longer empowered", () => {
    let s = fixture();
    const target = unit(84);
    target.empowered = true;
    s.units = [target];
    s = start(s, 35, target.id, 0, undefined, "Disempower");
    s.units[0].empowered = false;
    s = settle(s);
    s = settle(applyAction(s, "end-turn"));
    expect(s.units.find((u) => u.id === target.id)!.empowered).toBe(false);
  });
  it("Rengar's permission needs actual enemy units, not merely an enemy-controlled battlefield", () => {
    const s = fixture();
    s.fields[0].controller = 1;
    s.players[0].hand = [id(179)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(179) && a.locationId === "field:0",
      ),
    ).toBe(false);
  });
  it("Kha'Zix can decline his attack trigger without spending XP", () => {
    let s = fixture();
    const hunter = unit(180),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    s.units = [hunter, enemy];
    s.players[0].xp = 3;
    s = attack(s, hunter);
    s = applyAction(s, "choose-trigger:skip");
    s = settle(s);
    expect(s.players[0].xp).toBe(3);
    expect(s.units[1].damage).toBe(0);
  });
  it("compact Rage Fueled offers Accelerate and enters ready after its extra cost is paid", () => {
    let s = fixture();
    s.players[0].hand = [id(1019)];
    const action = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === id(1019) &&
        a.id.includes("accelerate") &&
        a.locationId === "base:0",
    )!;
    expect(action).toBeDefined();
    s = settle(applyAction(s, action));
    expect(s.units[0].ready).toBe(true);
    expect(s.players[0].energy).toBe(50 - getCard(id(1019)).energy! - 1);
    expect(s.players[0].power).toBe(50 - (getCard(id(1019)).power ?? 0) - 1);
  });
});

describe("Vendetta wave4 exact registry", () => {
  it("registers every explicitly reviewed provider record without collector-number collisions", () => {
    for (const [id, script] of Object.entries(vendettaWave4Scripts)) {
      expect(getCard(id).set).toBe("VEN");
      expect(getScript(id)).toBe(script);
    }
    expect(Object.keys(vendettaWave4Scripts).length).toBeGreaterThan(25);
    const rune = cards.find((c) => c.riftboundId === "ven-r04")!;
    expect(vendettaWave4Scripts[rune.id]).toBeUndefined();
  });
});

describe("Vendetta domain restrictions and counter rules", () => {
  it("Decree of Rage targets enemy Calm units only and cannot be countered", () => {
    let s = fixture();
    const calm = unit(38, 1),
      body = unit(84, 1),
      friend = unit(47);
    calm.cardId = ogn(49);
    calm.temporaryMight = 6;
    s.units = [calm, body, friend];
    s.players[0].hand = [id(15)];
    const actions = getLegalActions(s, 0).filter((a) => a.cardId === id(15));
    expect(actions.map((a) => a.targetId)).toEqual([calm.id]);
    s = applyAction(s, actions[0]);
    const spell = s.stack[0];
    s = resolve(
      s,
      [{ type: "counter", target: "spell" }],
      spell.id,
      undefined,
      1,
    );
    expect(s.units.find((u) => u.id === calm.id)!.damage).toBe(4);
    expect(getScript(id(15))!.uncounterable).toBe(true);
  });
  it("Decree of Insight ignores Deflect while targeting only an enemy Body unit", () => {
    let s = fixture();
    const enemy = unit(92, 1),
      calm = unit(47, 1);
    enemy.empowered = true;
    enemy.temporaryMight = 8;
    s.units = [enemy, calm];
    s.players[0].power = 0;
    s.players[0].runes = [];
    s.players[0].hand = [id(61)];
    const actions = getLegalActions(s, 0).filter((a) => a.cardId === id(61));
    expect(actions.map((a) => a.targetId)).toEqual([enemy.id]);
    s = settle(applyAction(s, actions[0]));
    expect(s.units.find((u) => u.id === enemy.id)!.temporaryMight).toBe(3);
    expect(s.players[0].runes).toHaveLength(0);
  });
  it("Decree of Unity can kill Chaos gear and Chaos units in base, but no friendly or other-domain object", () => {
    let s = fixture();
    const enemy = unit(125, 1),
      chaos = unit(111, 1),
      friend = unit(111),
      g = gear(94, 1);
    g.cardId = id(108);
    s.units = [enemy, chaos, friend];
    s.gears = [g];
    s.players[0].hand = [id(131)];
    const ids = getLegalActions(s, 0)
      .filter((a) => a.cardId === id(131))
      .map((a) => a.targetId);
    expect(ids).toContain(chaos.id);
    expect(ids).toContain(g.id);
    expect(ids).not.toContain(enemy.id);
    expect(ids).not.toContain(friend.id);
    s = settle(
      applyAction(
        s,
        getLegalActions(s, 0).find(
          (a) => a.cardId === id(131) && a.targetId === g.id,
        )!,
      ),
    );
    expect(s.gears).toHaveLength(0);
    expect(s.players[1].discard).toContain(id(108));
  });
  it("Decree of Unity revalidates an enemy unit's control before resolution", () => {
    let s = fixture();
    const target = unit(111, 1);
    s.units = [target];
    s = start(s, 131, target.id);
    s.units[0].owner = 0;
    s = settle(s);
    expect(s.units).toHaveLength(1);
  });
  it("Crumbling Sands does not counter an opponent's first spell", () => {
    let s = fixture();
    const own = unit(84),
      enemy = unit(47, 1);
    s.units = [own, enemy];
    s.currentPlayer = 1;
    s = start(s, 52, own.id, 1);
    const target = s.stack[0].id;
    s = start(s, 39, target);
    s = settle(s);
    expect(s.units.find((u) => u.id === own.id)!.temporaryMight).toBe(-2);
  });
  it("Crumbling Sands counts earlier finalized spells, including one still on the chain", () => {
    let s = fixture();
    const own = unit(84),
      enemy = unit(47, 1);
    s.units = [own, enemy];
    s.currentPlayer = 1;
    s = start(s, 52, own.id, 1);
    const earlier = s.stack[0].id;
    s = start(s, 52, own.id, 1);
    s = start(s, 39, s.stack[1].id);
    s = settle(s);
    expect(s.units.find((u) => u.id === own.id)!.temporaryMight).toBe(-2);
    expect(s.players[1].discard.filter((c) => c === id(52))).toHaveLength(2);
    expect(earlier).toBeTruthy();
  });
  it("Crumbling Sands may counter your spell when the opponent played another spell, and resets its history each turn", () => {
    let s = fixture();
    const own = unit(84),
      enemy = unit(47, 1);
    s.units = [own, enemy];
    s.currentPlayer = 1;
    s = start(s, 52, own.id, 1);
    s = start(s, 52, enemy.id);
    s = start(s, 39, s.stack.at(-1)!.id);
    s = settle(s);
    expect(s.units.find((u) => u.id === enemy.id)!.temporaryMight).toBe(0);
    s.turn++;
    s.currentPlayer = 0;
    s = start(s, 52, enemy.id);
    s = start(s, 39, s.stack[0].id);
    s = settle(s);
    expect(s.units.find((u) => u.id === enemy.id)!.temporaryMight).toBe(-2);
  });
});

describe("Vendetta combat and move restrictions", () => {
  it.each([0, 1] as const)(
    "Dune Surfer lets assigning player %i ignore Tank here",
    (p) => {
      const s = fixture(),
        surfer = unit(4, p),
        tank = unit(47, p === 0 ? 1 : 0),
        other = unit(84, p === 0 ? 1 : 0);
      tank.temporaryKeywords = ["Tank"];
      s.units = [surfer, tank, other];
      s.units.forEach((u) => (u.location = "field:0"));
      combat(s, p);
      expect(getLegalActions(s, p).some((a) => a.targetId === other.id)).toBe(
        true,
      );
      surfer.location = `base:${p}`;
      expect(getLegalActions(s, p).some((a) => a.targetId === other.id)).toBe(
        false,
      );
    },
  );
  it("Akali fixes eligible move-to/from battlefields before response and pays Empower Fury", () => {
    let s = fixture();
    const akali = unit(21),
      target = unit(47, 1),
      elsewhere = unit(84, 1);
    target.location = "field:0";
    elsewhere.location = "field:1";
    s.units = [akali, target, elsewhere];
    s = activate(s, "ven-wave4:empower:", akali.id);
    expect(s.players[0].energy).toBe(48);
    expect(s.players[0].power).toBe(49);
    expect(getMight(s, s.units[0])).toBe(getCard(id(21)).might! + 1);
    s = attack(s, s.units[0]);
    expect(s.pendingChoice?.kind).toBe("trigger");
    const options = getLegalActions(s, 0);
    expect(options.some((a) => a.targetId === target.id)).toBe(true);
    expect(options.some((a) => a.targetId === elsewhere.id)).toBe(false);
    s = applyAction(
      s,
      options.find((a) => a.targetId === target.id)!,
    );
    s.units.find((u) => u.id === target.id)!.location = "field:1";
    s = settle(s);
    expect(s.units.find((u) => u.id === target.id)!.damage).toBe(0);
  });
  it("Akali can deal one damage at the battlefield she left when recalled", () => {
    let s = fixture();
    const akali = unit(21),
      target = unit(84, 1);
    akali.location = target.location = "field:0";
    s.units = [akali, target];
    s = resolve(s, [{ type: "moveTarget", target: "friendlyUnit" }], akali.id);
    expect(s.units.find((u) => u.id === target.id)!.damage).toBe(1);
    expect(s.units.find((u) => u.id === akali.id)!.location).toBe("base:0");
  });
  it("Akali's damage amount follows her live empowered status, and the move trigger is optional", () => {
    let s = fixture();
    const akali = unit(21),
      target = unit(84, 1);
    target.location = "field:0";
    s.units = [akali, target];
    s = attack(s, akali);
    expect(
      getLegalActions(s, 0).some((a) => a.id === "choose-trigger:skip"),
    ).toBe(true);
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === target.id)!,
    );
    s.units.find((u) => u.id === akali.id)!.empowered = true;
    s = settle(s);
    expect(s.units.find((u) => u.id === target.id)!.damage).toBe(2);
  });
  it("Empowered Ambessa attacks with Assault 2 and can choose only a weaker enemy here", () => {
    let s = fixture();
    const ambessa = unit(136),
      weak = unit(47, 1),
      strong = unit(84, 1),
      away = unit(47, 1, "away");
    weak.location = strong.location = "field:0";
    away.location = "field:1";
    strong.temporaryMight = 30;
    s.units = [ambessa, weak, strong, away];
    s = activate(s, "ven-wave4:empower:", ambessa.id);
    expect(s.players[0].energy).toBe(49);
    expect(s.players[0].power).toBe(48);
    s = attack(s, s.units[0]);
    expect(getMight(s, s.units[0])).toBe(getCard(id(136)).might! + 2);
    const a = getLegalActions(s, 0).filter((a) => a.targetId);
    // With one legal target the trigger may already be finalized automatically.
    const target =
      s.stack.find((i) => i.cardId === id(136))?.targetId ?? a[0]?.targetId;
    expect(target).toBe(weak.id);
    s = settle(s);
    expect(s.units.some((u) => u.id === weak.id)).toBe(false);
    expect(s.units.some((u) => u.id === strong.id)).toBe(true);
  });
  it("Ambessa's kill fails if the selected enemy is no longer weaker", () => {
    let s = fixture();
    const ambessa = unit(136),
      weak = unit(47, 1);
    ambessa.empowered = true;
    weak.location = "field:0";
    s.units = [ambessa, weak];
    s = attack(s, ambessa);
    if (s.pendingChoice)
      s = applyAction(
        s,
        getLegalActions(s, 0).find((a) => a.targetId === weak.id)!,
      );
    s.units.find((u) => u.id === weak.id)!.temporaryMight = 30;
    s = settle(s);
    expect(s.units.some((u) => u.id === weak.id)).toBe(true);
  });
  it("Unempowered Ambessa has no attack kill trigger", () => {
    let s = fixture();
    const ambessa = unit(136),
      enemy = unit(47, 1);
    enemy.location = "field:0";
    s.units = [ambessa, enemy];
    s = attack(s, ambessa);
    s = settle(s);
    expect(s.units.some((u) => u.id === enemy.id)).toBe(true);
    expect(getKeywords(s, s.units[0])).not.toContain("Assault 2");
  });
});

describe("Vendetta temporary status and activated costs", () => {
  it.each([true, false])(
    "Sanction's Empower mode ends unempowered even when previously empowered=%s",
    (already) => {
      let s = fixture();
      const target = unit(84);
      target.empowered = already;
      s.units = [target];
      s = settle(start(s, 35, target.id, 0, undefined, "Empower a unit"));
      expect(s.units[0].empowered).toBe(true);
      expect(validState(JSON.parse(JSON.stringify(s)))).toBe(true);
      s = applyAction(s, "end-turn");
      s = settle(s);
      expect(s.units.find((u) => u.id === target.id)!.empowered).toBe(false);
    },
  );
  it("Sanction's Disempower mode is restricted upfront and empowers the same unit at end of turn", () => {
    let s = fixture();
    const target = unit(84),
      other = unit(47);
    target.empowered = true;
    s.units = [target, other];
    s.players[0].hand = [id(35)];
    const actions = getLegalActions(s, 0).filter(
      (a) => a.cardId === id(35) && a.label.includes("Disempower"),
    );
    expect(actions.map((a) => a.targetId)).toEqual([target.id]);
    s = settle(applyAction(s, actions[0]));
    expect(s.units[0].empowered).toBe(false);
    s = settle(applyAction(s, "end-turn"));
    expect(s.units.find((u) => u.id === target.id)!.empowered).toBe(true);
  });
  it("Sanction does not affect a replayed object after its original target left the board", () => {
    let s = fixture();
    const target = unit(84);
    s.units = [target];
    s = settle(start(s, 35, target.id, 0, undefined, "Empower a unit"));
    s = resolve(s, [{ type: "bounce", target: "friendlyUnit" }], target.id);
    s = play(s, 84);
    const replayed = s.units[0];
    replayed.empowered = true;
    s = settle(applyAction(s, "end-turn"));
    expect(s.units.find((u) => u.id === replayed.id)!.empowered).toBe(true);
  });
  it("Sky Cruiser discards only gear, pays energy and Deflect, and exhausts before response", () => {
    let s = fixture();
    const cruiser = unit(60),
      target = unit(92, 1);
    target.empowered = true;
    target.temporaryMight = 10;
    target.location = "field:0";
    s.units = [cruiser, target];
    s.players[0].hand = [id(11), id(47)];
    const actions = getLegalActions(s, 0).filter((a) =>
      a.id.startsWith("ven-wave4:cruiser:"),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].cardIndices).toEqual([0]);
    s = applyAction(s, actions[0]);
    expect(s.players[0].hand).toEqual([id(47)]);
    expect(s.players[0].discard).toContain(id(11));
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].energy).toBe(49);
    expect(s.players[0].power).toBe(49);
    expect(s.units[1].damage).toBe(0);
    s = settle(s);
    expect(s.units[1].damage).toBe(4);
  });
  it("Sky Cruiser cannot use units as its discard cost or target a unit in base", () => {
    const s = fixture();
    s.units = [unit(60), unit(84, 1)];
    s.players[0].hand = [id(47)];
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave4:cruiser:")),
    ).toBe(false);
    s.players[0].hand = [id(11)];
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave4:cruiser:")),
    ).toBe(false);
  });
  it("Sky Cruiser respects dynamic enemy untargetability", () => {
    const s = fixture();
    const cruiser = unit(60),
      enemy = unit(38, 1);
    enemy.location = "field:0";
    s.units = [cruiser, enemy];
    s.players[0].hand = [id(11)];
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave4:cruiser:")),
    ).toBe(false);
  });
  it("Dominus snapshots doubled Might and grants a main-speed two-power ready ability for this turn", () => {
    let s = fixture();
    const target = unit(47);
    target.temporaryMight = 2;
    target.ready = false;
    s.units = [target];
    const before = getMight(s, target);
    s = play(s, 142, target.id);
    expect(getMight(s, s.units[0])).toBe(2 * before);
    s = resolve(
      s,
      [{ type: "might", amount: 1, target: "friendlyUnit" }],
      target.id,
    );
    expect(getMight(s, s.units[0])).toBe(2 * before + 1);
    s = activate(s, "ven-wave4:dominus:", target.id);
    expect(s.units[0].ready).toBe(true);
    expect(s.players[0].power).toBe(48);
    s.turn++;
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-wave4:dominus:")),
    ).toBe(false);
  });
  it("Dominus grants the activated ability to an enemy unit's controller, and not as a Reaction", () => {
    let s = fixture();
    const target = unit(84, 1);
    s.units = [target];
    s = play(s, 142, target.id);
    s.currentPlayer = s.priorityPlayer = 1;
    expect(
      getLegalActions(s, 1).some((a) => a.id.startsWith("ven-wave4:dominus:")),
    ).toBe(true);
    s.stack.push({
      id: "chain",
      kind: "spell",
      player: 0,
      cardId: id(52),
      effects: [],
    });
    expect(
      getLegalActions(s, 1).some((a) => a.id.startsWith("ven-wave4:dominus:")),
    ).toBe(false);
  });
  it.each([false, true])(
    "Defender of Tomorrow pays/exhausts before readying the declared %s gear mode",
    (empowered) => {
      let s = fixture();
      s.players[0].legendId = id(149);
      s.players[0].legendEmpowered = empowered;
      s.gears = [gear(11), gear(73, 1)];
      const action = getLegalActions(s, 0).find(
        (a) =>
          a.id.startsWith("ability|legend|") &&
          a.targetId!.split("~").length === (empowered ? 2 : 1),
      )!;
      expect(action.targetId!.split("~")).toHaveLength(empowered ? 2 : 1);
      s = applyAction(s, action);
      expect(s.players[0].energy).toBe(49);
      expect(s.players[0].legendUsedTurn).toBe(s.turn);
      expect(s.gears.every((g) => !g.ready)).toBe(true);
      s = settle(s);
      expect(s.gears.filter((g) => g.ready)).toHaveLength(empowered ? 2 : 1);
    },
  );
  it("Defender's Empower costs two energy and two power, and retains its original ready-one ability", () => {
    let s = fixture();
    s.players[0].legendId = id(149);
    s.gears = [gear(11)];
    s = activate(s, "ven-wave4:empower:", "legend");
    expect(s.players[0].energy).toBe(48);
    expect(s.players[0].power).toBe(48);
    expect(s.players[0].legendEmpowered).toBe(true);
    const actions = getLegalActions(s, 0).filter((a) =>
      a.id.startsWith("ability|legend|"),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].targetId).toBe(s.gears[0].id);
    s = settle(applyAction(s, actions[0]));
    expect(s.gears[0].ready).toBe(true);
  });
  it("Defender readies the remaining declared gear when another leaves before resolution", () => {
    let s = fixture();
    s.players[0].legendId = id(149);
    s.players[0].legendEmpowered = true;
    s.gears = [gear(11), gear(73, 1)];
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) =>
          a.id.startsWith("ability|legend|") &&
          a.targetId!.split("~").length === 2,
      )!,
    );
    s.gears.shift();
    s = settle(s);
    expect(s.gears[0].ready).toBe(true);
  });
});

describe("Vendetta alternative play locations and compact rules", () => {
  it("Ocean Drake may enter an open battlefield and can bounce only a non-Dragon unit", () => {
    let s = fixture();
    const enemy = unit(47, 1),
      dragon = unit(16, 1);
    s.units = [enemy, dragon];
    s = start(s, 115, undefined, 0, "field:0");
    const options = getLegalActions(s, 0);
    expect(options.some((a) => a.targetId === enemy.id)).toBe(true);
    expect(options.some((a) => a.targetId === dragon.id)).toBe(false);
    s = applyAction(
      s,
      options.find((a) => a.targetId === enemy.id)!,
    );
    s = settle(s);
    expect(s.players[1].hand).toContain(id(47));
    expect(
      s.units.some((u) => u.cardId === id(115) && u.location === "field:0"),
    ).toBe(true);
  });
  it.each([0, 1] as const)(
    "Rengar can Ambush a battlefield occupied only by player %i at main or Reaction timing",
    (owner) => {
      let s = fixture();
      const occupant = unit(47, owner);
      occupant.location = "field:0";
      s.units = [occupant];
      s.players[0].hand = [id(179)];
      expect(
        getLegalActions(s, 0).some(
          (a) => a.cardId === id(179) && a.locationId === "field:0",
        ),
      ).toBe(true);
      s.stack = [
        { id: "chain", kind: "spell", player: 1, cardId: id(52), effects: [] },
      ];
      const actions = getLegalActions(s, 0).filter(
        (a) => a.category === "play" && a.cardId === id(179),
      );
      expect(actions.map((a) => a.locationId)).toEqual(["field:0"]);
      s = applyAction(s, actions[0]);
      expect(s.units.find((u) => u.cardId === id(179))?.location).toBe(
        "field:0",
      );
      expect(s.stack.some((item) => item.id === "chain")).toBe(true);
    },
  );
  it("Kha'Zix pays three XP and chooses his attack target before response", () => {
    let s = fixture();
    const hunter = unit(180),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    enemy.temporaryMight = 20;
    s.units = [hunter, enemy];
    s.players[0].xp = 3;
    s = attack(s, hunter);
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === enemy.id)!,
    );
    expect(s.players[0].xp).toBe(0);
    expect(s.units[1].damage).toBe(0);
    s.units[0].temporaryMight = 2;
    const damage = getMight(s, s.units[0]);
    s = settle(s);
    expect(s.units[1].damage).toBe(damage);
  });
  it("Kha'Zix cannot use the damage trigger with fewer than three XP and gains Hunt XP on conquest", () => {
    let s = fixture();
    const hunter = unit(180);
    s.units = [hunter];
    s = conquer(s, hunter);
    expect(s.players[0].xp).toBe(1);
    const battle = fixture(),
      attacker = unit(180),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    battle.units = [attacker, enemy];
    battle.players[0].xp = 2;
    const entered = attack(battle, attacker);
    expect(
      getLegalActions(entered, 0).some(
        (a) => a.targetId === enemy.id && a.id.startsWith("choose-trigger"),
      ),
    ).toBe(false);
  });
  it("Eye of Twilight grants temporary Tank at Action speed and exhausts the legend", () => {
    let s = fixture();
    s.players[0].legendId = id(193);
    const u = unit(47);
    s.units = [u];
    s = activate(s, "ability|", "legend", u.id);
    expect(getKeywords(s, s.units[0])).toContain("Tank");
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
  });
  it("compact Rage Fueled freezes the four-rune trigger restriction before response", () => {
    let s = fixture();
    const renekton = unit(1019),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    enemy.temporaryMight = 10;
    s.units = [renekton, enemy];
    s.players[0].runes = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i}`,
      domain: "Fury",
      ready: false,
    }));
    s = attack(s, renekton);
    for (
      let i = 0;
      i < 4 && !s.stack.some((item) => item.cardId === id(1019));
      i++
    )
      s = applyAction(s, "pass");
    expect(s.stack.some((item) => item.cardId === id(1019))).toBe(true);
    s.players[0].runes.push({ id: "fifth", domain: "Fury", ready: false });
    s = settle(s);
    expect(s.units.find((u) => u.id === enemy.id)!.damage).toBe(2);
  });
  it("compact Rage Fueled has no attack trigger at five runes", () => {
    let s = fixture();
    const renekton = unit(1019),
      enemy = unit(84, 1);
    enemy.location = "field:0";
    s.units = [renekton, enemy];
    s.players[0].runes = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      domain: "Fury",
      ready: false,
    }));
    s = settle(attack(s, renekton));
    expect(s.units[1].damage).toBe(0);
  });
  it("compact Nasus Ascended empowers for eight and scores an extra conquer point", () => {
    let s = fixture();
    const nasus = unit(1046);
    s.units = [nasus];
    s = activate(s, "ven-wave4:empower:", nasus.id);
    expect(s.players[0].energy).toBe(42);
    expect(getScript(nasus.cardId)!.deflect).toBe(2);
    s = conquer(s, s.units[0]);
    expect(s.players[0].points).toBe(2);
  });
  it("compact Nasus Guardian channels once for enemy deaths here and resets on a new turn", () => {
    let s = fixture();
    const nasus = unit(1063),
      a = unit(47, 1),
      b = unit(47, 1, "b");
    nasus.location = a.location = b.location = "field:0";
    s.units = [nasus, a, b];
    s = resolve(s, [{ type: "kill", target: "enemyUnit" }], a.id);
    expect(s.players[0].runes).toHaveLength(1);
    s = resolve(s, [{ type: "kill", target: "enemyUnit" }], b.id);
    expect(s.players[0].runes).toHaveLength(1);
    s.turn++;
    const c = unit(47, 1, "c");
    c.location = "field:0";
    s.units.push(c);
    s = resolve(s, [{ type: "kill", target: "enemyUnit" }], c.id);
    expect(s.players[0].runes).toHaveLength(2);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
  });
  it("compact Nasus does not witness his own simultaneous death", () => {
    let s = fixture();
    const nasus = unit(1063),
      enemy = unit(47, 1);
    nasus.location = enemy.location = "field:0";
    s.units = [nasus, enemy];
    s = resolve(s, [
      {
        type: "damageAll",
        who: "all",
        amount: 30,
        condition: "allBattlefields",
      },
    ]);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.units).toHaveLength(0);
  });
  it("compact Brute empowers on crossing ten Might and retains Deflect and Ganking below ten", () => {
    let s = fixture();
    const brute = unit(1092);
    s.units = [brute];
    brute.temporaryMight = 9 - getMight(s, brute);
    s = activate(s, "ability|", brute.id);
    expect(s.players[0].energy).toBe(49);
    expect(s.units[0].empowered).toBe(true);
    expect(getKeywords(s, s.units[0])).toEqual(
      expect.arrayContaining(["Deflect", "Ganking"]),
    );
    s = resolve(
      s,
      [{ type: "might", target: "friendlyUnit", amount: -2 }],
      brute.id,
    );
    expect(s.units[0].empowered).toBe(true);
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
  });
  it("queries never mutate wave4 history", () => {
    const s = fixture();
    s.players[0].legendId = id(149);
    s.units = [unit(21), unit(60), unit(1092)];
    s.gears = [gear(11)];
    const before = JSON.stringify(s);
    getLegalActions(s, 0);
    s.units.forEach((u) => {
      getMight(s, u);
      getKeywords(s, u);
    });
    expect(JSON.stringify(s)).toBe(before);
  });
});
