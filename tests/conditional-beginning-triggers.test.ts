import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameAction,
  type GameState,
} from "../src/game/engine";
import { getAutomaticAction } from "../src/game/flow";
import { reviewDelay } from "../src/game/presentation";
import { getActionStackView } from "../src/game/stack-presentation";
import { parseSession } from "../src/persistence";
import { combatUnit } from "./fixtures/combat";
import { eventReview } from "./fixtures/event-highlights";

// Current Core Rules (9 October 2026), 383.2.a.1 explicitly distinguishes
// Loose Cannon's effect condition from a trigger's immediately following "if".
// https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/5c7946f7c3b8c6e0faff85ab6dadc6d2e721ea94.pdf
const jinx = "ogn-251-298";
const pouch = "ogn-101-298";

function opening(legend = "precon-jinx") {
  const game = applyAction(
    applyAction(
      createGame({
        playerDeckId: "precon-viktor",
        botDeckId: legend,
        seed: 22,
      }),
      "mulligan:",
    ),
    "mulligan:",
  );
  // Existing runes from a later turn let the incoming player react during
  // Beginning, before this turn's Channel step has happened.
  game.players[1].hasBegun = true;
  game.players[1].runes = [
    { id: "beginning-rune-1", domain: "Calm", ready: true },
    { id: "beginning-rune-2", domain: "Mind", ready: true },
  ];
  return game;
}

function take(game: GameState, match: string | ((a: GameAction) => boolean)) {
  const action = getLegalActions(game, game.priorityPlayer).find(
    typeof match === "string" ? (a) => a.id === match : match,
  );
  expect(action, `Missing ${String(match)} in ${game.phase}`).toBeDefined();
  return applyAction(game, action!);
}

function settle(game: GameState) {
  for (let step = 0; step < 30 && game.stack.length; step++)
    game = take(game, "pass");
  expect(game.stack).toHaveLength(0);
  expect(game.pendingChoice).toBeNull();
  return game;
}

function hiddenCard(game: GameState, owner: 0 | 1 = 1) {
  game.fields[0].controller = owner;
  game.units = [combatUnit("hidden-holder", owner, 8)];
  game.hidden = [
    {
      id: "beginning-hidden",
      owner,
      cardId: "ogn-083-298",
      location: "field:0",
      hiddenTurn: 0,
    },
  ];
}

describe("Jinx's conditional draw preserves the real reaction window", () => {
  it("still enters the chain with a full hand and resolves without an extra draw", () => {
    const game = opening();
    const before = game.players[1].hand.length;
    const pending = take(game, "end-turn");
    expect(pending.stack).toMatchObject([
      { cardId: jinx, sourceId: "legend", kind: "trigger" },
    ]);
    expect(pending.turnStep).toBe("beginning");
    expect(pending.pendingBeginning).toBe(1);
    expect(settle(pending).players[1].hand).toHaveLength(before + 1);
  });

  it.each([0, 1])(
    "draws the bonus before the normal draw with %i cards",
    (count) => {
      const game = opening();
      game.players[1].discard.push(...game.players[1].hand.splice(count));
      const resolved = settle(take(game, "end-turn"));
      expect(resolved.players[1].hand).toHaveLength(count + 2);
      expect(resolved.turnStep).toBe("main");
      expect(resolved.pendingBeginning).toBeUndefined();
    },
  );

  it("allows a response to reduce a two-card hand before Jinx checks it", () => {
    const game = opening();
    game.players[1].hand = ["ogn-133-298", "ogn-049-298"];
    let pending = take(game, "end-turn");
    pending = take(pending, (action) => action.cardId === "ogn-133-298");
    expect(pending.players[1].hand).toHaveLength(1);
    expect(pending.stack.map((item) => item.cardId)).toEqual([
      jinx,
      "ogn-133-298",
    ]);
    const done = settle(pending);
    expect(done.players[1].hand).toHaveLength(3);
    expect(done.players[1].discard).toContain("ogn-133-298");
  });

  it("rechecks the hand after a Hidden reaction draws above the threshold", () => {
    const game = opening();
    game.players[1].discard.push(...game.players[1].hand.splice(1));
    hiddenCard(game);
    let pending = take(game, "end-turn");
    pending = take(
      pending,
      (action) => action.sourceId === "hidden:beginning-hidden",
    );
    expect(pending.hidden).toEqual([]);
    const done = settle(pending);
    // One original card, two from Consult the Past, one normal turn draw.
    expect(done.players[1].hand).toHaveLength(4);
  });

  it("does not automatically pass an available human reaction to Jinx", () => {
    const game = opening();
    game.players[0].hand = ["ogn-133-298"];
    game.players[0].runes = [
      { id: "human-reaction-rune", domain: "Fury", ready: true },
    ];
    const pending = take(take(game, "end-turn"), "pass");
    expect(pending.priorityPlayer).toBe(0);
    expect(
      getLegalActions(pending, 0).some(
        (action) => action.cardId === "ogn-133-298",
      ),
    ).toBe(true);
    expect(getAutomaticAction(pending)).toBeUndefined();
  });
});

describe("completed Beginning triggers leave the visual stack", () => {
  it.each([1, 4])(
    "removes Jinx before Channel and the normal Draw with %i cards",
    (count) => {
      const game = opening();
      game.players[1].discard.push(...game.players[1].hand.splice(count));
      const pending = take(take(game, "end-turn"), "pass");
      const review = eventReview(pending, "pass");
      for (const [index, frame] of review.frames.entries()) {
        const view = getActionStackView(review.final, { ...review, index });
        if (frame.state.turnStep === "beginning")
          expect(view?.cards.some((card) => card.card.id === jinx)).toBe(true);
        else expect(view).toBeNull();
      }
      expect(
        review.frames.some((frame) => frame.state.turnStep === "channel"),
      ).toBe(true);
      expect(
        review.frames.some((frame) => frame.state.turnStep === "draw"),
      ).toBe(true);
    },
  );

  it("briefly shows an actual empty resolution without predicting future or private cards", () => {
    const pending = take(take(opening(), "end-turn"), "pass");
    const review = eventReview(pending, "pass");
    expect(review.frames[0].effect?.stage).toBe("resolving");
    expect(reviewDelay(review)).toBe(450);
    expect(reviewDelay(review, 2)).toBe(225);
    const altered = structuredClone(review);
    altered.final.players[1].hand = [];
    altered.frames[1].state.players[1].hand = [];
    altered.frames[0].state.players[1].hand = Array(4).fill("ogn-064-298");
    expect(reviewDelay(altered)).toBe(450);
    // Imported/recovered reviews can retain a public printing identity.
    for (const printing of ["ogn-301*-298", "ogn-301-298"]) {
      altered.frames[0].effect!.cardId = printing;
      expect(reviewDelay(altered)).toBe(450);
    }
    expect(
      parseSession(
        JSON.stringify({ match: review.final, review, paused: true }),
      ).review,
    ).toEqual(review);
    const drawing = opening();
    drawing.players[1].hand = [];
    const actualDraw = eventReview(
      take(take(drawing, "end-turn"), "pass"),
      "pass",
    );
    expect(reviewDelay(actualDraw)).toBe(1900);
    const drawIndex = actualDraw.frames.findIndex((frame) => frame.draw);
    expect(reviewDelay({ ...actualDraw, index: drawIndex })).toBe(2800);
  });

  it("preserves Annie's unconditional end trigger even when all her runes are ready", () => {
    const game = opening("precon-viktor");
    game.players[0].legendId = "ogs-017-024";
    const pending = take(game, "end-turn");
    expect(pending.stack).toMatchObject([
      { cardId: "ogs-017-024", kind: "trigger" },
    ]);
    const review = eventReview(take(pending, "pass"), "pass");
    expect(review.frames[0].effect?.stage).toBe("resolving");
    expect(reviewDelay(review)).toBe(1900);
  });
});

describe("Mushroom Pouch checks and freezes its trigger condition", () => {
  it.each(["none", "opponent"])(
    "does not enter the chain with %s Hidden cards",
    (hidden) => {
      const game = opening("precon-viktor");
      game.gears = [{ id: "pouch", cardId: pouch, owner: 1, ready: true }];
      if (hidden === "opponent") hiddenCard(game, 0);
      const before = game.players[1].hand.length;
      const done = take(game, "end-turn");
      expect(done.stack).toHaveLength(0);
      expect(done.players[1].hand).toHaveLength(before + 1);
      expect(done.turnStep).toBe("main");
    },
  );

  it("keeps its qualified draw when the Hidden card is revealed in response", () => {
    const game = opening("precon-viktor");
    game.gears = [{ id: "pouch", cardId: pouch, owner: 1, ready: true }];
    hiddenCard(game);
    const before = game.players[1].hand.length;
    let pending = take(game, "end-turn");
    expect(pending.stack).toMatchObject([{ cardId: pouch, kind: "trigger" }]);
    pending = take(
      pending,
      (action) => action.sourceId === "hidden:beginning-hidden",
    );
    expect(pending.hidden).toEqual([]);
    pending = parseSession(
      JSON.stringify({ match: pending, review: null }),
    ).match!;
    const done = settle(pending);
    // Two from the response, one qualified Pouch draw, one normal turn draw.
    expect(done.players[1].hand).toHaveLength(before + 4);
  });
});
