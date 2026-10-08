import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import type { Review } from "../src/components/StepFlow";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import {
  PLAYBACK_SPEED_KEY,
  readPlaybackSpeed,
  stepReview,
} from "../src/game/playback";
import {
  automaticDelay,
  matchStatus,
  reviewDelay,
} from "../src/game/presentation";
import { parseSession } from "../src/persistence";
import { createCombatFixture } from "./fixtures/combat";

function opening(): Review {
  const before = applyAction(
    createGame({ seed: 44, firstPlayer: 0 }),
    "mulligan:",
  );
  const action = getLegalActions(before, 1).find((a) => a.id === "mulligan:")!;
  const result = applyActionStepped(before, action);
  return {
    before,
    final: result.state,
    frames: result.frames,
    action,
    index: 0,
  };
}

describe("player-controlled effect playback", () => {
  it("loads supported speeds and tolerates blocked or invalid storage", () => {
    for (const speed of [0.5, 1, 2]) {
      const getItem = vi.fn(() => String(speed));
      expect(readPlaybackSpeed({ getItem })).toBe(speed);
      expect(getItem).toHaveBeenCalledWith(PLAYBACK_SPEED_KEY);
    }
    for (const value of [null, "", "0", "-1", "10", "NaN", "Infinity", "fast"])
      expect(readPlaybackSpeed({ getItem: () => value })).toBe(1);
    expect(
      readPlaybackSpeed({
        getItem: () => {
          throw new Error("Blocked");
        },
      }),
    ).toBe(1);
  });

  it("scales effects and automatic pacing while real human decisions stay untimed", () => {
    const review = opening();
    for (let index = 0; index < review.frames.length; index++) {
      const frame = { ...review, index };
      expect(reviewDelay(frame, 2)).toBe(Math.round(reviewDelay(frame) / 2));
      expect(reviewDelay(frame, 0.5)).toBe(reviewDelay(frame) * 2);
    }
    expect(automaticDelay(review.final, 1, 2)).toBe(525);
    expect(automaticDelay(review.final, 0, 2)).toBe(140);
    expect(automaticDelay(review.final, 0, 0.5)).toBe(560);
  });

  it("browses snapshots without changing the committed match, decisions or frames", () => {
    const review = opening();
    const original = structuredClone(review);
    const next = stepReview(review)!;
    expect(next.index).toBe(1);
    expect(stepReview(next, -1)).toEqual(review);
    expect(stepReview(review, -1)).toBe(review);
    let cursor: Review | null = review;
    for (let i = 0; i < review.frames.length; i++) cursor = stepReview(cursor);
    expect(cursor).toBeNull();
    expect(stepReview(null)).toBeNull();
    expect(review).toEqual(original);
    expect(next.final).toBe(review.final);
    expect(next.frames).toBe(review.frames);
    expect(next.action).toBe(review.action);
  });

  it("restores a paused review at its chosen frame and accepts older saves", () => {
    const review = stepReview(opening())!;
    const session = { match: review.final, review, paused: true };
    expect(parseSession(JSON.stringify(session))).toEqual(session);
    const legacy = { match: review.final, review };
    expect(parseSession(JSON.stringify(legacy))).toEqual(legacy);
    expect(
      parseSession(JSON.stringify({ ...legacy, paused: "false" })),
    ).toEqual(legacy);
  });

  it("offers frame navigation only during a paused review, with an explicit final step", () => {
    const review = opening();
    const props = {
      game: review.final,
      legal: getLegalActions(review.final, 0),
      selected: null,
      target: null,
      clear: vi.fn(),
      act: vi.fn(),
      review,
      busy: false,
      paused: true,
      resume: vi.fn(),
      step: vi.fn(),
      mulligan: [],
      inspect: vi.fn(),
      openPile: vi.fn(),
    };
    const first = renderToStaticMarkup(createElement(MatchControls, props));
    expect(first).toContain('disabled="" aria-label="Previous effect"');
    expect(first).toContain(`Effect 1 of ${review.frames.length}`);
    expect(first).toContain("Next effect");
    expect(first).not.toContain("End turn");
    const last = renderToStaticMarkup(
      createElement(MatchControls, {
        ...props,
        review: { ...review, index: review.frames.length - 1 },
      }),
    );
    expect(last).toContain("Finish review");
    expect(last).toContain("Resume game");
    const playing = renderToStaticMarkup(
      createElement(MatchControls, { ...props, paused: false }),
    );
    expect(playing).not.toContain("Next effect");
    expect(playing).not.toContain("Previous effect");
  });
});

describe("decision ownership", () => {
  it("labels a human reaction during the opponent turn without claiming the turn changed", () => {
    const game = createCombatFixture();
    game.currentPlayer = 1;
    game.priorityPlayer = 0;
    game.phase = "showdown";
    game.stack = [
      {
        id: "spell",
        cardId: "ogn-004-298",
        player: 1,
        kind: "spell",
        effects: [],
      },
    ];
    expect(matchStatus(game)).toEqual({
      state: "reaction",
      label: "Your reaction",
    });
    game.stack = [];
    expect(matchStatus(game).label).toBe("Action window");
    game.priorityPlayer = 1;
    expect(matchStatus(game).state).toBe("opponent");
  });

  it("prioritizes mandatory choices and damage over the underlying reaction chain", () => {
    const game = createCombatFixture();
    game.currentPlayer = 1;
    game.priorityPlayer = 0;
    expect(matchStatus(game).label).toBe("Choose a damage target");
    game.phase = "choice";
    expect(matchStatus(game).label).toBe("Choose an effect");
  });

  it("keeps a paused or resolving final frame distinct from a completed match", () => {
    const game = opening().final;
    game.winner = 0;
    game.phase = "ended";
    expect(matchStatus(game).state).toBe("ended");
    expect(matchStatus(game, { reviewing: true }).state).toBe("resolving");
    expect(matchStatus(game, { paused: true, reviewing: true }).state).toBe(
      "paused",
    );
  });
});
