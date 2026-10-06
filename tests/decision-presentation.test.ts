import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardPiles, PileDialog } from "../src/components/CardPiles";
import { MatchControls } from "../src/components/MatchControls";
import { getLegalActions } from "../src/game/engine";
import { selectedCardId, sourceActions } from "../src/game/flow";
import { getActionStackView } from "../src/game/stack-presentation";
import { createCombatFixture } from "./fixtures/combat";
import type { Review } from "../src/components/StepFlow";

function choiceGame() {
  const game = createCombatFixture();
  game.phase = "choice";
  game.combat = null;
  game.pendingChoice = {
    kind: "spendBuff",
    player: 0,
    remaining: 1,
    sourceId: game.units[0].id,
    returnPhase: "main",
    returnPriority: 0,
    effect: { type: "spendBuff", optional: true },
  };
  game.units[1].buff = 1;
  return game;
}

describe("visible decision cards and piles", () => {
  it("keeps an ability source visible after its stack and review have finished", () => {
    const game = choiceGame();
    const view = getActionStackView(game, null)!;
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0].status).toBe("choosing");
    expect(view.cards[0].card.id).toBe(game.units[0].cardId);
    const html = renderToStaticMarkup(
      createElement(MatchControls, {
        game,
        legal: getLegalActions(game, 0),
        selected: null,
        target: null,
        clear: vi.fn(),
        act: vi.fn(),
        review: null,
        busy: false,
        paused: false,
        resume: vi.fn(),
        mulligan: [],
        inspect: vi.fn(),
      }),
    );
    expect(html).toContain(`data-decision-card="${game.units[0].cardId}"`);
    expect(html).toContain(`data-card-preview="${game.units[1].cardId}"`);
    expect(html).toContain('class="decision-option-art"');
  });

  it("uses a departed source snapshot and never an undisplayed future choice", () => {
    const game = choiceGame();
    const source = game.units.shift()!;
    game.pendingChoice!.sourceSnapshot = source;
    expect(getActionStackView(game, null)!.cards[0].card.id).toBe(
      source.cardId,
    );
    const shown = structuredClone(game);
    shown.pendingChoice = null;
    const review: Review = {
      before: shown,
      final: game,
      frames: [{ state: shown, label: "Before choice" }],
      index: 0,
      action: { id: "pass", label: "Pass", category: "pass", player: 0 },
    };
    expect(getActionStackView(game, review)).toBeNull();
  });

  it("does not duplicate the source when a choice begins in its resolution frame", () => {
    const game = choiceGame();
    const source = game.units[0];
    const before = structuredClone(game);
    before.pendingChoice = null;
    before.stack = [
      {
        id: "ability",
        cardId: source.cardId,
        sourceId: source.id,
        player: 0,
        kind: "ability",
        effects: [],
      },
    ];
    const review: Review = {
      before,
      final: game,
      frames: [
        {
          state: game,
          label: "Choose",
          effect: {
            cardId: source.cardId,
            sourceId: source.id,
            player: 0,
            stage: "applied",
          },
        },
      ],
      index: 0,
      action: { id: "pass", label: "Pass", category: "pass", player: 0 },
    };
    expect(getActionStackView(game, review)!.cards).toHaveLength(1);
  });

  it("shows public trash faces while keeping both decks private", () => {
    const game = choiceGame();
    game.players[0].discard = ["ogn-009-298", "ogn-058-298"];
    game.players[0].deck = ["ogn-083-298"];
    game.players[1].deck = ["ogn-088-298"];
    const piles = renderToStaticMarkup(
      createElement(CardPiles, { game, open: vi.fn() }),
    );
    expect(piles).toContain("Your deck · 1 cards");
    expect(piles).toContain("Your trash · 2 cards");
    for (const player of [0, 1] as const) {
      const html = renderToStaticMarkup(
        createElement(PileDialog, {
          game,
          view: { player, zone: "deck" },
          setView: vi.fn(),
          legal: [],
          close: vi.fn(),
          inspect: vi.fn(),
          select: vi.fn(),
        }),
      );
      expect(html).not.toContain("Consult the Past");
      expect(html).not.toContain("Mega-Mech");
      expect(html).not.toContain("data-card-preview");
    }
    const trash = renderToStaticMarkup(
      createElement(PileDialog, {
        game,
        view: { player: 0, zone: "trash" },
        setView: vi.fn(),
        legal: [],
        close: vi.fn(),
        inspect: vi.fn(),
        select: vi.fn(),
      }),
    );
    expect(trash).toContain('data-card-preview="ogn-058-298"');
    expect(trash.indexOf('data-card-preview="ogn-058-298"')).toBeLessThan(
      trash.indexOf('data-card-preview="ogn-009-298"'),
    );
    expect(trash).not.toContain("Consult the Past");
  });

  it("selects the exact trash copy and keeps the corresponding legal actions", () => {
    const game = choiceGame();
    game.phase = "main";
    game.pendingChoice = null;
    game.players[0].discard = ["ogn-009-298", "ogn-058-298", "ogn-009-298"];
    const actions = [0, 2].map((index) => ({
      id: `play-trash:${index}`,
      category: "play" as const,
      player: 0 as const,
      sourceId: `trash:${index}`,
      label: "Play",
    }));
    expect(selectedCardId(game, "trash:2")).toBe("ogn-009-298");
    expect(sourceActions(game, actions, "trash:2")).toEqual([actions[1]]);
  });
});
