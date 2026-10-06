import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import type { GameState } from "../src/game/types";
import type { Review } from "../src/components/StepFlow";
import { scoreMoment, phaseMoment } from "../src/game/table-presentation";
import { reviewDelay } from "../src/game/presentation";
import { ScoreTrack, TableMoment } from "../src/components/TableMoments";
import { parseSession } from "../src/persistence";
import { combatUnit } from "./fixtures/combat";
import {
  battlefieldChoices,
  defaultBattlefield,
} from "../src/game/battlefield-selection";
import { decks } from "../src/data/decks";

function main() {
  const game = applyAction(
    applyAction(createGame({ seed: 44 }), "mulligan:"),
    "mulligan:",
  );
  game.players[0].legendId = "ogs-009-024";
  game.players[1].legendId = "ogs-009-024";
  game.fields[0].cardId = "ogn-279-298";
  return game;
}
function reviewAction(before: GameState, id: string): Review {
  const action = getLegalActions(before, before.priorityPlayer).find(
    (a) => a.id === id,
  )!;
  expect(action, id).toBeDefined();
  const result = applyActionStepped(before, action);
  expect(result.state).toEqual(applyAction(before, action));
  return {
    before,
    final: result.state,
    frames: result.frames,
    action,
    index: 0,
  };
}
function conquer(points = 0) {
  let game = main();
  game.players[0].points = points;
  game.units = [{ ...combatUnit("mover", 0), location: "base:0", ready: true }];
  game = applyAction(game, "move-start:mover:field:0");
  let review = reviewAction(game, "move-confirm");
  for (let i = 0; i < 6 && !review.frames.some((f) => f.score || f.draw); i++) {
    review = reviewAction(review.final, "pass");
  }
  return review;
}
function hold(points = 0) {
  const game = main();
  game.players[1].points = points;
  game.units = [combatUnit("holder", 1)];
  game.fields[0].controller = 1;
  return reviewAction(game, "end-turn");
}

describe("table moments follow the displayed rules event", () => {
  it("presents each A B C D transition once, with a visible personal draw", () => {
    const before = applyAction(createGame({ seed: 44 }), "mulligan:");
    const review = reviewAction(before, "mulligan:");
    const phases = review.frames.flatMap(
      (_, index) => phaseMoment({ ...review, index }) ?? [],
    );
    expect(phases).toEqual(["awaken", "beginning", "channel", "draw"]);
    const index = review.frames.findIndex((f) => f.draw?.player === 0);
    const frame = review.frames[index];
    expect(frame.draw?.cardIds).toEqual(frame.state.players[0].hand.slice(-1));
    const markup = renderToStaticMarkup(
      createElement(TableMoment, {
        game: frame.state,
        review: { ...review, index },
        inspect: () => {},
      }),
    );
    expect(markup).toContain("moment-letter");
    expect(markup).toContain("Drawn card:");
    expect(reviewDelay({ ...review, index })).toBeGreaterThanOrEqual(4000);
  });
  it("records a conquer on its battlefield without showing a later score early", () => {
    const review = conquer();
    review.frames.unshift({ state: review.before, label: "Before scoring" });
    const index = review.frames.findIndex((f) => f.score);
    expect(index).toBeGreaterThan(0);
    expect(scoreMoment({ ...review, index: index - 1 })).toBeUndefined();
    expect(scoreMoment({ ...review, index })).toMatchObject({
      player: 0,
      kind: "conquer",
      from: 0,
      to: 1,
      fieldId: "field:0",
    });
    expect(scoreMoment({ ...review, index: index + 1 })).toBeUndefined();
    expect(reviewDelay({ ...review, index })).toBeGreaterThanOrEqual(3000);
  });
  it("presents holding points before channel and keeps opponent draw identities private", () => {
    const review = hold();
    const index = review.frames.findIndex((f) => f.score);
    expect(review.frames[index].score).toMatchObject({
      player: 1,
      kind: "hold",
      from: 0,
      to: 1,
    });
    const channel = review.frames.findIndex(
      (f) => f.state.turnStep === "channel",
    );
    expect(index).toBeLessThan(channel);
    const draw = review.frames.findIndex((f) => f.draw?.player === 1);
    expect(review.frames[draw].draw).not.toHaveProperty("cardIds");
    // Defence in depth: even a crafted frame cannot render opponent faces.
    review.frames[draw].draw!.cardIds = ["ogn-004-298"];
    const html = renderToStaticMarkup(
      createElement(TableMoment, {
        game: review.frames[draw].state,
        review: { ...review, index: draw },
        inspect: () => {},
      }),
    );
    expect(html).toContain("moment-card-back");
    expect(html).not.toContain("ogn-004-298");
    expect(html).not.toContain("Drawn card:");
  });
  it("shows the final-point replacement as a draw without moving the token", () => {
    const review = conquer(7);
    expect(review.frames.some((f) => f.score)).toBe(false);
    const index = review.frames.findIndex((f) => f.draw);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(review.final.players[0].points).toBe(7);
    const html = renderToStaticMarkup(
      createElement(TableMoment, {
        game: review.frames[index].state,
        review: { ...review, index },
        inspect: () => {},
      }),
    );
    expect(html).toContain("Draw instead of the final point");
  });
  it("animates a winning hold before announcing the winner", () => {
    const review = hold(7);
    const index = review.frames.findIndex((f) => f.score);
    expect(review.frames[index].score).toMatchObject({
      from: 7,
      to: 8,
      kind: "hold",
    });
    expect(review.frames[index].state.winner).toBeNull();
    expect(review.final.winner).toBe(1);
    const html = renderToStaticMarkup(
      createElement(ScoreTrack, {
        game: review.frames[index].state,
        review: { ...review, index },
      }),
    );
    expect(html).toContain("--token-from:12.5%");
    expect(html).toContain("--token-to:0%");
  });
  it("restores presentation metadata and rejects invalid or private draw metadata", () => {
    const review = conquer();
    const stored = { match: review.final, review };
    expect(parseSession(JSON.stringify(stored)).review?.frames).toEqual(
      review.frames,
    );
    const corrupt = structuredClone(stored);
    corrupt.review.frames[0].draw = {
      player: 1,
      count: 1,
      cardIds: ["ogn-004-298"],
    };
    expect(parseSession(JSON.stringify(corrupt)).review).toBeNull();
    const malformed = structuredClone(stored);
    malformed.review.frames[0].score = {
      player: 0,
      from: 0,
      to: -1,
      kind: "effect",
    };
    expect(parseSession(JSON.stringify(malformed)).review).toBeNull();
  });
});

describe("battlefield selection", () => {
  it("uses both explicit choices without modifying the original decks or changing the shuffle", () => {
    const before = JSON.stringify(decks);
    const random = createGame({
      seed: 444,
      playerDeckId: "precon-jinx",
      botDeckId: "precon-vex",
    });
    const chosen = createGame({
      seed: 444,
      playerDeckId: "precon-jinx",
      botDeckId: "precon-vex",
      playerBattlefieldId: "ogn-276-298",
      botBattlefieldId: "ogn-280-298",
    });
    expect(chosen.fields.map((f) => f.cardId)).toEqual([
      "ogn-276-298",
      "ogn-280-298",
    ]);
    expect(chosen.players.map((p) => p.hand)).toEqual(
      random.players.map((p) => p.hand),
    );
    expect(JSON.stringify(decks)).toBe(before);
    expect(
      renderToStaticMarkup(
        createElement(ScoreTrack, { game: chosen, review: null }),
      ),
    ).toContain("first to 9");
  });
  it("only offers playable battlefields and rejects a non-battlefield override", () => {
    expect(battlefieldChoices.length).toBeGreaterThan(20);
    expect(new Set(battlefieldChoices.map((card) => card.name)).size).toBe(
      battlefieldChoices.length,
    );
    for (const deck of decks)
      expect(
        battlefieldChoices.some((card) => card.id === defaultBattlefield(deck)),
      ).toBe(true);
    expect(() => createGame({ playerBattlefieldId: "ogn-004-298" })).toThrow(
      "supported battlefield",
    );
    for (const card of battlefieldChoices) {
      expect(
        createGame({ playerBattlefieldId: card.id }).fields[0].cardId,
      ).toBeTruthy();
    }
  });
});
