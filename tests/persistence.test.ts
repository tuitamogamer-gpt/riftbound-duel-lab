import { describe, it, expect } from "vitest";
import {
  createGame,
  applyAction,
  applyActionStepped,
  getLegalActions,
} from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { parseSession, validState } from "../src/persistence";
import type { GameState, Unit } from "../src/game/types";
describe("saved manual Proceed session", () => {
  it("restores the precise event being reviewed without advancing", () => {
    const before = createGame({ seed: 25 });
    const action = getLegalActions(before, 0)[0];
    const result = applyActionStepped(before, action.id);
    const session = {
      match: result.state,
      review: {
        before,
        final: result.state,
        frames: result.frames,
        index: 0,
        action,
      },
    };
    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });
  it("falls back to final state when a saved review index is corrupt", () => {
    const match = createGame({ seed: 25 });
    const parsed = parseSession(
      JSON.stringify({ match, review: { frames: [], index: 99 } }),
    );
    expect(parsed.match).toEqual(match);
    expect(parsed.review).toBeNull();
  });
  it("rejects corrupt, partial or foreign save data", () => {
    for (const raw of [
      "{",
      "null",
      '{"match":{"version":1}}',
      '{"version":1,"players":[{},{}]}',
    ])
      expect(parseSession(raw)).toEqual({ match: null, review: null });
  });
  it("preserves final victory review even when match is already over", () => {
    const before = createGame({ seed: 25 });
    const final = structuredClone(before);
    final.winner = 0;
    final.phase = "ended";
    final.players[0].points = 8;
    const review = {
      before,
      final,
      frames: [{ state: final, label: "You win." }],
      index: 0,
      action: { id: "end-turn", label: "End turn", player: 0, category: "end" },
    };
    const restored = parseSession(JSON.stringify({ match: final, review }));
    expect(restored.review).not.toBeNull();
    expect(restored.match?.winner).toBe(0);
  });
});

describe("saved state structural recovery", () => {
  it("rejects final decision phases with missing mandatory payloads", () => {
    for (const phase of ["move", "choice", "damage", "showdown"] as const) {
      const match = createGame({ seed: 7 });
      match.phase = phase;
      expect(
        parseSession(JSON.stringify({ match, review: null })),
        phase,
      ).toEqual({ match: null, review: null });
    }
  });

  it("permits an intermediate review frame before movement restores its phase payload", () => {
    const before = createGame({ seed: 7 });
    const final = structuredClone(before);
    const intermediate = structuredClone(before);
    intermediate.phase = "move";
    intermediate.pendingMove = null;
    const review = {
      before,
      final,
      frames: [
        { state: intermediate, label: "Movement is completing." },
        { state: final, label: "Complete." },
      ],
      index: 0,
      action: getLegalActions(before, 0)[0],
    };
    expect(validState(intermediate)).toBe(false);
    expect(validState(intermediate, false)).toBe(true);
    expect(
      parseSession(JSON.stringify({ match: final, review })).review,
    ).toEqual(review);
  });

  it("rejects missing unit arrays, invalid numerics, corrupt rune objects, and unknown deck cards", () => {
    const unit: Unit = {
      id: "u1",
      owner: 0,
      cardId: "ogn-175-298",
      location: "base:0",
      ready: false,
      damage: 0,
      buff: 0,
      temporaryMight: 0,
      temporaryAssault: 0,
      stunned: false,
      gear: [],
      summonedTurn: 1,
    };
    const cases: Array<(state: GameState) => void> = [
      (state) => {
        state.units = [{ ...unit, gear: undefined } as unknown as Unit];
      },
      (state) => {
        state.units = [{ ...unit, damage: Number.NaN }];
      },
      (state) => {
        state.units = [
          { ...unit, temporaryAssault: undefined } as unknown as Unit,
        ];
      },
      (state) => {
        state.players[0].runes = [
          { id: "r1", domain: "Body", ready: "yes" } as never,
        ];
      },
      (state) => {
        state.players[0].deck[0] = "missing-card";
      },
      (state) => {
        state.log[0].turn = null as never;
      },
    ];
    for (const corrupt of cases) {
      const match = createGame({ seed: 7 });
      corrupt(match);
      expect(parseSession(JSON.stringify({ match }))).toEqual({
        match: null,
        review: null,
      });
    }
  });

  it("drops only the review when its action or final-state linkage is corrupt", () => {
    const before = createGame({ seed: 7 });
    const action = getLegalActions(before, 0)[0];
    const result = applyActionStepped(before, action);
    const review = {
      before,
      final: result.state,
      frames: result.frames,
      index: 0,
      action,
    };
    for (const broken of [
      { ...review, action: { ...action, unitIds: 7 } },
      { ...review, action: { ...action, targetId: {} } },
      { ...review, final: { ...result.state, seed: 900 } },
    ]) {
      const parsed = parseSession(
        JSON.stringify({ match: result.state, review: broken }),
      );
      expect(parsed.match).toEqual(result.state);
      expect(parsed.review).toBeNull();
    }
  });

  it("restores every real event frame across all four decks without advancing it", () => {
    for (const [index, deck] of [
      "annie",
      "lux",
      "garen",
      "master-yi",
    ].entries()) {
      let state = createGame({
        seed: 812 + index,
        playerDeckId: deck,
        botDeckId: "master-yi",
      });
      for (let step = 0; step < 120 && state.winner === null; step++) {
        const action = getBotAction(state)!;
        const result = applyActionStepped(state, action);
        expect(
          validState(result.state),
          `${deck} action ${step}: ${action.id}`,
        ).toBe(true);
        for (let frame = 0; frame < result.frames.length; frame++) {
          const review = {
            before: state,
            final: result.state,
            frames: result.frames,
            index: frame,
            action,
          };
          const restored = parseSession(
            JSON.stringify({ match: result.state, review }),
          );
          expect(
            restored.review?.index,
            `${deck} action ${step} frame ${frame}: ${result.frames[frame].label}`,
          ).toBe(frame);
          expect(restored.review?.frames[frame]).toEqual(result.frames[frame]);
        }
        state = result.state;
      }
    }
  }, 30_000);
});

function expandedGame(): GameState {
  const s = createGame({
    seed: 619,
    playerDeckId: "annie",
    botDeckId: "garen",
  });
  s.turn = 3;
  s.phase = "main";
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.stack = [];
  s.resolving = [];
  s.units = [];
  s.pendingChoice = null;
  for (const p of s.players) {
    p.hand = [];
    p.energy = 20;
    p.power = 2;
    p.spellEnergy = 3;
    p.runes = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map(
      (domain) => ({ id: `${p.id}-${domain}`, domain, ready: true }),
    );
  }
  s.units.push({
    id: "victim",
    owner: 1,
    cardId: "ogn-142-298",
    location: "field:0",
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 2,
  });
  s.hidden = [
    {
      id: "hidden-enemy",
      cardId: "unl-042-219",
      owner: 1,
      location: "field:1",
      hiddenTurn: 2,
    },
  ];
  return s;
}
function pausedDiscard() {
  let s = expandedGame();
  s.players[0].hand = ["ogn-008-298", "ogn-001-298"];
  const play = getLegalActions(s, 0).find(
    (a) =>
      a.category === "play" &&
      a.cardId === "ogn-008-298" &&
      a.targetId === "victim",
  )!;
  expect(play).toBeTruthy();
  s = applyAction(s, play);
  s = applyAction(s, "pass");
  const before = s;
  const action = getLegalActions(before, before.priorityPlayer).find(
    (a) => a.id === "pass",
  )!;
  const result = applyActionStepped(before, action);
  expect(result.state.pendingChoice?.kind).toBe("discard");
  expect(result.state.resolving?.[0]?.cardId).toBe("ogn-008-298");
  return { before, action, result };
}
describe("expanded precon saves and unfinished spell resolution", () => {
  it("restores a spell paused for discard and finishes the same effects exactly once", () => {
    const { result } = pausedDiscard();
    const paused = result.state;
    expect(paused.players[0].discard).not.toContain("ogn-008-298");
    const parsed = parseSession(
      JSON.stringify({ match: paused, review: null }),
    );
    expect(parsed.match).toEqual(paused);
    expect(parsed.match?.hidden).toEqual(paused.hidden);
    expect(parsed.match?.players[0].power).toBe(paused.players[0].power);
    expect(parsed.match?.players[0].spellEnergy).toBe(
      paused.players[0].spellEnergy,
    );
    expect(getLegalActions(parsed.match!, 0)).toEqual(
      getLegalActions(paused, 0),
    );
    const choose = getLegalActions(paused, 0).find(
      (a) => a.cardId === "ogn-001-298",
    )!;
    const continued = applyAction(parsed.match!, choose);
    expect(continued).toEqual(applyAction(paused, choose));
    expect(continued.resolving).toEqual([]);
    expect(
      continued.players[0].discard.filter((id) => id === "ogn-008-298"),
    ).toHaveLength(1);
    expect(validState(continued)).toBe(true);
  });
  it("preserves a review frame immediately after a spell leaves the stack but before its choice opens", () => {
    const { before, action, result } = pausedDiscard();
    const index = result.frames.findIndex(
      (frame) => frame.state.resolving?.length && !frame.state.pendingChoice,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const review = {
      before,
      action,
      final: result.state,
      frames: result.frames,
      index,
    };
    const parsed = parseSession(
      JSON.stringify({ match: result.state, review }),
    );
    expect(parsed.review).toEqual(review);
    expect(parsed.match).toEqual(result.state);
  });
  it("restores a Flow spell paused for a movement choice, then banishes it", () => {
    let s = expandedGame();
    s.hidden = [];
    s.units.push({ ...s.units[0], id: "ally", owner: 0 });
    s.units[0].location = "base:1";
    s.units[0].cardId = "ogn-175-298";
    s.players[0].discard = ["ven-105-166"];
    const flow = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === "ven-105-166" &&
        a.sourceId?.startsWith("trash:") &&
        a.targetId === "victim",
    )!;
    expect(flow).toBeTruthy();
    s = applyAction(s, flow);
    for (let i = 0; i < 8 && !s.pendingChoice; i++)
      s = applyAction(
        s,
        getLegalActions(s, s.priorityPlayer).find((a) => a.id === "pass")!,
      );
    expect(s.pendingChoice?.kind).toBe("move");
    expect(s.resolving?.[0]?.flowed).toBe(true);
    const restored = parseSession(JSON.stringify(s)).match!;
    expect(restored).toEqual(s);
    const option = getLegalActions(restored, 0)[0];
    const continued = applyAction(restored, option);
    expect(continued.players[0].banished).toContain("ven-105-166");
    expect(continued.players[0].discard).not.toContain("ven-105-166");
    expect(continued.resolving).toEqual([]);
    expect(continued.units.find((u) => u.id === "victim")?.location).toBe(
      "field:0",
    );
  });
  it("rejects malformed resolving zones, forged metadata, invalid snapshots and duplicate stack identities", () => {
    const paused = pausedDiscard().result.state;
    const corruptions: Array<(s: GameState) => void> = [
      (s) => {
        s.resolving = {} as never;
      },
      (s) => {
        s.resolving = [null] as never;
      },
      (s) => {
        s.resolving![0].kind = "ability";
      },
      (s) => {
        s.resolving![0].cardId = "missing-card";
      },
      (s) => {
        s.resolving![0].cardId = "ogn-001-298";
      },
      (s) => {
        s.resolving![0].effects = [{ type: "impossible-effect" }] as never;
      },
      (s) => {
        s.resolving![0].effects[0].fromHidden = "yes" as never;
      },
      (s) => {
        s.resolving![0].flowed = "yes" as never;
      },
      (s) => {
        s.resolving![0].sourceSnapshot = { ...s.units[0], gear: null } as never;
      },
      (s) => {
        s.stack.push(structuredClone(s.resolving![0]));
      },
      (s) => {
        s.pendingChoice = null;
        s.phase = "main";
      },
    ];
    for (const corrupt of corruptions) {
      const broken = structuredClone(paused);
      corrupt(broken);
      expect(parseSession(JSON.stringify({ match: broken }))).toEqual({
        match: null,
        review: null,
      });
    }
  });
  it("rejects invalid new resource pools and new hidden and choice payloads", () => {
    const paused = pausedDiscard().result.state;
    for (const key of ["power", "spellEnergy", "xp"] as const)
      for (const value of [-1, 1.5, "2", null]) {
        const broken = structuredClone(paused);
        broken.players[0][key] = value as never;
        expect(parseSession(JSON.stringify({ match: broken }))).toEqual({
          match: null,
          review: null,
        });
      }
    const corruptions: Array<(s: GameState) => void> = [
      (s) => {
        s.hidden![0].hiddenTurn = s.turn + 1;
      },
      (s) => {
        s.hidden![0].location = "base:1";
      },
      (s) => {
        s.pendingChoice!.lastDiscardEnergy = -2;
      },
      (s) => {
        s.pendingChoice!.afterEffects = [
          { type: "damage", target: "not-a-target" },
        ] as never;
      },
      (s) => {
        s.pendingChoice!.effect!.chosenTargetId = 6 as never;
      },
      (s) => {
        s.pendingChoice!.sourceSnapshot = {
          ...s.units[0],
          additionalCostPaid: "yes",
        } as never;
      },
      (s) => {
        s.pendingChoice = {
          ...s.pendingChoice!,
          kind: "custom",
          options: [
            {
              id: "end-turn",
              player: 0,
              label: "Bad choice",
              category: "ability",
              effects: [],
            },
          ],
        };
      },
      (s) => {
        s.pendingChoice = {
          ...s.pendingChoice!,
          kind: "custom",
          options: [
            {
              id: "choose-custom:bad",
              player: 1,
              label: "Wrong player",
              category: "ability",
              effects: [],
            },
          ],
        };
      },
    ];
    for (const corrupt of corruptions) {
      const broken = structuredClone(paused);
      corrupt(broken);
      expect(parseSession(JSON.stringify({ match: broken }))).toEqual({
        match: null,
        review: null,
      });
    }
  });
});

describe("staged battlefield save metadata", () => {
  it("preserves staged arrivals and combat designation identities, rejecting invalid shapes", () => {
    const s = expandedGame();
    s.stagedFields = ["field:0", "field:1"];
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      assigningPlayer: 0,
      stage: "priority",
      engaged: true,
      designatedUnits: ["victim"],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
    };
    expect(parseSession(JSON.stringify(s)).match).toEqual(s);
    for (const broken of [
      { ...s, stagedFields: "field:0" },
      { ...s, stagedFields: ["field:99"] },
      { ...s, combat: { ...s.combat, designatedUnits: [7] } },
      { ...s, combat: { ...s.combat, engaged: "true" } },
    ])
      expect(parseSession(JSON.stringify(broken)).match).toBeNull();
  });
});
