import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { findCard } from "../src/catalog";
import { ChampionZone } from "../src/components/ChampionZone";
import { HighlightContext, getHighlights } from "../src/components/StepFlow";
import { createGame, getLegalActions } from "../src/game/engine";
import type { GameAction, GameState, PlayerId } from "../src/game/types";

function readyGame() {
  const game = createGame({
    playerDeckId: "precon-viktor",
    botDeckId: "precon-lee-sin",
    seed: 29,
    firstPlayer: 0,
  });
  game.phase = "main";
  game.currentPlayer = 0;
  game.priorityPlayer = 0;
  game.turn = 4;
  for (const player of game.players) {
    player.mulliganDone = true;
    player.energy = 20;
    player.power = 20;
  }
  return game;
}

function render(
  game: GameState,
  player: PlayerId,
  legal: GameAction[] = [],
  selected: string | null = null,
  highlightedGame?: GameState,
) {
  const select = vi.fn();
  const inspect = vi.fn();
  const before = JSON.stringify(game);
  const component = createElement(ChampionZone, {
    game,
    player,
    legal,
    selected,
    select,
    inspect,
  });
  const html = renderToStaticMarkup(
    highlightedGame
      ? createElement(
          HighlightContext.Provider,
          { value: { ...getHighlights(null), game: highlightedGame } },
          component,
        )
      : component,
  );
  expect(JSON.stringify(game)).toBe(before);
  expect(select).not.toHaveBeenCalled();
  expect(inspect).not.toHaveBeenCalled();
  return html;
}

describe("public Legend and chosen champion zones", () => {
  it.each([0, 1] as const)(
    "shows player %i's actual pair as public cards, separate from the hand",
    (player) => {
      const game = readyGame();
      const owner = game.players[player];
      const html = render(game, player);
      expect(html).toContain(
        `aria-label="${player === 0 ? "Your" : "Opponent"} Legend and Champion"`,
      );
      for (const id of [owner.legendId, owner.championId]) {
        expect(html).toContain(`data-card-preview="${id}"`);
        expect(html).toContain(findCard(id)!.name);
      }
      expect(html.match(/class="game-card /g)).toHaveLength(2);
      expect(html).toContain("Legend zone");
      expect(html).toContain("Champion zone");
      expect(html).toContain("Separate from your hand.");
    },
  );

  it("never reveals the opponent's private hand, draw pile or hidden cards", () => {
    const game = readyGame();
    game.players[1].hand = ["ogn-088-298"];
    game.players[1].deck = ["ogn-114-298"];
    game.hidden = [
      {
        id: "secret-opponent-card",
        cardId: "ogn-096-298",
        owner: 1,
        location: "field:1",
        hiddenTurn: game.turn,
      },
    ];
    const html = render(game, 1);
    for (const id of ["ogn-088-298", "ogn-114-298", "ogn-096-298"]) {
      expect(html).not.toContain(id);
      expect(html).not.toContain(findCard(id)!.name);
    }
    expect(html).not.toContain("secret-opponent-card");
    expect(html).toContain(findCard(game.players[1].championId)!.name);
  });

  it.each([
    [-1, true],
    [0, false],
    [3, false],
    [4, false],
  ] as const)(
    "keeps Legend readiness tied to its ready state (%i) across an opponent turn",
    (usedTurn, ready) => {
      const game = readyGame();
      game.currentPlayer = 1;
      game.priorityPlayer = 1;
      game.players[0].legendUsedTurn = usedTurn;
      const html = render(game, 0);
      expect(html).toContain(`data-card-ready="${ready}"`);
      expect(html).toContain(ready ? ">Ready</span>" : ">Exhausted</span>");
      expect(html.includes(" exhausted")).toBe(!ready);
    },
  );

  it("offers the player's legal Legend and champion choices without acting on render", () => {
    const game = readyGame();
    const legal = getLegalActions(game, 0);
    expect(legal.some((action) => action.sourceId === "legend")).toBe(true);
    expect(legal.some((action) => action.sourceId === "champion")).toBe(true);
    const html = render(game, 0, legal, "legend");
    expect(html).toContain("Choose Legend ability");
    expect(html).toContain("Choose Champion play");
    expect(html).toContain("legend-zone is-selected");
  });

  it.each(["legend", "champion"])(
    "suppresses action prompts with no legal actions during review, even with %s selected",
    (selected) => {
      const game = readyGame();
      expect(getLegalActions(game, 0).length).toBeGreaterThan(0);
      const html = render(game, 0, [], selected);
      expect(html).not.toContain("setup-action");
      expect(html).not.toContain("Choose Legend ability");
      expect(html).not.toContain("Choose Champion play");
      expect(html).toContain("data-card-preview=");
    },
  );

  it("does not offer opponent actions or mirror player selection onto opponent cards", () => {
    const game = readyGame();
    game.currentPlayer = 1;
    game.priorityPlayer = 1;
    const legal = getLegalActions(game, 1);
    expect(legal.some((action) => action.sourceId === "champion")).toBe(true);
    const html = render(game, 1, legal, "champion");
    expect(html).not.toContain("setup-action");
    expect(html).not.toContain("is-selected");
    expect(html).toContain(findCard(game.players[1].championId)!.name);
  });

  it("does not promote the opponent's legal actions into player action prompts", () => {
    const game = readyGame();
    game.currentPlayer = 1;
    game.priorityPlayer = 1;
    const legal = getLegalActions(game, 1);
    expect(legal.some((action) => action.sourceId === "champion")).toBe(true);
    expect(render(game, 0, legal)).not.toContain("setup-action");
  });

  it("marks a played champion's zone empty and retains only its inspectable identity", () => {
    const game = readyGame();
    const legal = getLegalActions(game, 0);
    expect(legal.some((action) => action.sourceId === "champion")).toBe(true);
    game.players[0].championAvailable = false;
    const html = render(game, 0, legal);
    expect(html).toContain("chosen-champion-zone zone-empty");
    expect(html).toContain(">Empty</span>");
    expect(html).toContain("The chosen champion has left this zone.");
    expect(html).toContain(`data-card-preview="${game.players[0].championId}"`);
    expect(html.match(/class="game-card /g)).toHaveLength(1);
    expect(html).not.toContain("Choose Champion play");
  });

  it("renders the current review frame's readiness and availability rather than a later state", () => {
    const current = readyGame();
    current.players[0].legendUsedTurn = 3;
    const later = structuredClone(current);
    later.players[0].legendUsedTurn = -1;
    later.players[0].championAvailable = false;
    const html = render(current, 0, [], null, later);
    expect(html).toContain('data-card-ready="false"');
    expect(html).toContain(">Exhausted</span>");
    expect(html).toContain(">Available</span>");
    expect(html).not.toContain("zone-empty");
    expect(html.match(/class="game-card /g)).toHaveLength(2);
  });
});
