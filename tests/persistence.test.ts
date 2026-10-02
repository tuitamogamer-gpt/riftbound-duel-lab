import { describe, it, expect } from "vitest";
import {
  createGame,
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
