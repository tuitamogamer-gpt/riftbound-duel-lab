import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { getRuneChanges } from "../src/game/rune-presentation";
import { getEffectView } from "../src/game/effect-presentation";
import { getHighlights, type Review } from "../src/components/StepFlow";
import { RuneCard } from "../src/components/RuneCard";
import { createCombatFixture } from "./fixtures/combat";
import { translate } from "../src/i18n";

function opening() {
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
    index: result.frames.findIndex((f) => f.state.turnStep === "channel"),
    action,
  } satisfies Review;
}

describe("rune event feedback", () => {
  it("announces the actual channel owner and only newly channeled runes", () => {
    const review = opening();
    expect(review.action.player).toBe(1);
    expect(getRuneChanges(review).map((c) => [c.kind, c.player])).toEqual([
      ["channel", 0],
      ["channel", 0],
    ]);
    expect(getEffectView(review)).toMatchObject({ player: 0, runeOnly: true });
    expect(getHighlights(review).runes.size).toBe(2);
    review.index++;
    expect(getRuneChanges(review)).toEqual([]);
  });
  it("preserves a recycled rune as a noninteractive ghost and separates energy exhaustion", () => {
    const before = createCombatFixture();
    before.phase = "main";
    before.combat = null;
    before.players[0].hand = ["ogn-024-298"];
    before.players[0].energy = 0;
    before.players[0].power = 0;
    before.players[0].runes = Array.from({ length: 5 }, (_, i) => ({
      id: `pay-rune-${i}`,
      domain: "Fury",
      ready: true,
    }));
    const action = getLegalActions(before, 0).find(
      (a) => a.category === "play" && a.cardId === "ogn-024-298",
    )!;
    expect(action).toBeDefined();
    const result = applyActionStepped(before, action);
    expect(result.state).toEqual(applyAction(before, action));
    const review: Review = {
      before,
      final: result.state,
      frames: result.frames,
      index: 0,
      action,
    };
    review.index = result.frames.findIndex((_, index) =>
      getRuneChanges({ ...review, index }).some((c) => c.kind === "recycle"),
    );
    const changes = getRuneChanges(review);
    expect(changes.some((c) => c.kind === "exhaust")).toBe(true);
    const ghost = changes.find((c) => c.kind === "recycle")!;
    expect(ghost).toBeDefined();
    expect(
      review.frames[review.index].state.players[0].runes.some(
        (r) => r.id === ghost.rune.id,
      ),
    ).toBe(false);
    const html = renderToStaticMarkup(
      createElement(RuneCard, {
        rune: ghost.rune,
        event: ghost.kind,
        highlighted: true,
        inspect: () => {},
      }),
    );
    expect(html).toContain('data-rune-event="recycle"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("data-card-preview");
    expect(
      getEffectView(review)!.changes.some((c) => c.key.startsWith("Recycle")),
    ).toBe(true);
  });
  it("distinguishes ready and exhausted runes without lighting unchanged ones", () => {
    const review = opening();
    const before = structuredClone(review.final);
    before.players[1].runes = [
      { id: "ready-me", domain: "Calm", ready: false },
      { id: "spend-me", domain: "Mind", ready: true },
      { id: "keep", domain: "Body", ready: true },
    ];
    const now = structuredClone(before);
    now.players[1].runes[0].ready = true;
    now.players[1].runes[1].ready = false;
    const visible = {
      ...review,
      before,
      final: now,
      frames: [{ state: now, label: "Runes change" }],
      index: 0,
    };
    expect(
      getRuneChanges(visible).map((c) => [c.rune.id, c.kind, c.player]),
    ).toEqual([
      ["ready-me", "ready", 1],
      ["spend-me", "exhaust", 1],
    ]);
    expect(getHighlights(visible).runes.has("keep")).toBe(false);
    expect(
      translate("Recycle · {amount} rune(s) → deck", "sr", { amount: 2 }),
    ).toBe("Recycle · 2 runa → špil");
  });
});
