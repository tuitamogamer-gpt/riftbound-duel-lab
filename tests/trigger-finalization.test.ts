import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions } from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { parseSession } from "../src/persistence";
import type { Effect, GameState, Unit } from "../src/game/types";

function fixture(): GameState {
  const s = createGame({ seed: 808 });
  Object.assign(s, {
    phase: "main",
    turn: 4,
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
      energy: 10,
      power: 10,
      xp: 5,
      runes: [],
      championAvailable: false,
      legendId: "ogn-251-298",
      deck: Array(20).fill("ogn-049-298"),
    });
  return s;
}
function unit(id = "source", owner: 0 | 1 = 0, cardId = "ogn-049-298"): Unit {
  return {
    id,
    owner,
    cardId,
    location: "base:0",
    ready: true,
    buff: 0,
    damage: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
}
function choice(s: GameState, effects: Effect[]) {
  s.phase = "choice";
  s.pendingChoice = {
    player: 0,
    kind: "trigger",
    remaining: 1,
    sourceId: "source",
    cardId: "ogn-049-298",
    effects,
    returnPhase: "main",
    returnPriority: 0,
  };
  return s;
}
function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.pendingChoice); i++) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? actions[0]
      : actions.find((a) => a.category === "pass");
    if (!a) throw new Error("No continuation");
    s = applyAction(s, a);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
describe("trigger finalization and responses", () => {
  it("a leading optional gear trigger cannot pay its cost with no legal target", () => {
    const s = choice(fixture(), [
      {
        type: "kill",
        target: "anyGear",
        optional: true,
        triggerCost: { energy: 2 },
      },
    ]);
    expect(getLegalActions(s, 0).map((a) => a.id)).toEqual([
      "choose-trigger:skip",
    ]);
    const next = applyAction(s, "choose-trigger:skip");
    expect(next.players[0].energy).toBe(10);
    expect(next.stack).toEqual([]);
  });
  it("a programmatic self bonus does not trigger friendly-target observers", () => {
    const s = fixture();
    s.units = [unit("lux", 0, "ogs-006-024")];
    s.gears = [{ id: "wheel", cardId: "sfd-144-221", owner: 0, ready: true }];
    s.stack = [
      {
        id: "spell",
        player: 0,
        cardId: "ogs-022-024",
        kind: "spell",
        effects: [{ type: "draw" }],
      },
    ];
    const next = settle(s);
    expect(next.units[0].temporaryMight).toBe(3);
    expect(next.gears[0].ready).toBe(true);
    expect(next.players[0].hand).toHaveLength(1);
  });
  it("Repeat choosing the same unit twice emits both choice events", () => {
    const s = fixture();
    s.units = [unit("irelia", 0, "sfd-057-221")];
    s.players[0].hand = ["sfd-003-221"];
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.repeated &&
        a.targetId === "irelia" &&
        a.repeatedTargetId === "irelia",
    );
    expect(a).toBeDefined();
    const next = applyAction(s, a!);
    expect(
      next.stack.filter((item) => item.cardId === "sfd-057-221"),
    ).toHaveLength(2);
    const resolved = settle(next);
    expect(resolved.units[0].temporaryMight).toBe(2);
    expect(resolved.units[0].temporaryAssault).toBe(4);
  });
  it("finishes optional death triggers before a winning conquest and saves the terminal state", () => {
    const s = fixture();
    s.phase = "damage";
    s.priorityPlayer = 1;
    const survivor = unit("survivor"),
      casualty = unit("casualty"),
      enemy = unit("enemy", 1);
    for (const u of [survivor, casualty, enemy]) u.location = "field:0";
    survivor.baseMightOverride = 5;
    casualty.baseMightOverride = 1;
    enemy.baseMightOverride = 2;
    s.units = [survivor, casualty, enemy];
    s.gears = [{ id: "altar", cardId: "sfd-169-221", owner: 0, ready: true }];
    s.players[0].points = 7;
    s.players[0].scoredFieldsThisTurn = [1];
    s.fields[0].controller = 1;
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      engaged: true,
      designatedUnits: s.units.map((u) => u.id),
      stage: "assign",
      assigningPlayer: 1,
      total: [6, 2],
      remaining: [0, 0],
      assignments: [{ enemy: 6 }, { casualty: 1, survivor: 1 }],
    };
    const pending = applyAction(s, "damage-done");
    expect(pending.pendingChoice?.cardId).toBe("sfd-169-221");
    expect(pending.pendingCombatFinish).toBe(true);
    expect(pending.winner).toBeNull();
    expect(pending.players[0].points).toBe(7);
    const done = applyAction(pending, "choose-trigger:skip");
    expect(done.winner).toBe(0);
    expect(done.phase).toBe("ended");
    expect(done.pendingChoice).toBeNull();
    expect(
      parseSession(JSON.stringify({ match: done, review: null })).match,
    ).toEqual(done);
  });
  it("spell-only Energy pays the spell's Repeat cost and is spent once", () => {
    const s = fixture();
    s.players[0].hand = ["sfd-077-221"];
    s.players[0].energy = 0;
    s.players[0].spellEnergy = 30;
    s.units = [unit("enemy", 1)];
    s.units[0].location = "base:1";
    s.gears = [{ id: "gear", cardId: "ogn-060-298", owner: 1, ready: true }];
    const action = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === "sfd-077-221" &&
        a.repeated &&
        a.targetId === "enemy" &&
        a.repeatedTargetId === "gear",
    );
    expect(action).toBeDefined();
    const next = applyAction(s, action!);
    expect(next.players[0].energy).toBe(0);
    expect(next.stack[0].energySpent).toBe(8);
    expect(next.players[0].spellEnergy).toBe(22);
    expect(next.stack[0].effects.map((e) => e.type)).toEqual([
      "damage",
      "kill",
    ]);
  });
  it("pays energy, Power, XP, exhaustion and physical recycle selections before any response", () => {
    const s = fixture();
    s.units = [unit()];
    s.players[0].discard = ["ogn-050-298", "ogn-049-298", "ogn-014-298"];
    choice(s, [
      {
        type: "draw",
        amount: 2,
        optional: true,
        triggerCost: {
          energy: 2,
          power: 1,
          domain: "Mind",
          xp: 3,
          exhaust: true,
          recycleCost: 2,
        },
      },
    ]);
    const actions = getLegalActions(s, 0).filter(
      (a) => a.id !== "choose-trigger:skip",
    );
    expect(actions).toHaveLength(3);
    const a = actions.find((a) => a.cardIndices?.join() === "0,2")!;
    const next = applyAction(s, a);
    expect(next.players[0]).toMatchObject({
      energy: 8,
      power: 9,
      xp: 2,
      discard: ["ogn-049-298"],
      hand: [],
    });
    expect(next.units[0].ready).toBe(false);
    expect(next.players[0].deck.slice(-2).sort()).toEqual([
      "ogn-014-298",
      "ogn-050-298",
    ]);
    expect(next.stack[0].effects[0].triggerCost).toBeUndefined();
    expect(settle(next).players[0].hand).toHaveLength(2);
    expect(s.players[0].energy).toBe(10);
  });
  it.each(["energy", "power", "xp", "exhaust", "recycleCost"] as const)(
    "cannot accept an unpayable %s cost",
    (kind) => {
      const s = fixture();
      s.units = [unit()];
      if (kind === "exhaust") s.units[0].ready = false;
      choice(s, [
        {
          type: "draw",
          optional: true,
          triggerCost: { [kind]: kind === "exhaust" ? true : 30 },
        },
      ]);
      expect(getLegalActions(s, 0).map((a) => a.id)).toEqual([
        "choose-trigger:skip",
      ]);
      expect(applyAction(s, "choose-trigger:skip").stack).toEqual([]);
    },
  );
  it("declining does not pay or produce a chain item", () => {
    const s = choice(fixture(), [
      { type: "draw", optional: true, triggerCost: { energy: 4 } },
    ]);
    const next = applyAction(s, "choose-trigger:skip");
    expect(next.players[0].energy).toBe(10);
    expect(next.stack).toEqual([]);
  });
  it("combines the leading cost with Deflect when determining legal target choices", () => {
    const s = fixture();
    s.units = [unit("enemy", 1, "ogn-013-298")];
    s.players[0].power = 1;
    choice(s, [
      {
        type: "damage",
        target: "enemyUnit",
        optional: true,
        triggerCost: { power: 1 },
      },
    ]);
    expect(getLegalActions(s, 0).map((a) => a.id)).toEqual([
      "choose-trigger:skip",
    ]);
    s.players[0].power = 2;
    const next = applyAction(s, getLegalActions(s, 0)[0]);
    expect(next.players[0].power).toBe(0);
    expect(next.units[0].damage).toBe(0);
  });
  it("announces mode and its legal target before responses, preserving both across save/load", () => {
    const s = fixture();
    s.units = [unit("ally"), unit("enemy", 1)];
    choice(s, [
      {
        type: "special",
        modes: [
          { label: "Draw", effects: [{ type: "draw", amount: 2 }] },
          {
            label: "Harm",
            effects: [{ type: "damage", amount: 1, target: "enemyUnit" }],
          },
        ],
      },
    ]);
    const restored = parseSession(
      JSON.stringify({ match: s, review: null }),
    ).match!;
    expect(restored).toEqual(s);
    const actions = getLegalActions(restored, 0);
    expect(actions).toHaveLength(2);
    const next = applyAction(
      restored,
      actions.find((a) => a.label.startsWith("Harm"))!,
    );
    expect(next.stack[0]).toMatchObject({
      targetId: "enemy",
      effects: [{ type: "damage", amount: 1, target: "enemyUnit" }],
    });
    const saved = parseSession(
      JSON.stringify({ match: next, review: null }),
    ).match!;
    saved.units = saved.units.filter((u) => u.id !== "enemy");
    expect(settle(saved).players[0].hand).toHaveLength(0);
  });
  it("omits an impossible targeted mode while keeping a nontargeted mode", () => {
    const s = choice(fixture(), [
      {
        type: "special",
        modes: [
          { label: "Kill", effects: [{ type: "kill", target: "enemyUnit" }] },
          { label: "Draw", effects: [{ type: "draw" }] },
        ],
      },
    ]);
    const actions = getLegalActions(s, 0);
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Draw");
  });
  it("selects rune identities, then pays once, and resumes the intermediate save", () => {
    const s = fixture();
    s.players[0].runes = [
      { id: "a", domain: "Mind", ready: false },
      { id: "b", domain: "Mind", ready: false },
    ];
    choice(s, [
      {
        type: "readyRunes",
        amount: 1,
        chooseRunes: true,
        triggerCost: { energy: 2 },
      },
    ]);
    const selecting = applyAction(s, getLegalActions(s, 0)[0]);
    expect(selecting.players[0].energy).toBe(10);
    const restored = parseSession(
      JSON.stringify({ match: selecting, review: null }),
    ).match!;
    const announced = applyAction(restored, "choose-rune:a");
    expect(announced.players[0].energy).toBe(8);
    expect(announced.players[0].runes[0].ready).toBe(false);
    expect(announced.stack[0].effects[0].runeIds).toEqual(["a"]);
    const resolved = settle(announced);
    expect(resolved.players[0].energy).toBe(8);
    expect(resolved.players[0].runes.map((r) => r.ready)).toEqual([
      true,
      false,
    ]);
  });
  it("the bot evaluates the selected trigger mode and prefers drawing over skipping", () => {
    const s = choice(fixture(), [
      {
        type: "special",
        optional: true,
        modes: [
          { label: "Draw", effects: [{ type: "draw", amount: 2 }] },
          {
            label: "Opponent draws",
            effects: [{ type: "draw", amount: 2, who: "opponent" }],
          },
        ],
      },
    ]);
    const before = JSON.stringify(s);
    expect(getBotAction(s)?.label).toBe("Draw");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("rejects malformed saved trigger costs and modal effects", () => {
    const s = choice(fixture(), [
      { type: "draw", triggerCost: { energy: -1 } },
    ]);
    expect(
      parseSession(JSON.stringify({ match: s, review: null })).match,
    ).toBeNull();
    s.pendingChoice!.effects = [
      {
        type: "special",
        modes: [{ label: "Broken", effects: [{ type: "bogus" as "draw" }] }],
      },
    ];
    expect(
      parseSession(JSON.stringify({ match: s, review: null })).match,
    ).toBeNull();
  });
  it("draw triggers wait until all instructions finish, including a subsequent discard", () => {
    const s = fixture();
    s.players[0].hand = ["ogn-049-298"];
    s.units = [unit("one"), unit("two")];
    s.gears = [{ id: "jewel", cardId: "unl-074-219", owner: 0, ready: true }];
    s.stack = [
      {
        id: "draw-discard",
        player: 0,
        cardId: "ogn-014-298",
        kind: "spell",
        effects: [{ type: "draw", amount: 2 }, { type: "discard" }],
      },
    ];
    let next = applyAction(applyAction(s, "pass"), "pass");
    expect(next.pendingChoice?.kind).toBe("discard");
    expect(next.pendingTriggers?.some((t) => t.cardId === "unl-074-219")).toBe(
      true,
    );
    next = applyAction(next, getLegalActions(next, 0)[0]);
    expect(next.pendingChoice?.kind).toBe("trigger");
    expect(next.players[0].hand).toHaveLength(2);
    expect(next.players[0].discard).toContain("ogn-014-298");
    expect(settle(next).players[0].hand).toHaveLength(2);
  });
});
