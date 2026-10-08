import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PileDialog } from "../src/components/CardPiles";
import { MatchControls } from "../src/components/MatchControls";
import { getLegalActions } from "../src/game/engine";
import { selectedCardId } from "../src/game/flow";
import type { GameState, PlayerId } from "../src/game/types";
import { fixture, ogn } from "./fixtures/cards";

function trashGame(mode: "granted" | "riches", count = 1, grantedIndex = 0) {
  const game = fixture();
  game.players[0].discard = Array(count).fill(ogn(49));
  game.players[0].trashCards = game.players[0].discard.map((cardId, index) => ({
    id: `physical-trash-${index}`,
    cardId,
  }));
  if (mode === "granted")
    game.players[0].grantedFlow = [
      { trashId: `physical-trash-${grantedIndex}`, turn: game.turn },
    ];
  else
    game.gears.push({
      id: "endless-riches",
      owner: 0,
      cardId: "ven-022-166",
      ready: true,
    });
  return game;
}

function pile(game: GameState, player: PlayerId = 0) {
  return renderToStaticMarkup(
    createElement(PileDialog, {
      game,
      view: { player, zone: "trash" },
      setView: vi.fn(),
      legal: getLegalActions(game, 0),
      close: vi.fn(),
      inspect: vi.fn(),
      select: vi.fn(),
    }),
  );
}

describe.each(["granted", "riches"] as const)(
  "%s trash-play presentation",
  (mode) => {
    it("offers the direct pile affordance for an actual legal qualified source", () => {
      const game = trashGame(mode);
      expect(getLegalActions(game, 0)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "play",
            sourceId: `trash:0:${mode}`,
            cardId: ogn(49),
          }),
        ]),
      );
      expect(pile(game).match(/class="pile-play"/g)).toHaveLength(1);
    });

    it("shows the selected qualified source's public card and cost", () => {
      const game = trashGame(mode);
      const selected = `trash:0:${mode}`;
      expect(selectedCardId(game, selected)).toBeUndefined();
      const html = renderToStaticMarkup(
        createElement(MatchControls, {
          game,
          legal: getLegalActions(game, 0),
          selected,
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
      expect(html).toContain('data-decision-card="ogn-049-298"');
      expect(html).toContain("Printed cost");
      expect(html).toContain("Play Playful Phantom at your base");
    });

    it("keeps opponent trash read only despite matching viewer source indexes", () => {
      const game = trashGame(mode);
      game.players[1].discard = [ogn(49)];
      expect(pile(game, 1)).toContain("Playful Phantom");
      expect(pile(game, 1)).not.toContain('class="pile-play"');
    });
  },
);

it("does not give repeated or prefix-adjacent copies another copy's granted Flow", () => {
  const game = trashGame("granted", 11, 10);
  const legalSources = getLegalActions(game, 0)
    .filter((action) => action.sourceId?.startsWith("trash:"))
    .map((action) => action.sourceId);
  expect(legalSources.length).toBeGreaterThan(0);
  expect(new Set(legalSources)).toEqual(new Set(["trash:10:granted"]));
  expect(pile(game).match(/class="pile-play"/g)).toHaveLength(1);
});
