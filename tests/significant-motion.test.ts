import { describe, expect, it } from "vitest";
import type { Review } from "../src/components/StepFlow";
import { applyAction, getLegalActions } from "../src/game/engine";
import { publicTableEvents } from "../src/game/event-presentation";
import { championMoment } from "../src/game/table-presentation";
import { significantMoment } from "../src/motion/significant-events";
import { parseSession } from "../src/persistence";
import { cards } from "../src/data/cards";
import { combatUnit } from "./fixtures/combat";
import {
  championArrivalReview,
  eventOpening,
  eventReview,
  spellEventReview,
} from "./fixtures/event-highlights";
import {
  createSignificantMotionSession,
  motionCombatReview,
  motionScoreReview,
  significantMotionModes,
} from "./fixtures/significant-motion";

const at = (review: Review, index: number): Review => ({ ...review, index });
const allMoments = (review: Review) =>
  review.frames.map((_, index) => significantMoment(at(review, index)));

describe("significant motion follows a displayed public result", () => {
  it.each([0, 1] as const)(
    "animates player %i's champion only after the real public entrance",
    (player) => {
      const review = championArrivalReview(player);
      const arrival = review.frames.findIndex((_, index) =>
        championMoment(at(review, index)),
      );
      expect(arrival).toBeGreaterThan(0);
      expect(allMoments(review).filter(Boolean)).toEqual([
        expect.objectContaining({ kind: "champion", player }),
      ]);
      for (let index = 0; index < arrival; index++)
        expect(significantMoment(at(review, index))).toBeNull();
    },
  );

  it.each(["conquer", "hold"] as const)(
    "celebrates the actual %s point once, with no future point before it",
    (kind) => {
      const review = motionScoreReview(kind);
      const scoreIndex = review.frames.findIndex((frame) => frame.score);
      expect(scoreIndex).toBeGreaterThanOrEqual(0);
      expect(review.frames[scoreIndex].score).toMatchObject({
        kind,
        from: 0,
        to: 1,
      });
      expect(allMoments(review).filter(Boolean)).toEqual([
        expect.objectContaining({
          kind: "conquer",
          player: kind === "hold" ? 1 : 0,
        }),
      ]);
      for (let index = 0; index < scoreIndex; index++)
        expect(significantMoment(at(review, index))).toBeNull();
    },
  );

  it("keeps the last-point draw replacement quiet instead of inventing a point", () => {
    const review = motionScoreReview("conquer", 7);
    expect(review.frames.some((frame) => frame.draw)).toBe(true);
    expect(review.frames.some((frame) => frame.score)).toBe(false);
    expect(review.final.players[0].points).toBe(7);
    expect(allMoments(review).filter(Boolean)).toEqual([]);
  });

  it("plays combat motion only on simultaneous impact, with assignment/result quiet", () => {
    const review = motionCombatReview();
    const impactIndex = review.frames.findIndex(
      (frame) => frame.combat?.stage === "impact",
    );
    const resultIndex = review.frames.findIndex(
      (frame) => frame.combat?.stage === "result",
    );
    expect(impactIndex).toBeGreaterThan(0);
    expect(resultIndex).toBeGreaterThan(impactIndex);
    expect(review.frames[impactIndex].state.units).toHaveLength(4);
    expect(allMoments(review).filter(Boolean)).toEqual([
      expect.objectContaining({ kind: "combat", player: 0 }),
    ]);
    expect(significantMoment(at(review, resultIndex))).toBeNull();
    for (let index = 0; index < impactIndex; index++)
      expect(significantMoment(at(review, index))).toBeNull();
  });

  it("does not replay identical saved impact metadata on an unchanged following frame", () => {
    const review = motionCombatReview();
    const impactIndex = review.frames.findIndex(
      (frame) => frame.combat?.stage === "impact",
    );
    review.frames.splice(
      impactIndex + 1,
      0,
      structuredClone(review.frames[impactIndex]),
    );
    expect(significantMoment(at(review, impactIndex))?.kind).toBe("combat");
    expect(significantMoment(at(review, impactIndex + 1))).toBeNull();
  });

  it("celebrates a counter once only when its real target leaves the chain", () => {
    const review = spellEventReview("counter");
    const counterIndex = review.frames.findIndex((_, index) =>
      publicTableEvents(at(review, index)).some(
        (event) => event.kind === "counter",
      ),
    );
    expect(counterIndex).toBeGreaterThan(0);
    const effect = review.frames[counterIndex].effect!;
    expect(effect.type).toBe("counter");
    expect(
      review.frames[counterIndex - 1].state.stack.some(
        (item) => item.id === effect.targetId,
      ),
    ).toBe(true);
    expect(
      review.frames[counterIndex].state.stack.some(
        (item) => item.id === effect.targetId,
      ),
    ).toBe(false);
    expect(allMoments(review).filter(Boolean)).toEqual([
      expect.objectContaining({ kind: "counter", player: 1 }),
    ]);
    expect(review.final.players[0].discard).toContain("ogn-198-298");
    expect(
      review.final.units.some(
        (unit) => unit.cardId === review.final.players[0].championId,
      ),
    ).toBe(false);
  });

  it("does not animate a real unsuccessful counter against an uncounterable spell", () => {
    const decree = cards.find((card) => card.riftboundId === "ven-015-166")!;
    expect(decree).toBeDefined();
    let game = eventOpening();
    game.units = [combatUnit("uncounterable-target", 1, 8, "ogn-049-298")];
    game.players[0].hand = [decree.id];
    game = applyAction(
      game,
      getLegalActions(game, 0).find((action) => action.cardId === decree.id)!,
    );
    const originalId = game.stack[0].id;
    game = applyAction(game, "pass");
    game.players[1].hand = ["ogn-064-298"];
    game = applyAction(
      game,
      getLegalActions(game, 1).find(
        (action) => action.cardId === "ogn-064-298",
      )!,
    );
    game = applyAction(game, "pass");
    const review = eventReview(game, "pass");
    const applied = review.frames.find(
      (frame) =>
        frame.effect?.type === "counter" && frame.effect.stage === "applied",
    );
    expect(applied).toBeDefined();
    expect(applied!.state.stack.some((item) => item.id === originalId)).toBe(
      true,
    );
    expect(allMoments(review).filter(Boolean)).toEqual([]);
    expect(review.final.stack.some((item) => item.id === originalId)).toBe(
      true,
    );
    expect(review.final.players[1].discard).toContain("ogn-064-298");
  });

  it("shows victory only at the winner transition, after the separately displayed point", () => {
    const review = motionScoreReview("hold", 7);
    const scoreIndex = review.frames.findIndex((frame) => frame.score);
    const winnerIndex = review.frames.findIndex(
      (frame) => frame.state.winner !== null,
    );
    expect(winnerIndex).toBeGreaterThan(scoreIndex);
    expect(significantMoment(at(review, scoreIndex))?.kind).toBe("conquer");
    expect(significantMoment(at(review, winnerIndex))).toMatchObject({
      kind: "victory",
      player: 1,
    });
    for (let index = 0; index < winnerIndex; index++)
      expect(significantMoment(at(review, index))?.kind).not.toBe("victory");
    review.frames.push({
      state: structuredClone(review.final),
      label: "Winner remains",
    });
    expect(significantMoment(at(review, review.frames.length - 1))).toBeNull();
  });

  it("restores old saved winner frames without metadata and never reads review.final", () => {
    const review = motionScoreReview("hold", 7);
    review.frames = review.frames.map(({ state, label }) => ({ state, label }));
    const winnerIndex = review.frames.findIndex(
      (frame) => frame.state.winner !== null,
    );
    review.index = winnerIndex;
    const restored = parseSession(
      JSON.stringify({ match: review.final, review, paused: true }),
    );
    expect(restored.review).not.toBeNull();
    expect(significantMoment(restored.review)).toMatchObject({
      kind: "victory",
      player: 1,
    });
    expect(significantMoment(at(review, winnerIndex - 1))?.kind).not.toBe(
      "victory",
    );
    const shown = at(review, 0);
    const before = significantMoment(shown);
    shown.final = structuredClone(shown.final);
    shown.final.winner = 0;
    shown.final.units.push({
      ...combatUnit("future-champion", 0),
      cardId: shown.final.players[0].championId,
    });
    expect(significantMoment(shown)).toEqual(before);
  });

  it("keeps routine phases, draw, runes, hidden faces, ordinary plays and damage quiet", () => {
    for (const mode of [
      "phase",
      "draw",
      "rune",
      "hidden",
      "play",
      "damage",
    ] as const) {
      const { review } = createSignificantMotionSession(mode);
      expect(review).not.toBeNull();
      expect(significantMoment(review)).toBeNull();
    }
    const hidden = createSignificantMotionSession("hidden").review!;
    expect(
      hidden.frames[hidden.index].state.hidden?.some(
        (card) => card.owner === 1,
      ),
    ).toBe(true);
    expect(JSON.stringify(publicTableEvents(hidden))).not.toContain(
      "ogn-097-298",
    );
  });

  it("does not treat a hidden champion face or copied token as a public entrance", () => {
    const review = championArrivalReview(1);
    const index = review.frames.findIndex((_, index) =>
      championMoment(at(review, index)),
    );
    const hidden = at(structuredClone(review), index);
    const state = hidden.frames[index].state;
    state.units = state.units.filter(
      (unit) => unit.cardId !== state.players[1].championId,
    );
    state.hidden = [
      {
        id: "private-champion",
        owner: 1,
        cardId: state.players[1].championId,
        location: "field:0",
        hiddenTurn: state.turn,
      },
    ];
    expect(significantMoment(hidden)).toBeNull();
    const copied = at(structuredClone(review), index);
    copied.frames[index].state.units.forEach((unit) => {
      unit.token = true;
    });
    expect(significantMoment(copied)).toBeNull();
  });

  it("rejects missing and invalid displayed indices without inspecting future events", () => {
    expect(significantMoment(null)).toBeNull();
    const review = championArrivalReview();
    for (const index of [-1, 0.5, NaN, review.frames.length])
      expect(significantMoment(at(review, index))).toBeNull();
  });
});

describe("isolated significant-motion browser sessions", () => {
  it.each(significantMotionModes)(
    "deterministically restores the actual %s frame without changing legal actions",
    (mode) => {
      const session = createSignificantMotionSession(mode);
      expect(createSignificantMotionSession(mode)).toEqual(session);
      const restored = parseSession(JSON.stringify(session));
      expect(restored.match).toEqual(JSON.parse(JSON.stringify(session.match)));
      expect(restored.review).toEqual(
        JSON.parse(JSON.stringify(session.review)),
      );
      expect(restored.paused).toBe(true);
      expect(significantMoment(restored.review)).toEqual(
        significantMoment(session.review),
      );
      expect(
        getLegalActions(restored.match!, restored.match!.priorityPlayer),
      ).toEqual(getLegalActions(session.match!, session.match!.priorityPlayer));
      expect(session.review!.final).toEqual(
        applyAction(session.review!.before, session.review!.action),
      );
    },
  );
});
