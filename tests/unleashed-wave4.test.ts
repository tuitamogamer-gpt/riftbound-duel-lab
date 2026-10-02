import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getGameView,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { getCard } from "../src/data/cards";
import { getScript } from "../src/game/scripts";
import { unleashedWave4Scripts } from "../src/game/unleashed-wave4";
import { parseSession } from "../src/persistence";
import type { GameAction, GameState, PlayerId, Unit } from "../src/game/types";
const id = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function fixture(): GameState {
  const s = createGame({ seed: 412 });
  Object.assign(s, {
    phase: "main",
    turn: 8,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    stack: [],
    units: [],
    gears: [],
    pendingTriggers: [],
    pendingChoice: null,
    combat: null,
  });
  for (const p of s.players)
    Object.assign(p, {
      hand: [],
      discard: [],
      deck: Array(25).fill("ogn-049-298"),
      energy: 30,
      power: 30,
      xp: 10,
      runes: [],
      runeDeck: Array(12).fill("Chaos"),
      championAvailable: false,
      legendId: "ogn-251-298",
      hasBegun: true,
      cardsPlayedThisTurn: 0,
      spellsPlayedThisTurn: 0,
      points: 0,
      legendUsedTurn: -1,
    });
  for (const f of s.fields) {
    f.controller = null;
    f.cardId = "ogn-280-298";
  }
  return s;
}
function unit(cardId = "ogn-049-298", owner: PlayerId = 0, uid = "unit"): Unit {
  return {
    id: uid,
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
  };
}
function play(
  s: GameState,
  cardId: string,
  choose: (a: GameAction) => boolean = () => true,
) {
  s.players[s.priorityPlayer].hand.push(cardId);
  const action = getLegalActions(s, s.priorityPlayer).find(
    (a) => a.cardId === cardId && a.category === "play" && choose(a),
  );
  expect(action).toBeDefined();
  return applyAction(s, action!);
}
function settle(
  s: GameState,
  choose?: (actions: GameAction[], state: GameState) => GameAction | undefined,
): GameState {
  for (
    let i = 0;
    i < 80 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(actions, s) ?? actions[0])
      : actions.find((a) => a.id === "pass");
    if (!action) throw new Error(`No action in ${s.phase}`);
    s = applyAction(s, action);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
const save = (s: GameState) => {
  const restored = parseSession(
    JSON.stringify({ match: s, review: null }),
  ).match;
  expect(restored).toEqual(s);
  return restored!;
};
function showdown(s: GameState) {
  s.phase = "showdown";
  s.combat = {
    fieldId: "field:0",
    attacker: 0,
    defender: 1,
    stage: "priority",
    engaged: true,
    designatedUnits: s.units.map((u) => u.id),
    total: [0, 0],
    remaining: [0, 0],
    assignments: [{}, {}],
    assigningPlayer: 0,
  };
  return s;
}
describe("Unleashed wave 4 exact mechanics", () => {
  it.each(Object.keys(unleashedWave4Scripts))(
    "registers complete face %s",
    (cardId) => expect(getScript(cardId)).toBeDefined(),
  );
  it("Undying Legion requires Legion, pays its trash cost and keeps normal unit death destination", () => {
    let s = fixture();
    s.players[0].discard = [id(25)];
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "trash:0")).toBe(
      false,
    );
    s = settle(play(s, "ogn-048-298"));
    const before = s.players[0].energy;
    const a = getLegalActions(s, 0).find((a) => a.sourceId === "trash:0")!;
    expect(a.cardId).toBe(id(25));
    s = applyAction(s, a);
    expect(s.players[0].energy).toBe(before - 3);
    const legion = s.units.find((u) => u.cardId === id(25))!;
    s.stack.push({
      id: "kill",
      kind: "ability",
      cardId: id(25),
      player: 1,
      targetId: legion.id,
      effects: [{ type: "kill", target: "anyUnit" }],
    });
    s = settle(s);
    expect(s.players[0].discard).toContain(id(25));
    expect(s.players[0].banished).not.toContain(id(25));
  });
  it("Scuttle Crab draws on play; its death reveals the hand and grants turn-bound hidden access and XP", () => {
    let s = fixture();
    s.players[1].hand = ["ogn-050-298"];
    s.fields[1].controller = 1;
    s.units = [{ ...unit("ogn-049-298", 1, "holder"), location: "field:1" }];
    s.hidden = [
      {
        id: "hidden",
        cardId: "ogn-097-298",
        owner: 1,
        hiddenTurn: 1,
        location: "field:1",
      },
    ];
    s = settle(play(s, id(53)));
    expect(s.players[0].hand).toHaveLength(1);
    expect(getGameView(s, 0).hidden![0].cardId).toBe("hidden");
    s.stack = [
      {
        id: "kill",
        kind: "ability",
        cardId: id(53),
        player: 1,
        targetId: s.units.find((u) => u.cardId === id(53))!.id,
        effects: [{ type: "kill", target: "anyUnit" }],
      },
    ];
    s = save(settle(s));
    expect(s.players[0].xp).toBe(11);
    expect(getGameView(s, 0).hidden![0].cardId).toBe("ogn-097-298");
    expect(
      s.log.some(
        (l) =>
          l.text.includes(getCard("ogn-050-298").name) &&
          l.text.includes("reveals"),
      ),
    ).toBe(true);
    s.turn++;
    expect(getGameView(s, 0).hidden![0].cardId).toBe("hidden");
  });
  it("Crescent Strike announces battlefield plus victim and damages others without targeting them", () => {
    let s = fixture();
    const a = unit("ogn-049-298", 1, "a"),
      b = unit("ogn-049-298", 1, "b"),
      ally = unit();
    a.location = b.location = ally.location = "field:0";
    a.temporaryMight = 10;
    b.untargetableByEnemy = true;
    s.units = [a, b, ally];
    s = save(play(s, id(72), (a) => a.targetId === "field:0~a"));
    expect(s.stack[0].targetId).toBe("field:0~a");
    s = settle(s);
    expect(s.units.find((u) => u.id === "a")?.damage).toBe(4);
    expect(s.units.find((u) => u.id === "b")?.damage).toBe(1);
    expect(s.units.find((u) => u.id === "unit")?.damage).toBe(0);
  });
  it("Crescent Strike keeps its battlefield when the chosen unit moves in response", () => {
    let s = fixture();
    const a = unit("ogn-049-298", 1, "a"),
      b = unit("ogn-049-298", 1, "b");
    a.location = b.location = "field:0";
    s.units = [a, b];
    s = play(s, id(72), (a) => a.targetId === "field:0~a");
    s.units[0].location = "field:1";
    s = settle(s);
    expect(s.units.find((u) => u.id === "a")?.damage).toBe(0);
    expect(s.units.find((u) => u.id === "b")?.damage).toBe(1);
  });
  it("Crescent Strike includes normal spell damage bonuses", () => {
    let s = fixture();
    const target = unit("ogn-049-298", 1, "victim");
    target.temporaryMight = 10;
    target.location = "field:0";
    s.units = [target, unit("ogs-001-024", 0, "annie")];
    s = settle(play(s, id(72)));
    expect(s.units.find((u) => u.id === "victim")?.damage).toBe(5);
  });
  it("LeBlanc suppresses friendly Temporary only at her battlefield during Beginning", () => {
    let s = fixture();
    const leblanc = unit(id(90)),
      kept = unit("ogn-049-298", 0, "kept"),
      dead = unit("ogn-049-298", 0, "dead");
    leblanc.location = kept.location = "field:0";
    kept.temporary = dead.temporary = true;
    s.units = [leblanc, kept, dead];
    s.currentPlayer = s.priorityPlayer = 1;
    s = settle(applyAction(s, "end-turn"));
    expect(s.units.some((u) => u.id === "kept")).toBe(true);
    expect(s.units.some((u) => u.id === "dead")).toBe(false);
  });
  it("LeBlanc at base does not suppress Temporary", () => {
    let s = fixture();
    const a = unit(id(90)),
      b = unit("ogn-049-298", 0, "temporary");
    b.temporary = true;
    s.units = [a, b];
    s.currentPlayer = s.priorityPlayer = 1;
    s = settle(applyAction(s, "end-turn"));
    expect(s.units.some((u) => u.id === "temporary")).toBe(false);
  });
  it("Arachnoid Horror grants deployment against one enemy and loses permission against two", () => {
    const s = fixture();
    const enemy = unit("ogn-049-298", 1, "enemy");
    enemy.location = "field:0";
    s.units = [enemy];
    s.players[0].hand = [id(117)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(117) && a.locationId === "field:0",
      ),
    ).toBe(true);
    s.units.push(unit(id(117), 0, "horror"));
    s.players[0].hand = ["ogn-049-298"];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.locationId === "field:0",
      ),
    ).toBe(true);
    s.units.push({ ...enemy, id: "enemy2" });
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.locationId === "field:0",
      ),
    ).toBe(false);
  });
  it("Arachnoid Horror's deployment permission does not grant Reaction timing", () => {
    const s = fixture();
    const enemy = unit("ogn-049-298", 1);
    enemy.location = "field:0";
    s.units = [enemy];
    s.players[0].hand = [id(117)];
    s.stack = [
      {
        id: "spell",
        kind: "spell",
        cardId: "ogn-048-298",
        player: 1,
        effects: [{ type: "draw" }],
      },
    ];
    expect(getLegalActions(s, 0).some((a) => a.cardId === id(117))).toBe(false);
  });
  it("Crescent Guardian offers ready-entry only after a finalized spell and charges its Chaos Power", () => {
    let s = fixture();
    s.players[0].hand = [id(122)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(122) && a.additionalCostPaid,
      ),
    ).toBe(false);
    s = settle(play(s, "ogn-048-298"));
    const power = s.players[0].power!;
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.cardId === id(122) && a.additionalCostPaid,
      )!,
    );
    expect(s.units.at(-1)?.ready).toBe(true);
    expect(s.players[0].power).toBe(power - getCard(id(122)).power! - 1);
  });
  it("a countered spell still unlocks Crescent Guardian under rule 419.4.b", () => {
    let s = fixture();
    s.players[0].hand = [id(122)];
    s = play(s, "ogn-048-298");
    s.stack.push({
      id: "counter",
      kind: "ability",
      cardId: id(190),
      player: 1,
      targetId: s.stack[0].id,
      effects: [{ type: "counter", target: "spell" }],
    });
    s = settle(s);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(122) && a.additionalCostPaid,
      ),
    ).toBe(true);
  });
  it("Investigator reveals then pays XP only for the chosen private card, with save continuation", () => {
    let s = fixture();
    s.players[1].hand = ["ogn-014-298", "ogn-050-298"];
    s = play(s, id(135));
    s = applyAction(applyAction(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("custom");
    expect(s.players[0].xp).toBe(10);
    s = save(s);
    s = settle(s, (actions) =>
      actions.find((a) => a.label.includes(getCard("ogn-014-298").name)),
    );
    expect(s.players[0].xp).toBe(8);
    expect(s.players[1].discard).toContain("ogn-014-298");
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("Investigator can decline without spending or discarding", () => {
    let s = fixture();
    s.players[1].hand = ["ogn-050-298"];
    s = settle(play(s, id(135)), (actions) =>
      actions.find((a) => a.label.includes("Decline")),
    );
    expect(s.players[0].xp).toBe(10);
    expect(s.players[1].hand).toEqual(["ogn-050-298"]);
  });
  it("Maduli stays exhausted during Awaken and targeted ready effects", () => {
    let s = fixture();
    s.units = [unit(id(144))];
    s.units[0].ready = false;
    s.stack = [
      {
        id: "ready",
        kind: "ability",
        cardId: id(9),
        player: 0,
        targetId: "unit",
        effects: [{ type: "ready", target: "anyUnit" }],
      },
    ];
    s = settle(s);
    expect(s.units[0].ready).toBe(false);
    s.currentPlayer = s.priorityPlayer = 1;
    s = settle(applyAction(s, "end-turn"));
    expect(s.units[0].ready).toBe(false);
  });
  it("Maduli pays Chaos and rechecks total enemy Might before moving", () => {
    let s = fixture();
    const source = unit(id(144)),
      enemy = unit("ogn-049-298", 1, "enemy");
    source.ready = false;
    enemy.location = "field:0";
    s.fields[0].controller = 1;
    s.units = [source, enemy];
    const a = getLegalActions(s, 0).find((a) =>
      a.id.startsWith("unl-wave4:gate:"),
    )!;
    expect(a).toBeDefined();
    s = save(applyAction(s, a));
    expect(s.players[0].power).toBe(29);
    s.units[1].temporaryMight = getMight(s, s.units[0]);
    s = settle(s);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Maduli successfully moves while exhausted", () => {
    let s = fixture();
    const source = unit(id(144)),
      enemy = unit("ogn-049-298", 1, "enemy");
    source.ready = false;
    enemy.location = "field:0";
    s.fields[0].controller = 1;
    s.units = [source, enemy];
    s = settle(
      applyAction(
        s,
        getLegalActions(s, 0).find((a) => a.id.startsWith("unl-wave4:gate:"))!,
      ),
    );
    expect(s.units[0].location).toBe("field:0");
    expect(s.units[0].ready).toBe(false);
  });
  it("Heroic Charge chooses both units before responses and buffs/stuns them", () => {
    let s = fixture();
    const first = unit(),
      second = unit("ogn-049-298", 1, "enemy");
    first.location = second.location = "field:0";
    s.units = [first, second];
    s = save(play(s, id(155)));
    expect(s.stack[0].targetId).toBe("unit~enemy");
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(s.units[1].stunned).toBe(true);
  });
  it("Heroic Charge still buffs the first unit when the enemy leaves its location", () => {
    let s = fixture();
    const first = unit(),
      second = unit("ogn-049-298", 1, "enemy");
    first.location = second.location = "field:0";
    s.units = [first, second];
    s = play(s, id(155));
    s.units[1].location = "field:1";
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(s.units[1].stunned).toBe(false);
  });
  it.each([false, true])(
    "Safety Inspector pays optional XP upfront and preserves chooser ownership (paid %s)",
    (paid) => {
      let s = fixture();
      s.units = [
        unit("ogn-049-298", 0, "own"),
        unit("ogn-049-298", 1, "enemy"),
      ];
      s = play(s, id(164), (a) => Boolean(a.additionalCostPaid) === paid);
      expect(s.players[0].xp).toBe(paid ? 7 : 10);
      s = settle(save(s), (actions) =>
        actions.find((a) => a.label.includes(getCard("ogn-049-298").name)),
      );
      expect(s.units.some((u) => u.id === "own")).toBe(paid);
      expect(s.units.some((u) => u.id === "enemy")).toBe(false);
    },
  );
  it.each([id(178), "unl-178a-219"])(
    "Poppy %s can be paid with the XP discount even when normal Energy is unaffordable",
    (cardId) => {
      let s = fixture();
      const cost = getCard(cardId).energy!;
      s.players[0].energy = cost - 3;
      s.players[0].xp = 3;
      s.players[0].hand = [cardId];
      const actions = getLegalActions(s, 0).filter(
        (a) => a.category === "play" && a.cardId === cardId,
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].additionalCostPaid).toBe(true);
      s = save(applyAction(s, actions[0]));
      expect(s.players[0].xp).toBe(0);
      expect(s.players[0].energy).toBe(0);
    },
  );
  it("Poppy cannot use unavailable XP", () => {
    const s = fixture();
    s.players[0].xp = 2;
    s.players[0].energy = getCard(id(178)).energy! - 3;
    s.players[0].hand = [id(178)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.cardId === id(178),
      ),
    ).toBe(false);
  });
  it("Diana adds restricted Energy without a chain and cannot spend it outside a showdown", () => {
    let s = fixture();
    s.players[0].legendId = id(197);
    s.players[0].energy = 0;
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.sourceId === "legend")!,
    );
    expect(s.stack).toHaveLength(0);
    expect(s.players[0].showdownEnergy).toBe(1);
    s.players[0].hand = ["ogn-133-298"];
    expect(getLegalActions(s, 0).some((a) => a.category === "play")).toBe(
      false,
    );
    s = showdown(save(s));
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.category === "play")!,
    );
    expect(s.players[0].showdownEnergy).toBe(0);
    expect(s.players[0].energy).toBe(0);
  });
  it("new state fields reject malformed persisted resources", () => {
    const s = fixture();
    s.players[0].typedPower = { Chaos: -1 };
    expect(
      parseSession(JSON.stringify({ match: s, review: null })).match,
    ).toBeNull();
    s.players[0].typedPower = { Chaos: 2 };
    s.players[0].showdownEnergy = -1;
    expect(
      parseSession(JSON.stringify({ match: s, review: null })).match,
    ).toBeNull();
  });
  it("Undying Legion cannot spend spell-only Energy from trash", () => {
    const s = fixture();
    s.players[0].discard = [id(25)];
    s.players[0].cardsPlayedThisTurn = 1;
    s.players[0].energy = 0;
    s.players[0].spellEnergy = 10;
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "trash:0")).toBe(
      false,
    );
    s.players[0].energy = 3;
    const next = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.sourceId === "trash:0")!,
    );
    expect(next.players[0].spellEnergy).toBe(10);
    expect(next.players[0].energy).toBe(0);
  });
  it("Arachnoid does not call one enemy alone when a friendly unit is also there", () => {
    const s = fixture();
    const enemy = unit("ogn-049-298", 1, "enemy"),
      friendly = unit("ogn-049-298", 0, "friendly");
    enemy.location = friendly.location = "field:0";
    s.units = [enemy, friendly];
    s.fields[0].controller = 1;
    s.players[0].hand = [id(117)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === id(117) && a.locationId === "field:0",
      ),
    ).toBe(false);
  });
  it.each([null, 0] as const)(
    "Maduli cannot target an enemy-occupied field controlled by %s",
    (controller) => {
      const s = fixture();
      const enemy = unit("ogn-049-298", 1, "enemy");
      enemy.location = "field:0";
      s.units = [unit(id(144)), enemy];
      s.fields[0].controller = controller;
      expect(
        getLegalActions(s, 0).some((a) => a.id.startsWith("unl-wave4:gate:")),
      ).toBe(false);
    },
  );
  it("Maduli rechecks enemy control on resolution", () => {
    let s = fixture();
    const enemy = unit("ogn-049-298", 1, "enemy");
    enemy.location = "field:0";
    s.units = [unit(id(144)), enemy];
    s.fields[0].controller = 1;
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.id.startsWith("unl-wave4:gate:"))!,
    );
    s.fields[0].controller = 0;
    s = settle(s);
    expect(s.units[0].location).toBe("base:0");
  });
  it("Heroic Charge independently ignores a protected enemy at resolution", () => {
    let s = fixture();
    const enemy = unit("ogn-049-298", 1, "enemy"),
      ally = unit();
    enemy.location = ally.location = "field:0";
    s.units = [ally, enemy];
    s = play(s, id(155));
    s.units[1].untargetableByEnemy = true;
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(s.units[1].stunned).toBe(false);
  });
  it("XP additional costs refresh XP-gain observers before a later response gains XP", () => {
    let s = fixture();
    s.units = [unit(id(108))];
    s = settle(play(s, "ogn-048-298"));
    const before = getMight(s, s.units[0]);
    s = play(s, id(178), (a) => !!a.additionalCostPaid);
    s.stack.push({
      id: "gain-xp",
      kind: "ability",
      player: 0,
      cardId: id(1),
      effects: [{ type: "special", custom: "unl-wave4:xp", amount: 1 }],
    });
    s = settle(s);
    expect(s.players[0].xp).toBe(8);
    expect(getMight(s, s.units[0])).toBe(before + 1);
  });

  it("Mistfall cannot ready Maduli after buffing it", () => {
    let s = fixture();
    s.units = [unit(id(144))];
    s.units[0].ready = false;
    s.gears = [
      { id: "mistfall", cardId: "ogn-152-298", owner: 0, ready: true },
    ];
    s.stack = [
      {
        id: "buff",
        kind: "ability",
        player: 0,
        cardId: id(144),
        targetId: "unit",
        effects: [{ type: "buff", target: "friendlyUnit" }],
      },
    ];
    s = settle(s);
    expect(s.units[0].buff).toBe(1);
    expect(s.units[0].ready).toBe(false);
    expect(s.gears[0].ready).toBe(false);
  });
});
