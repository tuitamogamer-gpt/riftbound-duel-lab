import { describe, expect, it } from "vitest";
import type { Review } from "../src/components/StepFlow";
import { applyAction } from "../src/game/engine";
import {
  audioCueForReview,
  audioFrameKey,
  AudioFrameTracker,
} from "../src/audio/events";
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
} from "./fixtures/significant-motion";

const at = (review: Review, index: number): Review => ({ ...review, index });
const cues = (review: Review) =>
  review.frames.flatMap((_, index) => {
    const cue = audioCueForReview(at(review, index));
    return cue ? [cue] : [];
  });
const championFrame = () => {
  const review = championArrivalReview();
  return at(
    review,
    review.frames.findIndex((_, index) => audioCueForReview(at(review, index))),
  );
};

describe("game audio follows the displayed public moment", () => {
  it.each([0, 1] as const)(
    "announces player %i's signature only at its actual arrival",
    (player) => {
      const review = championArrivalReview(player);
      expect(cues(review)).toEqual([
        expect.objectContaining({ kind: "champion", voice: "champion" }),
      ]);
      expect(audioCueForReview(review)).toBeNull();
    },
  );

  it("announces battle once for a contested movement, with no battle for an empty field", () => {
    const game = eventOpening();
    game.fields[0].cardId = "ogn-279-298";
    game.units = [
      { ...combatUnit("audio-mover", 0), location: "base:0", ready: true },
      combatUnit("audio-defender", 1),
    ];
    const before = applyAction(game, "move-start:audio-mover:field:0");
    const review = eventReview(before, "move-confirm");
    expect(cues(review).filter((cue) => cue.kind === "battle")).toEqual([
      expect.objectContaining({ voice: "battle" }),
    ]);
    expect(cues(motionScoreReview("conquer"))).toEqual([
      expect.objectContaining({ kind: "score" }),
    ]);
  });

  it("plays impact once while keeping damage assignment and duplicate saved metadata quiet", () => {
    const review = motionCombatReview();
    const impact = review.frames.findIndex(
      (frame) => frame.combat?.stage === "impact",
    );
    expect(cues(review)).toEqual([expect.objectContaining({ kind: "impact" })]);
    review.frames.splice(impact + 1, 0, structuredClone(review.frames[impact]));
    expect(audioCueForReview(at(review, impact + 1))).toBeNull();
    expect(cues(review)).toHaveLength(1);
  });

  it("plays a counter only after its target leaves the real chain", () => {
    const review = spellEventReview("counter");
    const counter = review.frames.findIndex(
      (_, index) => audioCueForReview(at(review, index))?.kind === "counter",
    );
    expect(counter).toBeGreaterThan(0);
    const target = review.frames[counter].effect!.targetId;
    expect(
      review.frames[counter - 1].state.stack.some((s) => s.id === target),
    ).toBe(true);
    expect(
      review.frames[counter].state.stack.some((s) => s.id === target),
    ).toBe(false);
    expect(cues(review)).toEqual([
      expect.objectContaining({ kind: "counter" }),
    ]);
  });

  it("does not repeat a point cue for unchanged score metadata in a saved frame", () => {
    const review = motionScoreReview("hold");
    const score = review.frames.findIndex((frame) => frame.score);
    expect(score).toBeGreaterThanOrEqual(0);
    review.frames.splice(score + 1, 0, structuredClone(review.frames[score]));
    expect(audioCueForReview(at(review, score))?.kind).toBe("score");
    expect(audioCueForReview(at(review, score + 1))).toBeNull();
  });

  it("distinguishes the actual loss from the preceding point and never reads a future winner", () => {
    const review = motionScoreReview("hold", 7);
    expect(cues(review).map((cue) => cue.kind)).toEqual(["score", "defeat"]);
    const winner = review.frames.findIndex(
      (frame) => frame.state.winner !== null,
    );
    expect(audioCueForReview(at(review, winner))).toMatchObject({
      kind: "defeat",
      voice: "defeat",
    });
    const early = at(review, 0);
    const expected = audioCueForReview(early);
    Object.defineProperty(early, "final", {
      get() {
        throw new Error("Future state must not be read by audio");
      },
    });
    expect(audioCueForReview(early)).toEqual(expected);
    const localVictory = at(structuredClone(review), winner);
    localVictory.frames[winner].state.winner = 0;
    expect(audioCueForReview(localVictory)).toMatchObject({
      kind: "victory",
      voice: "victory",
    });
  });

  it("keeps hidden identities, routine actions, phases and invalid frames silent", () => {
    for (const mode of [
      "hidden",
      "play",
      "damage",
      "phase",
      "draw",
      "rune",
    ] as const) {
      const review = createSignificantMotionSession(mode).review!;
      expect(audioCueForReview(review)).toBeNull();
    }
    const review = championFrame();
    for (const index of [-1, 0.5, review.frames.length]) {
      expect(audioCueForReview(at(review, index))).toBeNull();
      expect(audioFrameKey(at(review, index))).toBeNull();
    }
    expect(audioCueForReview(null)).toBeNull();
  });
});

describe("game audio frame consumption", () => {
  it("does not replay a restored paused or muted frame when it becomes audible", () => {
    const tracker = new AudioFrameTracker();
    const review = championFrame();
    expect(tracker.take(review, "duel-a", false)).toBeNull();
    expect(tracker.take(review, "duel-a", true)).toBeNull();
    expect(tracker.take(review, "duel-b", true)?.kind).toBe("champion");
  });

  it("does not replay a rerendered frame or earlier frame after navigating back and forward", () => {
    const tracker = new AudioFrameTracker();
    const review = motionScoreReview("hold", 7);
    const first = review.frames.findIndex(
      (_, index) => audioCueForReview(at(review, index))?.kind === "score",
    );
    const last = review.frames.findIndex(
      (_, index) => audioCueForReview(at(review, index))?.kind === "defeat",
    );
    expect(tracker.take(at(review, first), "duel", true)?.kind).toBe("score");
    expect(tracker.take(at(review, first), "duel", true)).toBeNull();
    expect(tracker.take(at(review, last), "duel", true)?.kind).toBe("defeat");
    expect(tracker.take(at(review, first), "duel", true)).toBeNull();
    expect(tracker.take(at(review, last), "duel", true)).toBeNull();
    expect(tracker.take(review, undefined, true)).toBeNull();
    expect(tracker.take(at(review, first), "duel", true)?.kind).toBe("score");
  });

  it("distinguishes repeated action names at different revisions", () => {
    const tracker = new AudioFrameTracker();
    const review = championFrame();
    const next = structuredClone(review);
    next.before.revision = (review.before.revision ?? 0) + 1;
    expect(audioFrameKey(next)).not.toBe(audioFrameKey(review));
    expect(tracker.take(review, "duel", true)?.kind).toBe("champion");
    expect(tracker.take(next, "duel", true)?.kind).toBe("champion");
  });
});
