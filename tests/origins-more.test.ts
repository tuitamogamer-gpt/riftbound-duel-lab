import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
  getKeywords,
} from "../src/game/engine";
import { originsMoreScripts as scripts } from "../src/game/origins-more";
import { getScript } from "../src/game/scripts";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";
const id = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sf = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
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
  const s = createGame({ seed: 748 });
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
    f.cardId = id(275);
    f.controller = null;
  }
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
  choose?: (actions: GameAction[], s: GameState) => GameAction | undefined,
) {
  let s = initial;
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    const next = s.pendingChoice
      ? (choose?.(a, s) ?? a[0])
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
  cardId: string,
  targetId?: string,
  choose?: (actions: GameAction[], s: GameState) => GameAction | undefined,
) {
  const p = s.priorityPlayer;
  s.players[p].hand.push(cardId);
  const a = getLegalActions(s, p).find(
    (a) =>
      a.cardId === cardId &&
      a.category === "play" &&
      a.targetId === targetId &&
      !a.additionalCostPaid &&
      !a.repeated &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `legal play ${getCard(cardId).name}`).toBeDefined();
  return settle(applyAction(s, a!), choose);
}
function resolve(
  s: GameState,
  cardId: string,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  choose?: (actions: GameAction[], s: GameState) => GameAction | undefined,
) {
  const u = s.units.find((u) => u.id === sourceId);
  s.stack.push({
    id: "test-effect",
    player: 0,
    cardId,
    sourceId,
    targetId,
    locationId: u?.location,
    kind: "trigger",
    effects,
  });
  return settle(s, choose);
}
function activate(s: GameState, cardId: string, targetId?: string) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.category === "ability" &&
      a.cardId === cardId &&
      a.targetId === targetId,
  )!;
  expect(a).toBeDefined();
  return settle(applyAction(s, a));
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

describe("further Origins and Spiritforged explicit scripts", () => {
  it("registers the full batch while excluding cards requiring unsupported pipeline families", () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(35);
    for (const [cardId, script] of Object.entries(scripts))
      expect(getScript(cardId), getCard(cardId).name).toEqual(script);
    for (const n of [23, 62, 77, 102, 110, 122, 196, 198, 226, 236, 244])
      expect(scripts[id(n)]).toBeUndefined();
  });
  it.each([0, 1])(
    "Sun Disc affects exactly the next unit and only with Legion (%i earlier cards)",
    (earlier) => {
      let s = fixture();
      s.gears = [{ id: "disc", cardId: id(21), owner: 0, ready: true }];
      s.players[0].cardsPlayedThisTurn = earlier;
      s = activate(s, id(21));
      s = play(s, id(49));
      expect(s.units[0].ready).toBe(earlier === 1);
      s = play(s, id(49));
      expect(s.units[1].ready).toBe(false);
    },
  );
  it("Raging Firebrand discounts the next spell only, stacks multiple sources, and expires with the turn", () => {
    let s = play(fixture(), id(31));
    s = play(s, id(31));
    const before = s.players[0].energy;
    s = play(s, id(114));
    expect(s.players[0].energy).toBe(
      before - Math.max(0, getCard(id(114)).energy! - 10),
    );
    const energy = s.players[0].energy;
    s = play(s, id(114));
    expect(s.players[0].energy).toBe(energy - getCard(id(114)).energy!);
  });
  it.each(["shakedown-draw", "shakedown-damage"])(
    "Shakedown gives its target controller the actual choice (%s)",
    (choice) => {
      const s = fixture(),
        enemy = unit(88, 1);
      enemy.baseMightOverride = 30;
      s.units = [enemy];
      const owners: PlayerId[] = [];
      const end = play(s, id(33), enemy.id, (a, state) => {
        owners.push(state.priorityPlayer);
        return a.find((a) => a.id.endsWith(choice));
      });
      expect(owners).toEqual([1]);
      expect(end.players[0].hand).toHaveLength(
        choice === "shakedown-draw" ? 2 : 0,
      );
      expect(end.units[0].damage).toBe(choice === "shakedown-damage" ? 6 : 0);
    },
  );
  it("Adaptatron destroys the selected gear before buffing itself and does nothing without that gear", () => {
    for (const exists of [false, true]) {
      const s = fixture(),
        u = unit(56);
      s.units = [u];
      if (exists)
        s.gears = [{ id: "g", cardId: id(17), owner: 1, ready: true }];
      const end = resolve(s, id(56), scripts[id(56)].onConquer!, "g", u.id);
      expect(end.units[0].buff).toBe(exists ? 1 : 0);
      expect(end.gears).toHaveLength(0);
    }
  });
  it("Spirit's Refuge grants Deflect only to buffed allies without stacking an existing Deflect", () => {
    const s = fixture(),
      plain = unit(49),
      poro = unit(13),
      unbuffed = unit(49, 0, "empty");
    plain.buff = poro.buff = 1;
    s.units = [plain, poro, unbuffed];
    s.gears = [
      { id: "refuge", cardId: id(63), owner: 0, ready: true },
      { id: "second", cardId: id(63), owner: 0, ready: true },
    ];
    expect(
      getKeywords(s, plain).filter((k) => k.startsWith("Deflect")),
    ).toEqual(["Deflect"]);
    expect(getKeywords(s, poro).filter((k) => k.startsWith("Deflect"))).toEqual(
      ["Deflect"],
    );
    expect(getKeywords(s, unbuffed)).not.toContain("Deflect");
    const start = fixture();
    start.units = [unit(49)];
    expect(play(start, id(63)).units[0].buff).toBe(1);
  });
  it("Lee Sin Ascetic can accumulate more than one buff", () => {
    const s = fixture(),
      lee = unit(78);
    lee.buff = 2;
    s.units = [lee];
    const end = activate(s, id(78));
    expect(end.units[0].buff).toBe(3);
    expect(end.units[0].ready).toBe(false);
  });
  it("Leona Zealot enters ready near victory and reduces only local stunned enemies with a one-Might floor", () => {
    const s = fixture();
    s.players[1].points = 5;
    let end = play(s, id(79));
    expect(end.units[0].ready).toBe(true);
    const enemy = unit(88, 1),
      remote = unit(88, 1, "remote");
    enemy.location = end.units[0].location;
    enemy.stunned = remote.stunned = true;
    remote.location = "field:0";
    end.units.push(enemy, remote);
    expect(getMight(end, enemy)).toBe(1);
    expect(getMight(end, remote)).toBe(getCard(remote.cardId).might);
    enemy.stunned = false;
    expect(getMight(end, enemy)).toBe(getCard(enemy.cardId).might);
  });
  it("Gemcraft Seer has Vision and gives a separate Vision trigger to another friendly unit", () => {
    let count = 0;
    const choose = (a: GameAction[]) => {
      const keep = a.find((a) => a.id === "choose-predict:keep");
      if (keep) count++;
      return keep;
    };
    const end = play(fixture(), id(100), undefined, choose);
    expect(count).toBe(1);
    play(end, id(49), undefined, choose);
    expect(count).toBe(2);
  });
  it("Kinkou Monk targets up to two other allies before its play trigger resolves", () => {
    const s = fixture(),
      a = unit(49),
      b = unit(49, 0, "b");
    s.units = [a, b];
    s.players[0].hand = [id(141)];
    let end = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) =>
          a.cardId === id(141) &&
          a.category === "play" &&
          a.locationId === "base:0",
      )!,
    );
    const monk = end.units.find((u) => u.cardId === id(141))!;
    const options = getLegalActions(end, 0);
    expect(options.some((a) => a.targetId?.split("~").includes(monk.id))).toBe(
      false,
    );
    end = applyAction(
      end,
      options.find((x) => x.targetId === `${a.id}~${b.id}`)!,
    );
    expect(end.stack.at(-1)?.targetId).toBe(`${a.id}~${b.id}`);
    end = settle(end);
    expect(end.units.map((u) => u.buff)).toEqual([1, 1, 0]);
  });
  it("Qiyana's unbulleted draw-or-channel choice is made on resolution", () => {
    const s = fixture(),
      u = unit(155);
    s.units = [u];
    const end = resolve(
      s,
      id(155),
      scripts[id(155)].onConquer!,
      undefined,
      u.id,
      (a) => a.find((a) => a.id.endsWith("qiyana-channel")),
    );
    expect(end.players[0].hand).toHaveLength(0);
    expect(end.players[0].runes).toHaveLength(1);
    expect(end.players[0].runes[0].ready).toBe(false);
  });
  it("Sabotage publicly reveals the opponent hand but only lets its caster recycle a non-unit", () => {
    const s = fixture();
    s.players[1].hand = [id(49), id(114)];
    const end = play(s, id(156), undefined, (a) => {
      expect(a.some((x) => x.label.includes(getCard(id(49)).name))).toBe(false);
      return a[0];
    });
    expect(end.players[1].hand).toEqual([id(49)]);
    expect(end.players[1].deck.at(-1)).toBe(id(114));
    expect(
      end.log.some(
        (l) =>
          l.text.includes("reveals:") &&
          l.text.includes(getCard(id(49)).name) &&
          l.text.includes(getCard(id(114)).name),
      ),
    ).toBe(true);
  });
  it("Volibear Imposing draws when the opponent moves to a different battlefield", () => {
    let s = fixture();
    const bear = unit(158),
      enemy = unit(49, 1);
    bear.location = "field:1";
    s.units = [bear, enemy];
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    const move = getLegalActions(s, 1).find(
      (a) => a.id.startsWith("move-start:") && a.locationId === "field:0",
    )!;
    s = applyAction(s, move);
    s = settle(applyAction(s, "move-confirm"));
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Ember Monk and Black Market Broker trigger only after a card played from Hidden resolves", () => {
    const s = fixture(),
      monk = unit(167),
      broker = unit(49);
    broker.cardId = sf(121);
    s.units = [monk, broker];
    s.fields[0].controller = 0;
    monk.location = "field:0";
    s.hidden = [
      {
        id: "h",
        cardId: id(83),
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn - 1,
      },
    ];
    const a = getLegalActions(s, 0).find(
      (a) => a.category === "play" && a.sourceId === "hidden:h",
    )!;
    expect(a).toBeDefined();
    let end = applyAction(s, a);
    expect(end.units[0].temporaryMight).toBe(0);
    expect(end.gears).toHaveLength(0);
    end = settle(end);
    expect(end.units[0].temporaryMight).toBe(2);
    expect(end.gears.filter((g) => g.token)).toHaveLength(1);
  });
  it("delegates Ride the Wind to the later complete movement script", () => {
    expect(scripts[id(173)]).toBeUndefined();
    expect(getScript(id(173))?.spell).toEqual([
      {
        type: "moveTarget",
        target: "friendlyUnit",
        condition: "chooseDestination",
      },
      { type: "ready", target: "friendlyUnit" },
    ]);
  });
  it("Acceptable Losses lets each player kill their own gear", () => {
    const s = fixture();
    s.gears = [
      { id: "own", cardId: id(17), owner: 0, ready: true },
      { id: "enemy", cardId: id(17), owner: 1, ready: true },
    ];
    const owners: PlayerId[] = [];
    const end = play(s, id(179), undefined, (a, state) => {
      owners.push(state.priorityPlayer);
      expect(
        a.every(
          (x) =>
            state.gears.find((g) => g.id === x.effects?.[0].cardName)?.owner ===
            state.priorityPlayer,
        ),
      ).toBe(true);
      return a[0];
    });
    expect(owners).toEqual([0, 1]);
    expect(end.gears).toHaveLength(0);
    expect(end.players[0].discard).toContain(id(17));
    expect(end.players[1].discard).toContain(id(17));
  });
  it("Stacked Deck keeps one of the top three and randomly recycles the rest without exposing them", () => {
    const s = fixture();
    s.players[0].deck = [id(49), id(88), id(13), id(52)];
    const rng = s.rng;
    const end = play(s, id(183), undefined, (a) =>
      a.find((a) => a.id.endsWith("stacked:1")),
    );
    expect(end.players[0].hand).toEqual([id(88)]);
    expect(end.players[0].deck[0]).toBe(id(52));
    expect(end.players[0].deck.slice(1).sort()).toEqual(
      [id(49), id(13)].sort(),
    );
    expect(end.rng).not.toBe(rng);
    expect(end.log.some((l) => l.text.includes("reveals"))).toBe(false);
  });
  it("The Syren pays and exhausts to move its controller's battlefield unit to base", () => {
    const s = fixture(),
      u = unit(49);
    u.location = "field:0";
    s.units = [u];
    s.gears = [{ id: "ship", cardId: id(184), owner: 0, ready: true }];
    const end = activate(s, id(184), u.id);
    expect(end.units[0].location).toBe("base:0");
    expect(end.players[0].energy).toBe(49);
    expect(end.gears[0].ready).toBe(false);
  });
  it("Treasure Trove draws and channels whenever killed or returned to hand", () => {
    for (const bounce of [false, true]) {
      const s = fixture();
      s.gears = [{ id: "trove", cardId: id(186), owner: 0, ready: true }];
      const end = bounce ? play(s, sf(135), "trove") : activate(s, id(186));
      expect(end.gears).toHaveLength(0);
      expect(end.players[0].runes).toHaveLength(1);
      expect(end.players[0].runes[0].ready).toBe(false);
      expect(end.players[0].hand.length).toBe(bounce ? 2 : 1);
    }
  });
  it.each([0, 1] as const)(
    "Whirlwind starts with the next player and returns control to the original caster (%i)",
    (caster) => {
      const s = fixture(),
        a = unit(49),
        b = unit(88, 1);
      s.units = [a, b];
      s.currentPlayer = s.priorityPlayer = s.focusPlayer = caster;
      const owners: PlayerId[] = [];
      const end = play(s, id(187), undefined, (choices, state) => {
        owners.push(state.priorityPlayer);
        return choices.find(
          (a) => a.effects?.[0]?.cardName === state.units[0]?.id,
        );
      });
      expect(owners).toEqual([caster === 0 ? 1 : 0, caster]);
      expect(end.units).toHaveLength(0);
      expect(end.players[0].hand).toContain(a.cardId);
      expect(end.players[1].hand).toContain(b.cardId);
    },
  );
  it("Whirlwind choices do not target, require Deflect payments, or trigger targeted abilities", () => {
    const s = fixture(),
      poro = unit(13),
      runner = unit(49, 1);
    runner.cardId = sf(105);
    runner.untargetableByEnemy = true;
    poro.location = runner.location = "field:0";
    s.fields[0].cardId = id(292);
    s.units = [poro, runner];
    s.players[1].energy = s.players[1].power = 0;
    const end = play(s, id(187), undefined, (actions, state) => {
      expect(actions.every((a) => a.targetId === undefined)).toBe(true);
      const victim = state.priorityPlayer === 1 ? poro : runner;
      return actions.find((a) => a.effects?.[0]?.cardName === victim.id);
    });
    expect(end.units).toHaveLength(0);
    expect(end.players[0].hand).toEqual([poro.cardId]);
    expect(end.players[1].hand).toEqual([runner.cardId]);
    expect(end.players[1].power).toBe(0);
  });
  it("Zaunite Bouncer excludes itself and Mindsplitter's chosen card is actually discarded", () => {
    const s = fixture(),
      enemy = unit(49, 1);
    enemy.location = "field:0";
    s.units = [enemy];
    expect(play(s, id(188)).players[1].hand).toContain(enemy.cardId);
    const t = fixture();
    t.players[1].hand = [id(49), id(114)];
    const end = play(t, id(192), undefined, (a) =>
      a.find((a) => a.label.includes(getCard(id(49)).name)),
    );
    expect(end.players[1].hand).toEqual([id(114)]);
    expect(end.players[1].discard).toEqual([id(49)]);
  });
  it("Yasuo scores only on his third movement in the same turn", () => {
    let s = fixture();
    const yasuo = unit(205),
      guard0 = unit(49),
      guard1 = unit(49, 0, "other");
    guard0.location = "field:0";
    guard1.location = "field:1";
    s.units = [yasuo, guard0, guard1];
    s.fields[0].controller = s.fields[1].controller = 0;
    for (const [index, to] of [
      "field:0",
      "field:1",
      "base:0",
      "field:0",
    ].entries()) {
      s = resolve(
        s,
        id(205),
        [
          {
            type: "moveTarget",
            target: "friendlyUnit",
            condition: "chooseDestination",
          },
        ],
        yasuo.id,
        undefined,
        (a) => a.find((a) => a.locationId === to),
      );
      expect(s.players[0].points).toBe(index >= 2 ? 1 : 0);
    }
  });
  it("Salvage remains playable with no gear and can decline killing existing gear", () => {
    expect(play(fixture(), id(224)).players[0].hand).toHaveLength(1);
    const s = fixture();
    s.gears = [{ id: "g", cardId: id(17), owner: 1, ready: true }];
    const end = play(s, id(224));
    expect(end.gears).toHaveLength(1);
    expect(end.players[0].hand).toHaveLength(1);
  });
  it("Vanguard Helm buffs a surviving friendly unit after a buffed ally dies", () => {
    const s = fixture(),
      dead = unit(49),
      alive = unit(88);
    dead.buff = 1;
    s.units = [dead, alive];
    s.gears = [{ id: "helm", cardId: id(228), owner: 0, ready: true }];
    const end = play(s, id(229), dead.id);
    expect(end.units).toHaveLength(1);
    expect(end.units[0].buff).toBe(1);
  });
  it("Fiora gains conditional Deflect/Ganking/Shield only after reaching five Might", () => {
    const s = fixture(),
      fiora = unit(232);
    s.units = [fiora];
    fiora.baseMightOverride = 4;
    fiora.location = "field:0";
    combat(s);
    s.combat!.attacker = 1;
    s.combat!.defender = 0;
    expect(getMight(s, fiora)).toBe(4);
    expect(getKeywords(s, fiora)).not.toContain("Deflect");
    fiora.buff = 1;
    expect(getMight(s, fiora)).toBe(6);
    expect(getKeywords(s, fiora)).toEqual(
      expect.arrayContaining(["Deflect", "Ganking", "Shield"]),
    );
  });
  it("King's Edict makes the opponent choose one of their units", () => {
    const s = fixture(),
      a = unit(49),
      b = unit(49, 1),
      c = unit(88, 1);
    s.units = [a, b, c];
    const end = play(s, id(237), undefined, (options, state) => {
      expect(state.priorityPlayer).toBe(1);
      expect(options.every((a) => a.targetId !== s.units[0].id)).toBe(true);
      return options.find((a) => a.targetId === c.id);
    });
    expect(end.units.map((u) => u.id)).toEqual([a.id, b.id]);
  });
  it("Darius legend requires Legion, exhausts immediately and adds Energy without opening a chain", () => {
    const s = fixture();
    s.players[0].legendId = id(253);
    expect(
      getLegalActions(s, 0).some((a) => a.id === "origins-more:darius-energy"),
    ).toBe(false);
    s.players[0].cardsPlayedThisTurn = 1;
    const end = applyAction(s, "origins-more:darius-energy");
    expect(end.players[0].energy).toBe(51);
    expect(end.players[0].legendUsedTurn).toBe(end.turn);
    expect(end.stack).toHaveLength(0);
    expect(
      getLegalActions(end, 0).some(
        (a) => a.id === "origins-more:darius-energy",
      ),
    ).toBe(false);
  });
  it("Siphon Power adjusts both armies simultaneously only at the chosen battlefield", () => {
    const s = fixture(),
      friend = unit(49),
      enemy = unit(13, 1),
      remote = unit(13, 1, "r");
    friend.location = enemy.location = "field:0";
    remote.location = "field:1";
    s.units = [friend, enemy, remote];
    const end = play(s, id(266), "field:0");
    expect(end.units.map((u) => u.temporaryMight)).toEqual([1, -1, 0]);
  });
  it("Miss Fortune legend grants Ganking to the chosen unit for this turn", () => {
    const s = fixture(),
      u = unit(49);
    s.units = [u];
    s.players[0].legendId = id(267);
    const end = activate(s, id(267), u.id);
    expect(getKeywords(end, end.units[0])).toContain("Ganking");
    expect(end.players[0].legendUsedTurn).toBe(end.turn);
  });
  it("Back-Alley Bar and Harpoon Squad inspect the location moved from", () => {
    let s = fixture();
    const squad = unit(49);
    squad.cardId = sf(137);
    squad.location = "field:0";
    s.units = [squad];
    s.fields[0].cardId = id(277);
    s.fields[0].controller = 0;
    const move = getLegalActions(s, 0).find(
      (a) => a.id.startsWith("move-start:") && a.locationId === "base:0",
    )!;
    s = applyAction(s, move);
    s = settle(applyAction(s, "move-confirm"));
    expect(s.units[0].temporaryMight).toBe(3);
  });
  it("Hallowed Tomb restores only the chosen champion to an empty champion zone", () => {
    const s = fixture();
    s.players[0].championId = id(39);
    s.players[0].championAvailable = false;
    s.players[0].discard = [id(39)];
    const end = resolve(s, id(281), scripts[id(281)].onHold!);
    expect(end.players[0].championAvailable).toBe(true);
    expect(end.players[0].discard).toHaveLength(0);
  });
  it.each([false, true])(
    "Hallowed Tomb finalizes its optional trigger before responses (decline=%s)",
    (decline) => {
      const s = fixture(),
        holder = unit(49);
      holder.location = "field:0";
      s.units = [holder];
      s.fields[0].cardId = id(281);
      s.fields[0].controller = 0;
      s.players[0].championId = id(39);
      s.players[0].championAvailable = false;
      s.players[0].discard = [id(39)];
      let sawChoice = false;
      let end = settle(applyAction(s, "end-turn"));
      end = settle(applyAction(end, "end-turn"), (a, state) => {
        if (state.pendingChoice?.cardId !== id(281)) return a[0];
        sawChoice = true;
        expect(state.pendingChoice.kind).toBe("trigger");
        expect(state.players[0].championAvailable).toBe(false);
        return a.find((a) =>
          decline
            ? a.id === "choose-trigger:skip"
            : a.id !== "choose-trigger:skip",
        );
      });
      expect(sawChoice).toBe(true);
      expect(end.players[0].championAvailable).toBe(!decline);
    },
  );
  it("Navori Fighting Pit can buff an enemy unit here, but cannot choose remote units", () => {
    const s = fixture(),
      local = unit(49, 1),
      remote = unit(49);
    local.location = "field:0";
    s.units = [local, remote];
    s.stack.push({
      id: "pit",
      player: 0,
      cardId: id(283),
      kind: "trigger",
      locationId: "field:0",
      targetId: local.id,
      effects: scripts[id(283)].onHold!,
    });
    const end = settle(s);
    expect(end.units[0].buff).toBe(1);
    expect(end.units[1].buff).toBe(0);
  });
  it("Navori's actual hold trigger selects its unit before the response window", () => {
    const s = fixture(),
      holder = unit(49),
      another = unit(49, 0, "other");
    holder.location = another.location = "field:0";
    s.units = [holder, another];
    s.fields[0].cardId = id(283);
    s.fields[0].controller = 0;
    let sawChoice = false;
    let end = settle(applyAction(s, "end-turn"));
    end = settle(applyAction(end, "end-turn"), (actions, state) => {
      if (state.pendingChoice?.cardId !== id(283)) return actions[0];
      sawChoice = true;
      expect(state.pendingChoice.kind).toBe("trigger");
      expect(state.units.every((u) => !u.buff)).toBe(true);
      return actions.find((a) => a.targetId === another.id);
    });
    expect(sawChoice).toBe(true);
    expect(end.units.find((u) => u.id === another.id)?.buff).toBe(1);
    expect(end.units.find((u) => u.id === holder.id)?.buff).toBe(0);
  });
  it("Obelisk and Arena's Greatest apply only at each player's first Beginning", () => {
    let s = fixture();
    s.players[0].hasBegun = false;
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.fields[0].cardId = id(284);
    s.fields[1].cardId = id(290);
    s = settle(applyAction(s, "end-turn"));
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].runes).toHaveLength(3);
    expect(s.players[0].runes.every((r) => r.ready)).toBe(true);
    s = settle(applyAction(s, "end-turn"));
    s = settle(applyAction(s, "end-turn"));
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].runes).toHaveLength(5);
  });
  it("Candlelit Sanctum supports reversing, keeping one, and recycling both inspected cards", () => {
    for (const choice of ["candle-reverse", "candle-first", "candle-none"]) {
      const s = fixture();
      s.players[0].deck = [id(49), id(88), id(13)];
      const end = resolve(
        s,
        id(291),
        scripts[id(291)].onConquer!,
        undefined,
        undefined,
        (a) => a.find((a) => a.id.endsWith(choice)),
      );
      if (choice === "candle-reverse")
        expect(end.players[0].deck).toEqual([id(88), id(49), id(13)]);
      if (choice === "candle-first")
        expect(end.players[0].deck).toEqual([id(49), id(13), id(88)]);
      if (choice === "candle-none") {
        expect(end.players[0].deck[0]).toBe(id(13));
        expect(end.players[0].deck.slice(1).sort()).toEqual(
          [id(49), id(88)].sort(),
        );
      }
    }
  });
  it("Renata Mastermind abilities are legal only at a battlefield and pay their actual printed cost", () => {
    const s = fixture(),
      renata = unit(49);
    renata.cardId = sf(88);
    s.units = [renata];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === renata.id && a.category === "ability",
      ),
    ).toBe(false);
    renata.location = "field:0";
    const draw = getLegalActions(s, 0).find(
      (a) => a.sourceId === renata.id && a.label.includes("Draw 1"),
    )!;
    const end = settle(applyAction(s, draw));
    expect(end.players[0].hand).toHaveLength(1);
    expect(end.players[0].energy).toBe(49);
    expect(end.players[0].power).toBe(49);
  });
  it.each(["draw", "score"])(
    "Renata's finalized %s ability resolves after she leaves the battlefield",
    (mode) => {
      const s = fixture(),
        renata = unit(49);
      renata.cardId = sf(88);
      renata.location = "field:0";
      s.units = [renata];
      const action = getLegalActions(s, 0).find(
        (a) =>
          a.sourceId === renata.id &&
          a.label.includes(mode === "draw" ? "Draw 1" : "Score 1"),
      )!;
      let end = applyAction(s, action);
      end.players[0].hand = [id(104)];
      const retreat = getLegalActions(end, 0).find(
        (a) => a.cardId === id(104) && a.targetId === renata.id,
      )!;
      expect(retreat).toBeDefined();
      end = settle(applyAction(end, retreat));
      expect(end.units).toHaveLength(0);
      expect(end.players[0].points).toBe(mode === "score" ? 1 : 0);
      expect(end.players[0].hand).toHaveLength(mode === "draw" ? 2 : 1);
    },
  );
  it("Petricite Monument grants Deflect and disappears before its controller next scores", () => {
    const s = fixture(),
      u = unit(49);
    u.location = "field:0";
    s.fields[0].controller = 0;
    // This Beginning trigger leaves a response window before holding scores.
    s.units = [u];
    let end = play(s, sf(104));
    expect(end.gears[0].temporary).toBe(true);
    expect(getKeywords(end, end.units[0])).toContain("Deflect");
    end = settle(applyAction(end, "end-turn"));
    expect(end.gears).toHaveLength(1);
    end = applyAction(end, "end-turn");
    expect(end.pendingBeginning).toBe(0);
    expect(end.stack.length).toBeGreaterThan(0);
    expect(end.players[0].points).toBe(0);
    expect(end.gears).toHaveLength(0);
    expect(getKeywords(end, end.units[0])).not.toContain("Deflect");
    end = settle(end);
    expect(end.players[0].points).toBe(1);
  });
  it("Windsinger can decline and cannot bounce a unit with more than three Might", () => {
    const s = fixture(),
      big = unit(88, 1),
      small = unit(13, 1);
    big.location = small.location = "field:0";
    s.units = [big, small];
    const end = play(s, sf(138), undefined, (a) => {
      expect(a.some((a) => a.targetId === big.id)).toBe(false);
      return a.find((a) => a.id === "choose-trigger:skip");
    });
    expect(end.units.some((u) => u.id === small.id)).toBe(true);
  });
  it("Bonds of Strength can repeat the two-unit Might effect with the additional Energy cost", () => {
    const s = fixture(),
      a = unit(49),
      b = unit(49, 0, "b");
    s.units = [a, b];
    s.players[0].hand = [sf(151)];
    const action = getLegalActions(s, 0).find(
      (x) =>
        x.cardId === sf(151) &&
        x.repeated &&
        x.targetId === `${a.id}~${b.id}` &&
        x.repeatedTargetId === `${a.id}~${b.id}`,
    )!;
    const end = settle(applyAction(s, action));
    expect(end.units.map((u) => u.temporaryMight)).toEqual([2, 2]);
    expect(end.players[0].energy).toBe(50 - getCard(sf(151)).energy! - 2);
  });
  it("Corrupt Enforcer discards on entering a battlefield and draws only when it survives a won combat", () => {
    let s = fixture();
    const enforcer = unit(49),
      enemy = unit(49, 1);
    enforcer.cardId = sf(123);
    enforcer.baseMightOverride = 6;
    enemy.baseMightOverride = 1;
    enemy.location = "field:0";
    s.units = [enforcer, enemy];
    s.fields[0].controller = 1;
    s.players[0].hand = [id(88)];
    const move = getLegalActions(s, 0).find(
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === enforcer.id &&
        a.locationId === "field:0",
    )!;
    s = applyAction(s, move);
    s = settle(applyAction(s, "move-confirm"));
    expect(s.players[0].discard).toContain(id(88));
    expect(s.players[0].hand).toHaveLength(0);
    for (
      let i = 0;
      i < 30 && (s.combat || s.stack.length || s.pendingChoice);
      i++
    ) {
      const actions = getLegalActions(s, s.priorityPlayer);
      const next =
        actions.find(
          (a) => a.id.startsWith("damage:") && a.targetId === enemy.id,
        ) ??
        actions.find((a) => a.id.startsWith("damage:")) ??
        actions.find((a) => a.id === "damage-done") ??
        actions.find((a) => a.category === "pass") ??
        actions[0];
      expect(next).toBeDefined();
      s = applyAction(s, next);
    }
    expect(s.units.some((u) => u.id === enemy.id)).toBe(false);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("countering a Hidden spell prevents Ember Monk and Broker play-resolution triggers", () => {
    const s = fixture(),
      monk = unit(167),
      broker = unit(49);
    broker.cardId = sf(121);
    monk.location = "field:0";
    s.units = [monk, broker];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "h",
        cardId: id(83),
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn - 1,
      },
    ];
    let end = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.sourceId === "hidden:h" && a.category === "play",
      )!,
    );
    const spellId = end.stack.at(-1)!.id;
    end.players[1].hand = [id(64)];
    end = applyAction(end, "pass");
    const counter = getLegalActions(end, 1).find(
      (a) =>
        a.category === "play" && a.cardId === id(64) && a.targetId === spellId,
    )!;
    expect(counter).toBeDefined();
    end = settle(applyAction(end, counter));
    expect(end.units.find((u) => u.id === monk.id)?.temporaryMight).toBe(0);
    expect(end.gears).toHaveLength(0);
  });
  it("Vanguard Helm does not leave an impossible target choice when the entire army dies together", () => {
    const s = fixture(),
      a = unit(49),
      b = unit(49, 0, "other");
    a.location = b.location = "field:0";
    a.buff = b.buff = 1;
    s.units = [a, b];
    s.gears = [{ id: "helm", cardId: id(228), owner: 0, ready: true }];
    const end = play(s, id(123));
    expect(end.units).toHaveLength(0);
    expect(end.pendingChoice).toBeNull();
    expect(end.stack).toHaveLength(0);
  });
});
