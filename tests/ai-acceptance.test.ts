import { describe, it, expect } from "vitest";
import { createReplay, replayMatch } from "../src/game/ai/replay";
import {
  applyAction,
  createGame,
  getGroupMoveAction,
  getLegalActions,
  iterateLegalActions,
  serializeGame,
} from "../src/game/engine";
import {
  decideBot,
  getObservation,
  getDecisionRequest,
  validateDecision,
  applyDecision,
  chooseDecision,
  publicExplanation,
} from "../src/game/bot";
import { requestFromObservation } from "../src/game/ai/decisions";
import { publicDecisionPresentation } from "../src/game/ai/presentation";
import { sampleState, observationRulesView } from "../src/game/ai/observation";
import { settleSimulation } from "../src/game/ai/planner";
import { SearchBudget, DIFFICULTIES } from "../src/game/ai/config";
import { combatUnit } from "./fixtures/combat";
import type { GameState, PlayerId } from "../src/game/types";

const opts = {
  difficulty: "normal" as const,
  deterministic: true,
  seed: 321,
  maxNodes: 1400,
};
function position(): GameState {
  const s = createGame({
    seed: 33,
    playerDeckId: "annie",
    botDeckId: "lux",
    firstPlayer: 0,
  });
  s.turn = 7;
  s.phase = "main";
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.fields = [
    { id: "field:0", cardId: "ogn-278-298", controller: null },
    { id: "field:1", cardId: "ogn-278-298", controller: null },
  ];
  s.units = [];
  s.stack = [];
  s.pendingChoice = null;
  s.combat = null;
  for (const p of s.players) {
    p.hand = [];
    p.championAvailable = false;
    p.runes = [];
    p.energy = 0;
    p.mulliganDone = true;
    p.hasBegun = true;
    p.legendUsedTurn = s.turn;
    p.points = 0;
    p.scoredFieldsThisTurn = [];
  }
  return s;
}
function resolve(s: GameState) {
  const end = settleSimulation(s, 0, new SearchBudget(4000, 9999, true));
  expect(end).not.toBeNull();
  return end!;
}
function move(s: GameState, ids: string[], to: "field:0" | "field:1") {
  return applyAction(s, getGroupMoveAction(s, s.priorityPlayer, ids, to)!);
}
function bot(s: GameState, extra = {}) {
  const result = decideBot(s, s.priorityPlayer, { ...opts, ...extra });
  expect(result).not.toBeNull();
  return result!;
}

describe("A — winning plans and scoring history", () => {
  it("develops a useful early unit instead of comparing it with an unavailable frozen turn", () => {
    const s = position();
    s.turn = 2;
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.players[0].hand = [
      "ogn-012-298",
      "ogn-176-298",
      "ogn-004-298",
      "ogs-003-024",
      "ogs-018-024",
    ];
    s.players[1].hand = [
      "ogn-096-298",
      "ogn-219-298",
      "ogn-087-298",
      "ogn-103-298",
      "ogn-088-298",
    ];
    s.players[0].runes = [
      { id: "enemy-chaos", domain: "Chaos", ready: true },
      { id: "enemy-fury", domain: "Fury", ready: true },
    ];
    s.players[1].runes = [
      { id: "order-a", domain: "Order", ready: true },
      { id: "order-b", domain: "Order", ready: true },
      { id: "mind", domain: "Mind", ready: true },
    ];
    for (const difficulty of Object.keys(
      DIFFICULTIES,
    ) as (keyof typeof DIFFICULTIES)[]) {
      const result = bot(s, {
        difficulty,
        maxNodes: DIFFICULTIES[difficulty].nodes,
      });
      expect(result.action.category).toBe("play");
      const next = settleSimulation(
        applyAction(s, result.action),
        1,
        new SearchBudget(4000, 9999, true),
      )!;
      expect(next.units.some((u) => u.owner === 1)).toBe(true);
    }
  });
  it("A1: all four levels choose a resolver-confirmed win before development", () => {
    let s = position();
    s.players[0].points = 7;
    s.players[0].scoredFieldsThisTurn = [1];
    s.units = [{ ...combatUnit("winner", 0), location: "base:0", ready: true }];
    s = move(s, ["winner"], "field:0");
    s = applyAction(s, "pass");
    // The last focus belongs to the other player; winning for that player is tested symmetrically.
    s.priorityPlayer = 0;
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 20;
    for (const difficulty of Object.keys(
      DIFFICULTIES,
    ) as (keyof typeof DIFFICULTIES)[]) {
      const result = bot(s, { difficulty });
      expect(result.action.id).toBe("pass");
      expect(result.trace.confirmedWin).toBe(true);
      expect(applyAction(s, result.action).winner).toBe(0);
    }
  });
  it("A2/A3: conquest at seven draws, records the field, then the second conquest wins", () => {
    let s = position();
    s.players[0].points = 7;
    s.units = [
      { ...combatUnit("a", 0, 3), location: "base:0", ready: true },
      { ...combatUnit("b", 0, 3), location: "base:0", ready: true },
    ];
    const before = s.players[0].hand.length;
    s = resolve(move(s, ["a"], "field:0"));
    expect(s.players[0].points).toBe(7);
    expect(s.players[0].hand.length).toBe(before + 1);
    expect(s.players[0].scoredFieldsThisTurn).toEqual([0]);
    const result = bot(s);
    expect(result.action.locationId).toBe("field:1");
    s = resolve(applyAction(s, result.action));
    expect(s.players[0].points).toBe(8);
    expect(s.winner).toBe(0);
  });
  it("A3: the beam sees the full two-field route from seven", () => {
    const s = position();
    s.players[0].points = 7;
    s.units = [
      { ...combatUnit("a", 0), location: "base:0", ready: true },
      { ...combatUnit("b", 0), location: "base:0", ready: true },
    ];
    const result = bot(s, { maxNodes: 3000 });
    expect(result.action.unitIds).toHaveLength(1);
    expect(result.trace.completedDepth).toBeGreaterThanOrEqual(2);
    expect(result.trace.confirmedWin).toBe(false);
  });
  it("A4: Hold from six followed by conquest of the other field wins", () => {
    let s = position();
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.players[0].points = 6;
    s.fields[0].controller = 0;
    s.units = [
      combatUnit("holder", 0, 3),
      { ...combatUnit("mover", 0, 3), location: "base:0", ready: true },
    ];
    s = resolve(applyAction(s, "end-turn"));
    expect(s.players[0].points).toBe(7);
    s = resolve(applyAction(s, bot(s).action));
    expect(s.winner).toBe(0);
  });
  it("A5/A6: a mutual kill prevents the enemy's winning Hold, even without control", () => {
    const s = position();
    s.players[1].points = 7;
    s.fields[0].controller = 1;
    s.units = [
      { ...combatUnit("sacrifice", 0, 3), location: "base:0", ready: true },
      combatUnit("threat", 1, 3),
    ];
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 5;
    const result = bot(s);
    expect(result.action.locationId).toBe("field:0");
    const next = resolve(applyAction(s, result.action));
    expect(next.fields[0].controller).toBeNull();
    expect(next.units.filter((u) => u.location === "field:0")).toHaveLength(0);
    expect(resolve(applyAction(next, "end-turn")).winner).toBeNull();
  });
  it("A7: recapturing an already scored field cannot produce another point", () => {
    let s = position();
    s.players[0].points = 4;
    s.players[0].scoredFieldsThisTurn = [0];
    s.units = [{ ...combatUnit("again", 0), location: "base:0", ready: true }];
    s = resolve(move(s, ["again"], "field:0"));
    expect(s.players[0].points).toBe(4);
    expect(s.players[0].scoredFieldsThisTurn).toEqual([0]);
  });
  it("tied scores above the target do not win, and final-point replacement still applies", () => {
    let s = position();
    s.players[0].points = 8;
    s.players[1].points = 8;
    s.units = [{ ...combatUnit("tie", 0), location: "base:0", ready: true }];
    s = resolve(move(s, ["tie"], "field:0"));
    expect(s.players[0].points).toBe(8);
    expect(s.winner).toBeNull();
  });
});

describe("cleanup and replay contracts", () => {
  it("C7: private inspection names cannot leak through animation captions or overlays", () => {
    const s = position();
    s.phase = "choice";
    const action = {
      id: "choose-option:stacked:0",
      player: 1 as const,
      category: "ability" as const,
      label: "Put Mega-Mech in hand",
      cardId: "ogn-088-298",
      detail: "Mega-Mech",
    };
    const view = publicDecisionPresentation(s, action, [
      {
        state: s,
        label: action.label,
        effect: { player: 1, cardId: action.cardId },
        draw: { player: 1, count: 1, cardIds: [action.cardId] },
      },
    ]);
    expect(view.action.cardId).toBeUndefined();
    expect(view.action.detail).toBeUndefined();
    expect(view.frames[0].effect).toBeUndefined();
    expect(view.frames[0].draw?.cardIds).toBeUndefined();
    expect([view.action.label, view.frames[0].label].join(" ")).not.toContain(
      "Mega-Mech",
    );
    expect(publicDecisionPresentation(s, action, view.frames, 1).action).toBe(
      action,
    );
  });
  it("finishes a resolving item's point changes before checking a lead", () => {
    let s = position();
    s.players[0].points = 7;
    s.players[1].points = 7;
    s.stack = [
      {
        id: "shared-score",
        player: 0,
        cardId: "ogn-009-298",
        kind: "spell",
        effects: [
          { type: "score", amount: 1 },
          { type: "score", amount: 1, who: "opponent" },
        ],
      },
    ];
    s = applyAction(applyAction(s, "pass"), "pass");
    expect(s.players.map((p) => p.points)).toEqual([8, 8]);
    expect(s.winner).toBeNull();
  });
  it("replays real engine decisions exactly with rules, configuration and bot seed", () => {
    let s = createGame({ seed: 145, botSeed: 71 });
    const replay = createReplay(s);
    for (let i = 0; i < 24 && s.winner === null; i++) {
      const result = bot(s, { maxNodes: 180 });
      replay.decisions.push({ action: result.action, trace: result.trace });
      s = applyAction(s, result.action);
    }
    expect(replayMatch(replay)).toEqual(s);
    expect(replay.initial.matchConfig?.rulesVersion).toContain("2026-07-16");
  });
  it("all production budgets recognize a mutual-kill defense against a winning Hold", () => {
    for (const difficulty of Object.keys(
      DIFFICULTIES,
    ) as (keyof typeof DIFFICULTIES)[]) {
      const s = position();
      s.players[1].points = 7;
      s.fields[0].controller = 1;
      s.units = [
        { ...combatUnit("sacrifice", 0, 3), location: "base:0", ready: true },
        combatUnit("threat", 1, 3),
      ];
      const result = bot(s, { difficulty, maxNodes: undefined });
      expect(result.action.locationId).toBe("field:0");
    }
  });
  it("finds a legal fallback without enumerating large multi-target combinations", () => {
    const s = position();
    s.phase = "choice";
    s.units = Array.from({ length: 80 }, (_, i) => combatUnit(`u${i}`, 0, 1));
    s.pendingChoice = {
      player: 0,
      kind: "trigger",
      remaining: 1,
      cardId: "ogn-009-298",
      sourceId: "legend",
      effects: [{ type: "buff", target: "upToFourFriendlyUnits" }],
      returnPhase: "main",
      returnPriority: 0,
    };
    const result = bot(s, { maxNodes: 0 });
    expect(result.action.id).toBe("choose-trigger:");
    expect(() => applyAction(s, result.action)).not.toThrow();
  });
  it("a zero-budget movement fallback completes the selection instead of toggling forever", () => {
    let s = position();
    s.units = [{ ...combatUnit("mover", 0), location: "base:0", ready: true }];
    s = applyAction(s, "move-start:mover:field:0");
    const result = bot(s, { maxNodes: 0 });
    expect(result.action.id).toBe("move-confirm");
    s = applyAction(s, result.action);
    expect(s.phase).toBe("showdown");
    expect(s.units[0].location).toBe("field:0");
  });
});

describe("B — common resolver and complete decisions", () => {
  it("keeps the legitimately inspected Predict window consistent until all choices resolve", () => {
    let s = position();
    s.players[0].deck = ["ogn-001-298", "ogn-009-298", ...s.players[0].deck];
    s.stack = [
      {
        id: "inspection",
        player: 0,
        cardId: s.players[0].legendId,
        kind: "ability",
        effects: [{ type: "special", custom: "ven-wave3:predict", amount: 2 }],
      },
    ];
    s.consecutivePasses = 1;
    s = applyAction(s, "pass");
    const observation = getObservation(s, 0);
    expect(observation.state.players[0].knownTopCards).toEqual([
      "ogn-001-298",
      "ogn-009-298",
    ]);
    expect(getObservation(s, 1).state.players[0].knownTopCards).toBeUndefined();
    const simulated = sampleState(observation, 42);
    expect(simulated.players[0].deck.slice(0, 2)).toEqual(
      s.players[0].deck.slice(0, 2),
    );
    for (let i = 0; s.pendingChoice && i < 4; i++)
      s = applyAction(s, bot(s).action);
    expect(s.pendingChoice).toBeNull();
    expect(getObservation(s, 0).state.players[0].knownTopCards).toBeUndefined();
  });
  it("preserves public expansion discounts and once-per-turn counters without copying unknown extension data", () => {
    const s = position();
    Object.assign(s, {
      originsNextSpellDiscount: { 0: { turn: s.turn, amount: 1 } },
      vendettaWave3: {
        turn: s.turn,
        played: [["ogn-009-298"], []],
        targetedEnemy: [false, false],
        wolfUsed: [],
      },
      privateTestExtension: { futureCard: "ogn-001-298" },
    });
    s.players[0].hand = ["ogn-009-298"];
    s.players[0].runes = [{ id: "fury", domain: "Fury", ready: false }];
    s.units = [combatUnit("target", 1)];
    const observation = getObservation(s, 0);
    const view = observationRulesView(observation);
    expect([...iterateLegalActions(view, 0)].map((a) => a.id)).toEqual(
      [...iterateLegalActions(s, 0)].map((a) => a.id),
    );
    expect(JSON.stringify(observation)).not.toContain("privateTestExtension");
    expect(JSON.stringify(view)).toContain("originsNextSpellDiscount");
  });
  it("B1/B6: simulated replacement damage and cleanup match the real resolver", () => {
    let s = position();
    s.units = [
      { ...combatUnit("attacker", 0, 5), location: "base:0", ready: true },
      { ...combatUnit("guard", 1, 3), preventNextDamageTurn: s.turn },
    ];
    s.fields[0].controller = 1;
    const action = getGroupMoveAction(s, 0, ["attacker"], "field:0")!;
    const sim = sampleState(getObservation(s, 0), 54);
    const actual = resolve(applyAction(s, action)),
      simulated = resolve(applyAction(sim, action));
    expect(simulated.units).toEqual(actual.units);
    expect(simulated.fields).toEqual(actual.fields);
    expect(actual.units.find((u) => u.id === "attacker")?.location).toBe(
      "base:0",
    );
  });
  it("B2: rune ordering preserves the domain needed for a follow-up", () => {
    const s = position();
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 4;
    s.players[0].runes = [
      { id: "fury", domain: "Fury", ready: true },
      { id: "calm", domain: "Calm", ready: true },
    ];
    const a = getLegalActions(s, 0).find((a) => a.category === "play")!;
    const next = applyAction(s, { ...a, paymentRuneOrder: ["calm", "fury"] });
    expect(next.players[0].runes.find((r) => r.id === "fury")?.ready).toBe(
      true,
    );
    const before = serializeGame(s);
    expect(() =>
      applyAction(s, { ...a, paymentRuneOrder: ["made-up"] }),
    ).toThrow();
    expect(serializeGame(s)).toBe(before);
  });
  it("B2: the planner pays universal Power with Order to retain a legal Mind reaction", () => {
    const s = position();
    s.players[0].hand = ["ogn-093-298"]; // Smoke Screen costs one Mind Power.
    s.players[0].energy = 2;
    s.players[0].runes = [
      { id: "mind", domain: "Mind", ready: false },
      { id: "order", domain: "Order", ready: false },
    ];
    s.units = [
      { ...combatUnit("own", 0, 4), location: "base:0", ready: false },
      combatUnit("enemy", 1, 3),
    ];
    // Hextech Gauntlets has a universal equip cost and a useful permanent buff.
    s.gears = [
      { id: "gauntlets", cardId: "unl-188-219", owner: 0, ready: true },
    ];
    const result = bot(s);
    expect(result.action.id).toBe("equip:gauntlets:own");
    expect(result.action.paymentRuneOrder).toEqual(["order", "mind"]);
    const paid = resolve(applyAction(s, result.action));
    expect(paid.players[0].runes.map((r) => r.domain)).toEqual(["Mind"]);
    expect(
      getLegalActions(paid, 0).some((a) => a.cardId === "ogn-093-298"),
    ).toBe(true);
    const defaultPayment = resolve(applyAction(s, result.action.id));
    expect(
      getLegalActions(defaultPayment, 0).some(
        (a) => a.cardId === "ogn-093-298",
      ),
    ).toBe(false);
  });
  it("B3: an Action-only spell never becomes a reaction in an open chain", () => {
    const s = position();
    s.players[0].hand = ["ogs-002-024"];
    s.players[0].energy = 20;
    s.players[0].power = 5;
    s.stack = [
      {
        id: "chain",
        player: 1,
        cardId: "ogn-009-298",
        kind: "spell",
        effects: [{ type: "damage", amount: 3 }],
        targetId: "target",
      },
    ];
    s.units = [combatUnit("target", 0)];
    expect(
      [...iterateLegalActions(s, 0)].some((a) => a.cardId === "ogs-002-024"),
    ).toBe(false);
  });
  it("B4/B5: group movement is atomic and an empty field waits for showdown", () => {
    const s = position();
    s.units = ["a", "b"].map((id) => ({
      ...combatUnit(id, 0),
      location: "base:0" as const,
      ready: true,
    }));
    const moved = move(s, ["a", "b"], "field:0");
    expect(moved.units.every((u) => u.location === "field:0" && !u.ready)).toBe(
      true,
    );
    expect(moved.phase).toBe("showdown");
    expect(moved.fields[0].controller).toBeNull();
    expect(moved.players[0].points).toBe(0);
    expect(moved.revision).toBe((s.revision ?? 0) + 1);
  });
  it("B8/C4: mandatory off-turn discard keeps progressing with zero search budget", () => {
    let s = position();
    s.currentPlayer = 1;
    s.players[0].hand = ["ogn-001-298", "ogn-009-298"];
    s.phase = "choice";
    s.pendingChoice = {
      player: 0,
      kind: "discard",
      remaining: 2,
      returnPhase: "main",
      returnPriority: 1,
    };
    for (let i = 0; i < 2; i++) {
      const result = bot(s, { maxNodes: 0 });
      expect(result.trace.usedFallback).toBe(true);
      s = applyAction(s, result.action);
    }
    expect(s.pendingChoice).toBeNull();
    expect(s.players[0].hand).toHaveLength(0);
  });
});

describe("C — privacy, determinism and stale decisions", () => {
  it("additional identical hidden-response samples refine rather than multiply the same risk", () => {
    let s = position();
    s.matchConfig!.openDecklists = true;
    s.players[1].hand = ["ogn-009-298"];
    s.players[1].deckList = ["ogn-009-298"];
    s.players[1].legendId = "ogs-017-024";
    s.players[1].championId = "ogs-001-024";
    s.players[1].championAvailable = true;
    s.players[1].energy = 1;
    s.players[1].power = 1;
    for (const p of s.players) {
      p.deck = [];
      p.runeDeck = [];
    }
    s.fields[0].controller = 1;
    s.units = [
      { ...combatUnit("attacker", 0, 3), location: "base:0", ready: true },
      combatUnit("defender", 1, 2),
    ];
    s = move(s, ["attacker"], "field:0");
    const original = DIFFICULTIES.expert.samples;
    try {
      Object.assign(DIFFICULTIES.expert, { samples: 1 });
      const baseline = bot(s, { difficulty: "expert", maxNodes: 2200 });
      Object.assign(DIFFICULTIES.expert, { samples: 2 });
      const once = bot(s, { difficulty: "expert", maxNodes: 2200 });
      Object.assign(DIFFICULTIES.expert, { samples: 3 });
      const twice = bot(s, { difficulty: "expert", maxNodes: 2200 });
      expect(once.trace.sampleCount).toBe(2);
      expect(twice.trace.sampleCount).toBe(3);
      expect(once.trace.selectedEvaluation!.utility).toBeLessThan(
        baseline.trace.selectedEvaluation!.utility,
      );
      expect(twice.trace.selectedEvaluation!.utility).toBeCloseTo(
        once.trace.selectedEvaluation!.utility,
      );
      expect(twice.action.id).toBe(once.action.id);
    } finally {
      Object.assign(DIFFICULTIES.expert, { samples: original });
    }
  });
  it("builds consistent public counts and registered-card multiplicities for an open-list Hidden hypothesis", () => {
    const s = position();
    s.matchConfig!.openDecklists = true;
    const opponent = s.players[1];
    opponent.championAvailable = true;
    opponent.discard = [];
    opponent.banished = [];
    opponent.hand = ["ogn-009-298"];
    opponent.deck = ["ogn-001-298", "ogn-001-298"];
    opponent.deckList = ["ogn-083-298", ...opponent.hand, ...opponent.deck];
    s.hidden = [
      {
        id: "private-hidden",
        cardId: "ogn-083-298",
        owner: 1,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    for (let sample = 0; sample < 3; sample++) {
      const simulated = sampleState(getObservation(s, 0), 19, sample);
      expect(simulated.players[1].hand).toHaveLength(1);
      expect(simulated.players[1].deck).toHaveLength(2);
      expect(simulated.hidden).toHaveLength(1);
      expect(
        [
          ...simulated.players[1].hand,
          ...simulated.players[1].deck,
          simulated.hidden![0].cardId,
        ].sort(),
      ).toEqual([...opponent.deckList].sort());
    }
  });
  it("C1/C2: hidden identities, both future orders, and game RNG cannot affect the observation or decision", () => {
    const s = position();
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 4;
    s.players[1].hand = ["ogn-009-298"];
    s.hidden = [
      {
        id: "secret-name-A",
        cardId: "ogn-009-298",
        owner: 1,
        location: "field:1",
        hiddenTurn: 1,
      },
    ];
    const changed = structuredClone(s);
    changed.rng = 777;
    changed.seed = 999;
    changed.nextId = 99999;
    changed.players[1].hand = ["ogs-018-024"];
    changed.players[1].deckId = "garen";
    changed.players[1].deckList = ["ogs-018-024"];
    changed.hidden![0] = {
      ...changed.hidden![0],
      id: "TIBBERS",
      cardId: "ogs-018-024",
    };
    for (const p of changed.players) {
      p.deck.reverse();
      p.runeDeck.reverse();
    }
    expect(getObservation(changed, 0)).toEqual(getObservation(s, 0));
    expect(bot(changed).decision).toEqual(bot(s).decision);
    expect(JSON.stringify(getObservation(s, 0))).not.toContain("secret-name");
  });
  it("C3: fixed-node decisions are reproducible and simulation does not consume live RNG", () => {
    const s = createGame({ seed: 91 });
    const before = serializeGame(s);
    expect(bot(s).decision).toEqual(bot(s).decision);
    expect(serializeGame(s)).toBe(before);
  });
  it("C5: a stale or forged decision makes no partial mutation", () => {
    const s = position();
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 4;
    const request = getDecisionRequest(s)!;
    const decision = bot(s).decision;
    const next = applyAction(s, "end-turn"),
      before = serializeGame(next);
    expect(validateDecision(next, request, decision).valid).toBe(false);
    expect(() => applyDecision(next, request, decision)).toThrow("Stale");
    expect(serializeGame(next)).toBe(before);
    expect(
      validateDecision(s, request, { ...decision, optionId: "forged" }).valid,
    ).toBe(false);
  });
  it("C6: pass focus and pass priority have distinct request kinds and do not end the turn", () => {
    let s = position();
    s.units = [{ ...combatUnit("mover", 0), location: "base:0", ready: true }];
    s = move(s, ["mover"], "field:0");
    expect(getDecisionRequest(s)?.kind).toBe("PASS_FOCUS");
    const before = s.turn;
    s = applyAction(s, "pass");
    expect(s.turn).toBe(before);
    expect(s.priorityPlayer).toBe(1);
    s.stack.push({
      id: "chain",
      cardId: "ogn-009-298",
      player: 1,
      kind: "spell",
      effects: [],
    });
    expect(getDecisionRequest(s)?.kind).toBe("PASS_PRIORITY");
  });
  it("C7: public explanation excludes private actions, alternatives, decklists and seed", () => {
    const s = position();
    s.players[0].hand = ["ogs-018-024"];
    s.players[0].energy = 20;
    const result = bot(s);
    const text = JSON.stringify(publicExplanation(result));
    for (const secret of [
      "Tibbers",
      "ogs-018-024",
      "hand:0",
      "alternatives",
      "seed",
      "deckList",
    ])
      expect(text).not.toContain(secret);
  });
  it("legal fallback is prepared independently of candidate enumeration, and no-options is an error", () => {
    const s = position();
    s.phase = "choice";
    s.pendingChoice = {
      player: 0,
      kind: "move",
      remaining: 1,
      targetId: "missing",
      returnPhase: "main",
      returnPriority: 0,
    };
    expect(() => getDecisionRequest(s)).toThrow("no legal option");
  });
  it("a zero-node planner returns the exact provided fallback", () => {
    const s = position(),
      observation = getObservation(s, 0),
      request = requestFromObservation(observation)!;
    expect(
      chooseDecision(request, observation, { maxNodes: 0 }).decision,
    ).toEqual(request.fallbackDecision);
  });
});
