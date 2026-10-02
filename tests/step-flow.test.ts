import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getHighlights,
  StepFlow,
  type Review,
} from "../src/components/StepFlow";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { getCard } from "../src/data/cards";
import type {
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "../src/game/types";

const piece = (
  id: string,
  owner: PlayerId,
  location: LocationId,
  cardId = "ogn-175-298",
): Unit => ({
  id,
  owner,
  location,
  cardId,
  ready: true,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
});
const idleAction: GameAction = {
  id: "pass",
  label: "Pass",
  category: "pass",
  player: 0,
};
const reviewFor = (
  before: GameState,
  now: GameState,
  action = idleAction,
): Review => ({
  before,
  final: now,
  frames: [{ state: now, label: "Visible effect" }],
  index: 0,
  action,
});

describe("manual step highlight selection", () => {
  it("highlights both Challenge targets before their damage changes", () => {
    const before = createGame({ seed: 1 });
    before.units = [piece("ally", 0, "base:0"), piece("enemy", 1, "field:1")];
    const h = getHighlights(
      reviewFor(before, structuredClone(before), {
        ...idleAction,
        targetId: "ally~enemy",
      }),
    );
    expect([...h.units]).toEqual(["ally", "enemy"]);
    expect(h.fields.has("base:0")).toBe(true);
    expect(h.fields.has("field:1")).toBe(true);
  });

  it("highlights a targeted battlefield even when it is empty", () => {
    const before = createGame({ seed: 1 });
    const h = getHighlights(
      reviewFor(before, structuredClone(before), {
        ...idleAction,
        targetId: "field:0",
      }),
    );
    expect(h.fields.has("field:0")).toBe(true);
    expect(h.units.has("field:0")).toBe(false);
  });

  it("highlights every selected mover and both origin and destination", () => {
    const before = createGame({ seed: 1 });
    before.units = [piece("one", 0, "base:0"), piece("two", 0, "base:0")];
    const h = getHighlights(
      reviewFor(before, structuredClone(before), {
        ...idleAction,
        unitIds: ["one", "two"],
        locationId: "field:0",
      }),
    );
    expect(h.units.has("one")).toBe(true);
    expect(h.units.has("two")).toBe(true);
    expect(h.fields.has("base:0")).toBe(true);
    expect(h.fields.has("field:0")).toBe(true);
  });

  it("highlights changing Might when combat status changes without mutating unit records", () => {
    const before = createGame({ seed: 1 });
    before.units = [
      piece("assault", 0, "field:0", "ogn-210-298"),
      piece("defender", 1, "field:0"),
    ];
    const now = structuredClone(before);
    now.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    const h = getHighlights(reviewFor(before, now));
    expect(h.units.has("assault")).toBe(true);
    expect(h.fields.has("field:0")).toBe(true);
  });

  it("compares each frame to its immediate predecessor", () => {
    const before = createGame({ seed: 1 });
    before.units = [piece("one", 0, "base:0"), piece("two", 0, "base:0")];
    const first = structuredClone(before);
    first.units[0].buff = 1;
    const second = structuredClone(first);
    second.units[1].buff = 1;
    const review: Review = {
      before,
      final: second,
      frames: [
        { state: first, label: "First" },
        { state: second, label: "Second" },
      ],
      index: 1,
      action: idleAction,
    };
    const h = getHighlights(review);
    expect(h.units.has("one")).toBe(false);
    expect(h.units.has("two")).toBe(true);
  });

  it("highlights hand replacement even when card count does not change without exposing AI identities", () => {
    const before = createGame({ seed: 1 });
    before.players[1].hand = ["ogn-114-298", "ogn-088-298"];
    const now = structuredClone(before);
    now.players[1].hand = ["ogn-096-298", "ogn-210-298"];
    const h = getHighlights(reviewFor(before, now));
    expect(h.players.has(1)).toBe(true);
    expect(h.newCards.size).toBe(0);
    expect(h.changes.join(" ")).toContain("AI: promjena karata u ruci");
    for (const id of [...before.players[1].hand, ...now.players[1].hand])
      expect(h.changes.join(" ")).not.toContain(getCard(id).name);
  });

  it("highlights the resolved stack item target when the user action is Pass", () => {
    const before = createGame({ seed: 1 });
    before.units = [piece("target", 1, "field:0")];
    before.stack = [
      {
        id: "s1",
        player: 0,
        cardId: "ogs-003-024",
        targetId: "target",
        effects: [],
        kind: "spell",
      },
    ];
    const now = structuredClone(before);
    now.stack = [];
    const h = getHighlights(reviewFor(before, now));
    expect(h.units.has("target")).toBe(true);
    expect(h.fields.has("field:0")).toBe(true);
  });

  it("records removed units and highlights their former location", () => {
    const before = createGame({ seed: 1 });
    before.units = [piece("removed", 1, "field:1")];
    const now = structuredClone(before);
    now.units = [];
    const h = getHighlights(reviewFor(before, now));
    expect(h.removed.map((u) => u.id)).toEqual(["removed"]);
    expect(h.fields.has("field:1")).toBe(true);
    expect(h.changes).toContain("Uklonjeno s table: 1.");
  });

  it("handles invalid frame indices without throwing during save recovery", () => {
    const state = createGame({ seed: 1 });
    for (const index of [-1, 2, Number.NaN]) {
      const review = { ...reviewFor(state, state), index };
      expect(() => getHighlights(review)).not.toThrow();
      expect(getHighlights(review).units.size).toBe(0);
    }
  });
});

describe("step review persistence and presentation boundaries", () => {
  it("preserves the exact pending frame, labels, highlights, and final action state after JSON reload", () => {
    const before = applyAction(createGame({ seed: 44 }), "mulligan:");
    const selected = getLegalActions(before, 1).find(
      (a) => a.id === "mulligan:",
    )!;
    const result = applyActionStepped(before, selected);
    const review: Review = {
      before,
      final: result.state,
      frames: result.frames,
      index: 1,
      action: selected,
    };
    const restored = JSON.parse(
      JSON.stringify({ match: result.state, review }),
    );
    expect(restored.review.index).toBe(1);
    expect(restored.review.frames[1]).toEqual(review.frames[1]);
    expect(restored.match).toEqual(review.final);
    expect(getHighlights(restored.review)).toEqual(getHighlights(review));
    expect(
      renderToStaticMarkup(
        createElement(StepFlow, {
          review: restored.review,
          botPending: false,
          onProceed: () => {},
        }),
      ),
    ).toContain("KORAK 2 /");
  });

  it("does not invoke Proceed during initial render or merely because the bot is pending", () => {
    let calls = 0;
    const html = renderToStaticMarkup(
      createElement(StepFlow, {
        review: null,
        botPending: true,
        onProceed: () => calls++,
      }),
    );
    expect(calls).toBe(0);
    expect(html).toContain("AI ČEKA TVOJ PROCEED");
    expect(html).toContain('aria-label="Proceed"');
  });

  it("AI mulligan frame messages disclose counts, not private card names", () => {
    for (const seed of [11, 44, 73, 205]) {
      const before = applyAction(createGame({ seed }), "mulligan:");
      const selected = getBotAction(before, 1)!;
      const result = applyActionStepped(before, selected);
      const privateNames = [
        ...before.players[1].hand,
        ...result.state.players[1].hand,
      ].map((id) => getCard(id).name.replace(" (Starter)", ""));
      for (const frame of result.frames)
        for (const name of privateNames)
          expect(frame.label, `seed ${seed}`).not.toContain(name);
    }
  });
});
