import { describe, expect, it } from "vitest";
import type { Review } from "../src/components/StepFlow";
import { applyAction, createGame, getLegalActions } from "../src/game/engine";
import { getAutomaticAction } from "../src/game/flow";
import { automaticDelay, reviewDelay } from "../src/game/presentation";
import { publicTableEvents } from "../src/game/event-presentation";
import { parseSession } from "../src/persistence";
import type { GameState } from "../src/game/types";
import { combatUnit, createCombatFixture } from "./fixtures/combat";
import {
  championArrivalReview,
  eventOpening,
  eventReview,
  spellEventReview,
} from "./fixtures/event-highlights";
import {
  motionCombatReview,
  motionScoreReview,
} from "./fixtures/significant-motion";

const duration = (review: Review) =>
  review.frames.reduce(
    (total, _, index) => total + reviewDelay({ ...review, index }),
    0,
  );

describe("responsive stack pacing", () => {
  it("resolves a real unanswered spell in under eight seconds without skipping an engine frame", () => {
    const played = spellEventReview("play");
    const untouched = structuredClone(played);
    let total = duration(played);
    let game = played.final;
    const reviews = [played];
    for (let step = 0; step < 2; step++) {
      const legal = getLegalActions(game, game.priorityPlayer);
      expect(legal.map((action) => action.category)).toEqual(["pass"]);
      const action = getAutomaticAction(game)!;
      expect(action).toEqual(legal[0]);
      total += automaticDelay(game, action.player, 1, action);
      const review = eventReview(game, action.id);
      expect(review.final).toEqual(applyAction(game, action));
      total += duration(review);
      reviews.push(review);
      game = review.final;
    }
    // This exact resolver path previously waited 15,650 ms at the normal speed.
    expect(total).toBe(7670);
    expect(total).toBeLessThan(15650 / 2);
    expect(game.stack).toHaveLength(0);
    expect(game.units.find((unit) => unit.id === "qa-target")!.damage).toBe(3);
    expect(played).toEqual(untouched);
    for (const review of reviews) {
      const restored = parseSession(
        JSON.stringify({ match: review.final, review, paused: true }),
      );
      expect(restored.review).toEqual(review);
    }
  });

  it("lets the public card enter once and advances priority-only frames promptly", () => {
    const review = spellEventReview("play");
    expect(reviewDelay(review)).toBe(1900);
    expect(reviewDelay({ ...review, index: 1 })).toBe(450);
    expect(reviewDelay({ ...review, index: 2 })).toBe(240);
    const passed = eventReview(review.final, "pass");
    expect(passed.frames).toHaveLength(2);
    expect(
      passed.frames.every(
        (_, index) => publicTableEvents({ ...passed, index }).length === 0,
      ),
    ).toBe(true);
    expect(duration(passed)).toBe(480);
  });

  it("scales forced passes with playback speed and retains deliberate bot actions", () => {
    const game = spellEventReview("play").final;
    const forced = getAutomaticAction(game)!;
    for (const speed of [0.5, 1, 2] as const) {
      expect(automaticDelay(game, 0, speed, forced)).toBe(280 / speed);
      const botState = applyAction(game, forced);
      const botPass = getAutomaticAction(botState)!;
      expect(botPass.category).toBe("pass");
      expect(automaticDelay(botState, 1, speed, botPass)).toBe(280 / speed);
      const botBefore = eventOpening(1);
      botBefore.players[1].hand = ["ogn-009-298"];
      botBefore.units = [combatUnit("pacing-bot-target", 0, 8)];
      const botPlay = eventReview(
        botBefore,
        (action) => action.category === "play" && action.sourceId === "hand:0",
      ).action;
      expect(automaticDelay(botBefore, 1, speed, botPlay)).toBe(
        Math.round(1050 / speed),
      );
    }
  });

  it.each(["damage", "buff", "counter"] as const)(
    "keeps %s resolution readable and removes repeated cleanup waits",
    (mode) => {
      const review = spellEventReview(mode);
      for (let index = 0; index < review.frames.length; index++) {
        const shown = { ...review, index };
        const events = publicTableEvents(shown);
        if (
          events.some((event) =>
            ["damage", "buff", "counter"].includes(event.kind),
          )
        )
          expect(reviewDelay(shown)).toBe(1900);
        if (!events.length) expect(reviewDelay(shown)).toBe(240);
        if (review.frames[index].draw) expect(reviewDelay(shown)).toBe(4400);
      }
    },
  );

  it("preserves signature, points and combat impact timing from real resolver events", () => {
    const cases: [Review, string, number][] = [
      [championArrivalReview(), "champion", 3000],
      [motionScoreReview("hold"), "score", 3400],
      [motionScoreReview("conquer"), "score", 3400],
      [motionCombatReview(), "combat", 2200],
    ];
    for (const [review, kind, expected] of cases) {
      const index = review.frames.findIndex((frame, index) =>
        kind === "combat"
          ? frame.combat?.stage === "impact"
          : publicTableEvents({ ...review, index }).some(
              (event) => event.kind === kind,
            ),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      expect(reviewDelay({ ...review, index })).toBe(expected);
    }
  });

  it("bases pacing on displayed public changes without peeking at future frames or private faces", () => {
    const review = spellEventReview("play");
    const expected = reviewDelay(review);
    const privateChanged = structuredClone(review);
    privateChanged.before.players[1].hand = ["ogn-083-298"];
    privateChanged.frames[0].state.players[1].hand = ["ogn-088-298"];
    privateChanged.before.hidden = [
      {
        id: "private-face",
        owner: 1,
        cardId: "ogn-083-298",
        location: "field:0",
        hiddenTurn: 0,
      },
    ];
    privateChanged.frames[0].state.hidden = [
      {
        ...privateChanged.before.hidden[0],
        cardId: "ogn-097-298",
      },
    ];
    privateChanged.final.winner = 1;
    privateChanged.frames[1].state.players[0].points = 8;
    expect(reviewDelay(privateChanged)).toBe(expected);
    const first = eventReview(review.final, "pass");
    const slowerFuture = structuredClone(first);
    slowerFuture.final.winner = 0;
    slowerFuture.frames[1].draw = { player: 0, count: 3 };
    expect(reviewDelay(slowerFuture)).toBe(reviewDelay(first));
  });
});

function reaction(kind: "hand" | "hidden" | "board" | "legend") {
  const game = spellEventReview("play").final;
  game.currentPlayer = 1;
  if (kind === "hand") game.players[0].hand = ["ogn-064-298"];
  if (kind === "hidden") {
    game.fields[0].controller = 0;
    game.hidden = [
      {
        id: "pacing-hidden",
        owner: 0,
        cardId: "ogn-083-298",
        location: "field:0",
        hiddenTurn: game.turn - 1,
      },
    ];
  }
  if (kind === "board")
    game.gears = [
      {
        id: "pacing-gear",
        owner: 0,
        cardId: "ogn-040-298",
        ready: true,
      },
    ];
  if (kind === "legend") {
    game.players[0].legendId = "ogn-247-298";
    game.players[0].legendUsedTurn = -1;
  }
  return game;
}

describe("fast pacing preserves human decisions", () => {
  it.each(["hand", "hidden", "board", "legend"] as const)(
    "waits indefinitely for a real %s reaction",
    (kind) => {
      const game = reaction(kind);
      const legal = getLegalActions(game, 0);
      const source =
        kind === "hand"
          ? "hand:0"
          : kind === "hidden"
            ? "hidden:pacing-hidden"
            : kind === "board"
              ? "pacing-gear"
              : "legend";
      expect(legal.some((action) => action.sourceId === source)).toBe(true);
      expect(legal.some((action) => action.category === "pass")).toBe(true);
      expect(getAutomaticAction(game)).toBeUndefined();
      expect(getLegalActions(game, 0)).toEqual(legal);
    },
  );

  it("keeps mulligan, damage, movement, triggered choices and End turn under human control", () => {
    const move = eventOpening();
    move.units = [
      {
        ...combatUnit("pacing-mover", 0),
        location: "base:0",
        ready: true,
      },
    ];
    const moving = applyAction(move, "move-start:pacing-mover:field:0");
    const triggered = eventOpening();
    triggered.fields[0].controller = 0;
    triggered.units = [combatUnit("pacing-choice-target", 1)];
    triggered.hidden = [
      {
        id: "pacing-fae",
        owner: 0,
        cardId: "ogn-097-298",
        location: "field:0",
        hiddenTurn: triggered.turn - 1,
      },
    ];
    const play = getLegalActions(triggered, 0).find(
      (action) => action.sourceId === "hidden:pacing-fae",
    )!;
    const choosing = applyAction(triggered, play);
    expect(choosing.pendingChoice?.kind).toBe("trigger");
    const endOnly = eventOpening();
    endOnly.players[0].championAvailable = false;
    endOnly.players[0].runes = [];
    endOnly.players[0].energy = 0;
    const decisions: [string, GameState][] = [
      ["opening", createGame({ seed: 44, firstPlayer: 0 })],
      ["damage", createCombatFixture()],
      ["movement", moving],
      ["choice", choosing],
      ["end", endOnly],
    ];
    for (const [kind, game] of decisions) {
      const before = structuredClone(game);
      expect(getLegalActions(game, 0).length, kind).toBeGreaterThan(0);
      expect(getAutomaticAction(game), kind).toBeUndefined();
      expect(game).toEqual(before);
    }
    expect(
      getLegalActions(endOnly, 0).map((action) => action.category),
    ).toEqual(["end"]);
  });
});
