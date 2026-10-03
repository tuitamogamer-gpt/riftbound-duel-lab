import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActionStack } from "../src/components/ActionStack";
import type { Review } from "../src/components/StepFlow";
import { createGame } from "../src/game/engine";
import { getActionStackView } from "../src/game/stack-presentation";
import type { GameState, StackItem } from "../src/game/types";

function item(
  id: string,
  cardId: string,
  player: 0 | 1,
  kind: StackItem["kind"] = "spell",
): StackItem {
  return { id, cardId, player, kind, effects: [] };
}
function reviewFor(before: GameState, shown: GameState): Review {
  return {
    before,
    final: structuredClone(shown),
    frames: [{ state: shown, label: "Shown frame" }],
    index: 0,
    action: { id: "pass", category: "pass", player: 0, label: "Pass" },
  };
}

describe("central action and reaction cards", () => {
  it("shows the live chain in last-played-first order with response attribution", () => {
    const game = createGame({ seed: 41 });
    game.stack = [
      item("original", "ogn-009-298", 0),
      item("reaction", "ogn-064-298", 1),
      item("reply", "ogn-058-298", 0),
    ];
    const view = getActionStackView(game, null)!;
    expect(view.cards.map((card) => card.id)).toEqual([
      "reply",
      "reaction",
      "original",
    ]);
    expect(view.cards.map((card) => card.status)).toEqual([
      "next",
      "waiting",
      "waiting",
    ]);
    expect(view.cards.map((card) => card.response)).toEqual([
      true,
      true,
      false,
    ]);
    expect(view.cards.every((card) => !card.entering)).toBe(true);
    const html = renderToStaticMarkup(
      createElement(ActionStack, { game, review: null, inspect: vi.fn() }),
    );
    expect(html).toContain('data-stack-status="next"');
    expect(html).toContain('data-card-preview="ogn-064-298"');
    expect(html.indexOf('data-stack-card="ogn-058-298"')).toBeLessThan(
      html.indexOf('data-stack-card="ogn-064-298"'),
    );
  });

  it("uses the displayed frame rather than the future game or review.final", () => {
    const before = createGame({ seed: 42 });
    const shown = structuredClone(before);
    shown.stack = [item("shown", "ogn-009-298", 0)];
    const future = structuredClone(shown);
    future.stack.push(item("future", "ogn-064-298", 1));
    const review = reviewFor(before, shown);
    review.final = future;
    expect(
      getActionStackView(future, review)!.cards.map((card) => card.id),
    ).toEqual(["shown"]);
    review.index = 1;
    expect(getActionStackView(future, review)).toBeNull();
  });

  it("keeps the popped spell visible beside the remaining chain during resolution", () => {
    const before = createGame({ seed: 43 });
    before.stack = [
      item("waiting", "ogn-009-298", 0),
      item("resolving", "ogn-064-298", 1),
    ];
    const shown = structuredClone(before);
    shown.resolving = [shown.stack.pop()!];
    const review = reviewFor(before, shown);
    review.frames[0].effect = {
      cardId: "ogn-064-298",
      player: 1,
      stage: "resolving",
    };
    expect(
      getActionStackView(shown, review)!.cards.map((card) => [
        card.id,
        card.status,
      ]),
    ).toEqual([
      ["resolving", "resolving"],
      ["waiting", "waiting"],
    ]);
  });

  it("retains an ability snapshot after the engine pops it without adding it to resolving", () => {
    const before = createGame({ seed: 44 });
    const ability = {
      ...item("ability", "ogs-021-024", 1, "trigger"),
      sourceId: "legend",
    };
    before.stack = [item("waiting", "ogn-009-298", 0), ability];
    const shown = structuredClone(before);
    shown.stack.pop();
    const review = reviewFor(before, shown);
    review.frames[0].effect = {
      cardId: ability.cardId,
      sourceId: "legend",
      player: 1,
      stage: "applied",
    };
    const view = getActionStackView(shown, review)!;
    expect(view.cards[0]).toMatchObject({
      id: "ability",
      kind: "trigger",
      status: "resolving",
      player: 1,
    });
    expect(view.cards[1].id).toBe("waiting");
  });

  it("keeps the last publicly resolved card through the review's final cleanup frame", () => {
    const before = createGame({ seed: 48 });
    before.stack = [item("resolved", "ogn-009-298", 0)];
    const shown = structuredClone(before);
    shown.stack = [];
    const review = reviewFor(before, shown);
    review.frames[0].effect = {
      cardId: "ogn-009-298",
      player: 0,
      stage: "applied",
    };
    review.frames.push({ state: shown, label: "Action complete" });
    review.index = 1;
    expect(getActionStackView(shown, review)!.cards[0]).toMatchObject({
      id: "resolved",
      status: "resolving",
    });
    expect(getActionStackView(shown, null)).toBeNull();
  });

  it("keeps two copies distinct when the newest spell finishes resolving", () => {
    const before = createGame({ seed: 49 });
    before.stack = [
      item("older-copy", "ogn-009-298", 0),
      item("newer-copy", "ogn-009-298", 0),
    ];
    const shown = structuredClone(before);
    shown.stack.pop();
    const review = reviewFor(before, shown);
    review.frames[0].effect = {
      cardId: "ogn-009-298",
      player: 0,
      stage: "applied",
    };
    expect(
      getActionStackView(shown, review)!.cards.map((card) => [
        card.id,
        card.status,
      ]),
    ).toEqual([
      ["newer-copy", "resolving"],
      ["older-copy", "waiting"],
    ]);
  });

  it("shows a new public spell play even if an older identical copy is already queued", () => {
    const before = createGame({ seed: 50 });
    before.stack = [item("older-copy", "ogn-009-298", 0)];
    const review = reviewFor(before, structuredClone(before));
    review.action = {
      id: "play:second-copy",
      category: "play",
      player: 0,
      cardId: "ogn-009-298",
      label: "Play",
    };
    const cards = getActionStackView(before, review)!.cards;
    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({
      status: "playing",
      entering: true,
      response: true,
    });
  });

  it("presents public unit and gear plays from the correct player for the whole review", () => {
    for (const [cardId, player] of [
      ["ogn-175-298", 0],
      ["ogn-017-298", 1],
    ] as const) {
      const before = createGame({ seed: 45 });
      const review = reviewFor(before, structuredClone(before));
      review.action = {
        id: `play:${cardId}`,
        category: "play",
        cardId,
        player,
        label: "Public play",
      };
      review.frames.push({
        state: structuredClone(before),
        label: "Enters play",
      });
      const entering = getActionStackView(before, review)!.cards[0];
      expect(entering).toMatchObject({
        player,
        status: "playing",
        entering: true,
      });
      const html = renderToStaticMarkup(
        createElement(ActionStack, { game: before, review }),
      );
      expect(html).toContain(`player-${player} is-playing is-entering`);
      expect(html).toContain(`data-card-preview="${cardId}"`);
      review.index = 1;
      expect(getActionStackView(before, review)!.cards[0]).toMatchObject({
        id: entering.id,
        status: "playing",
        entering: false,
      });
    }
  });

  it("never exposes a hidden play, private hand or a later frame's source", () => {
    const before = createGame({ seed: 46 });
    before.players[1].hand = ["ogn-199-298"];
    const review = reviewFor(before, structuredClone(before));
    review.action = {
      id: "hide:0:field:0",
      category: "play",
      player: 1,
      cardId: "ogn-199-298",
      label: "Hidden card",
    };
    review.frames.push({
      state: structuredClone(before),
      label: "Future reveal",
      effect: { cardId: "ogn-199-298", player: 1, stage: "applied" },
    });
    expect(getActionStackView(review.final, review)).toBeNull();
    expect(
      renderToStaticMarkup(
        createElement(ActionStack, { game: review.final, review }),
      ),
    ).toBe("");
    review.index = 1;
    expect(getActionStackView(review.final, review)!.cards[0].card.id).toBe(
      "ogn-199-298",
    );
  });

  it("does not duplicate the played unit when its own public effect is shown", () => {
    const before = createGame({ seed: 47 });
    const review = reviewFor(before, structuredClone(before));
    review.action = {
      id: "play:0",
      category: "play",
      player: 0,
      cardId: "ogn-175-298",
      label: "Play",
    };
    review.frames[0].effect = {
      cardId: "ogn-175-298",
      player: 0,
      stage: "applied",
    };
    expect(getActionStackView(before, review)!.cards).toHaveLength(1);
    expect(getActionStackView(before, review)!.cards[0].status).toBe("playing");
  });
});
